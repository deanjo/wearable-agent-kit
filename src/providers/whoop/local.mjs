import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createAuthorizationUrl, exchangeAuthorizationCode, refreshAccessToken,
  readWhoopSummary, WhoopError, WHOOP_SCOPES,
} from './index.mjs';

export const WHOOP_LOOPBACK_REDIRECT = 'http://127.0.0.1:8787/oauth/callback';
const LOCAL_ERRORS = Object.freeze({
  INVALID_LOCAL_CONFIGURATION: 'Invalid local WHOOP configuration.',
  AUTHORIZATION_REQUIRED: 'Run explicit WHOOP authorization before reading.',
  AUTHORIZATION_CANCELLED: 'WHOOP authorization was cancelled or rejected.',
  AUTHORIZATION_TIMEOUT: 'WHOOP authorization callback timed out.',
  CALLBACK_REJECTED: 'WHOOP authorization callback rejected.',
  CALLBACK_UNAVAILABLE: 'The WHOOP loopback callback could not start.',
  REFRESH_BLOCKED: 'WHOOP refresh is uncertain or interrupted. Explicit reauthorization is required; the old refresh token will not be replayed.',
  INVALID_STORED_SESSION: 'The stored WHOOP session is invalid. Explicit reauthorization is required.',
});

export class LocalWhoopError extends Error {
  constructor(code) {
    const safe = Object.hasOwn(LOCAL_ERRORS, code) ? code : 'INVALID_LOCAL_CONFIGURATION';
    super(LOCAL_ERRORS[safe]);
    this.name = 'LocalWhoopError';
    this.code = safe;
  }
  toJSON() { return { code: this.code, message: this.message }; }
}

function milliseconds(now = Date.now()) {
  const input = typeof now === 'function' ? now() : now;
  const value = input instanceof Date ? input.getTime() : typeof input === 'string' ? Date.parse(input) : input;
  if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) throw new LocalWhoopError('INVALID_LOCAL_CONFIGURATION');
  return value;
}
function validStore(store) {
  if (!store || ['load', 'save', 'withLock'].some(method => typeof store[method] !== 'function')) {
    throw new LocalWhoopError('INVALID_LOCAL_CONFIGURATION');
  }
}
function redirect(value) {
  let uri;
  try { uri = new URL(value); } catch { throw new LocalWhoopError('INVALID_LOCAL_CONFIGURATION'); }
  if (uri.protocol !== 'http:' || uri.hostname !== '127.0.0.1' || uri.pathname !== '/oauth/callback'
      || !uri.port || uri.search || uri.hash || uri.username || uri.password) throw new LocalWhoopError('INVALID_LOCAL_CONFIGURATION');
  return uri;
}
function constantTimeState(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || actual.length > 128) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function authorizationCode(callbackUrl, redirectUri, state) {
  let callback;
  try {
    if (typeof callbackUrl !== 'string' || callbackUrl.length > 20_000) throw Error();
    callback = new URL(callbackUrl);
  } catch { throw new LocalWhoopError('CALLBACK_REJECTED'); }
  const expected = redirect(redirectUri);
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.hash
      || callback.username || callback.password || callback.searchParams.getAll('state').length !== 1
      || !constantTimeState(callback.searchParams.get('state'), state)
      || callback.searchParams.getAll('code').length > 1 || callback.searchParams.getAll('error').length > 1) {
    throw new LocalWhoopError('CALLBACK_REJECTED');
  }
  if (callback.searchParams.has('error')) throw new LocalWhoopError('AUTHORIZATION_CANCELLED');
  const code = callback.searchParams.get('code');
  if (typeof code !== 'string' || !code || code.length > 16384 || /[\u0000-\u001f\u007f]/u.test(code)) {
    throw new LocalWhoopError('CALLBACK_REJECTED');
  }
  return code;
}

/**
 * Starts a loopback-only callback listener before printing the consent URL.
 * Browser opening remains a deliberate user action. No request URL/code is logged.
 */
export async function receiveLoopbackAuthorization({
  authorizationUrl, redirectUri, state, print = text => process.stderr.write(`${text}\n`), timeoutMs = 300_000,
}) {
  const uri = redirect(redirectUri);
  if (typeof print !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new LocalWhoopError('INVALID_LOCAL_CONFIGURATION');
  }
  let server;
  let timer;
  let settled = false;
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  // Ensure a listener error before the caller awaits result cannot be unhandled.
  void result.catch(() => {});
  const settle = (error, value) => {
    if (settled) return;
    settled = true;
    if (error) rejectResult(error); else resolveResult(value);
  };
  try {
    server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      response.setHeader('Connection', 'close');
      const path = typeof request.url === 'string' ? request.url.split('?')[0] : '';
      if (path !== uri.pathname) { response.writeHead(404); response.end('Not found.'); return; }
      if (settled || request.method !== 'GET' || request.headers.host !== uri.host
          || !['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)
          || request.url.length > 20_000) {
        response.writeHead(400); response.end('Authorization callback rejected.');
        settle(new LocalWhoopError('CALLBACK_REJECTED'));
        return;
      }
      try {
        const callback = `${uri.origin}${request.url}`;
        authorizationCode(callback, redirectUri, state);
        response.writeHead(200); response.end('Authorization received. You may close this tab.');
        settle(null, callback);
      } catch (error) {
        response.writeHead(400); response.end('Authorization callback rejected.');
        settle(error instanceof LocalWhoopError ? error : new LocalWhoopError('CALLBACK_REJECTED'));
      }
    });
    server.requestTimeout = 10_000;
    server.headersTimeout = 10_000;
    server.maxHeadersCount = 30;
    server.on('error', () => settle(new LocalWhoopError('CALLBACK_UNAVAILABLE')));
    await new Promise((resolve, reject) => {
      const failed = () => reject(new LocalWhoopError('CALLBACK_UNAVAILABLE'));
      server.once('error', failed);
      server.listen(Number(uri.port), '127.0.0.1', () => { server.off('error', failed); resolve(); });
    });
    timer = setTimeout(() => settle(new LocalWhoopError('AUTHORIZATION_TIMEOUT')), timeoutMs);
    await print(`Open this WHOOP consent URL in your browser:\n${authorizationUrl}\nWaiting for the registered loopback callback at ${redirectUri}.`);
    return await result;
  } finally {
    clearTimeout(timer);
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(() => resolve()));
    }
  }
}

/**
 * Explicit interactive auth. Secrets are never returned in the result or printed.
 * store must be an encrypted single-user store with a non-reentrant exclusive lock.
 * receiveAuthorization is injectable for synthetic testing, and returns a full
 * callback URL. State and callback destination are still validated here.
 */
export async function authenticateWhoop({
  store, promptSecret, promptText, transport,
  clientId, redirectUri = WHOOP_LOOPBACK_REDIRECT,
  print = text => process.stderr.write(`${text}\n`),
  receiveAuthorization = receiveLoopbackAuthorization, now,
} = {}) {
  validStore(store);
  redirect(redirectUri);
  if (typeof promptSecret !== 'function' || typeof promptText !== 'function'
      || typeof transport !== 'function' || typeof receiveAuthorization !== 'function') {
    throw new LocalWhoopError('INVALID_LOCAL_CONFIGURATION');
  }
  return store.withLock(async () => {
    // Unlock an existing vault before allowing explicit replacement. A mistyped
    // passphrase must never overwrite an otherwise recoverable session.
    await store.load();
    const id = clientId ?? await promptText('WHOOP OAuth client ID: ');
    const clientSecret = await promptSecret('WHOOP OAuth client secret (hidden): ');
    if (typeof clientSecret !== 'string' || !clientSecret || clientSecret.length > 16384 || /[\u0000-\u001f\u007f]/u.test(clientSecret)) {
      throw new LocalWhoopError('INVALID_LOCAL_CONFIGURATION');
    }
    const state = randomBytes(32).toString('base64url');
    const authorizationUrl = createAuthorizationUrl({ clientId: id, redirectUri, state });
    const callback = await receiveAuthorization({ authorizationUrl, redirectUri, state, print });
    const code = authorizationCode(callback, redirectUri, state);
    const tokens = await exchangeAuthorizationCode({ transport, clientId: id, clientSecret, redirectUri, code, now });
    await store.save({ version: 1, provider: 'whoop', phase: 'idle', clientId: id, clientSecret, redirectUri, tokens });
    return { provider: 'whoop', status: 'authorized', expiresAt: tokens.expiresAt };
  });
}

function sessionRecord(record) {
  if (!record) throw new LocalWhoopError('AUTHORIZATION_REQUIRED');
  if (record.phase === 'dispatched') throw new LocalWhoopError('REFRESH_BLOCKED');
  if (record.phase === 'reauthorization_required') throw new LocalWhoopError('AUTHORIZATION_REQUIRED');
  if (record.version !== 1 || record.provider !== 'whoop' || record.phase !== 'idle'
      || typeof record.clientId !== 'string' || !record.clientId || record.clientId.length > 256
      || typeof record.clientSecret !== 'string' || !record.clientSecret || record.clientSecret.length > 16384
      || !record.tokens || typeof record.tokens.accessToken !== 'string' || typeof record.tokens.refreshToken !== 'string'
      || !Number.isSafeInteger(record.tokens.expiresAt) || !Array.isArray(record.tokens.scopes)
      || WHOOP_SCOPES.some(scope => !record.tokens.scopes.includes(scope))
      || record.tokens.scopes.some(scope => !WHOOP_SCOPES.includes(scope))) throw new LocalWhoopError('INVALID_STORED_SESSION');
  try { redirect(record.redirectUri); } catch { throw new LocalWhoopError('INVALID_STORED_SESSION'); }
  return record;
}

/**
 * Cold-restores encrypted credentials, refreshes expired tokens under the store
 * lock, and reads. Persisting phase=dispatched BEFORE refresh makes interruption
 * fail closed. Neither an uncertain refresh nor a 401 ever starts a login.
 */
export async function readLocalWhoop({ store, transport, now, start, end } = {}) {
  validStore(store);
  if (typeof transport !== 'function') throw new LocalWhoopError('INVALID_LOCAL_CONFIGURATION');
  return store.withLock(async () => {
    let record = sessionRecord(await store.load());
    const at = milliseconds(now);
    if (record.tokens.expiresAt <= at + 60_000) {
      await store.save({ ...record, phase: 'dispatched' });
      try {
        const tokens = await refreshAccessToken({
          transport, clientId: record.clientId, clientSecret: record.clientSecret,
          refreshToken: record.tokens.refreshToken, now: at,
        });
        record = { ...record, phase: 'idle', tokens };
        await store.save(record);
      } catch {
        // Do not roll back: the provider may already have rotated the credential.
        throw new LocalWhoopError('REFRESH_BLOCKED');
      }
    }
    try {
      return await readWhoopSummary({ transport, accessToken: record.tokens.accessToken, start, end, now: at });
    } catch (error) {
      if (error instanceof WhoopError && error.code === 'AUTHORIZATION_REQUIRED') {
        await store.save({ ...record, phase: 'reauthorization_required', tokens: null });
      }
      throw error;
    }
  });
}
