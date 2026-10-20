/* Narrow request reconstruction from python-garminconnect package 0.3.19, fixed snapshot
 * 5ddb9eecbc938b83ddb27a8f57552c556f112310. See PROVENANCE.md.
 * No native dependencies, TLS bypass, fingerprint rotation, fallback login,
 * credential logs, web-session fallback, or arbitrary-URL request interface.
 * Constructor requires an explicitly supplied transport; there is no global fetch fallback.
 */
import { SafeError, fail, opaqueString, boundedJSON } from './errors.mjs';

const SSO = 'https://sso.garmin.com';
const API = 'https://connectapi.garmin.com';
const DI = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const SERVICE = 'https://mobile.integration.garmin.com/gcm/ios';
const SSO_CLIENT = 'GCM_IOS_DARK';
const DI_CLIENT = 'GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2';
const GRANT = 'https://connectapi.garmin.com/di-oauth2-service/oauth/grant/service_ticket';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const NATIVE = Object.freeze({
  'User-Agent': 'GCM-Android-5.23',
  'X-Garmin-User-Agent': 'com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0',
  'X-Garmin-Paired-App-Version': '10861', 'X-Garmin-Client-Platform': 'Android',
  'X-App-Ver': '10861', 'X-Lang': 'en', 'X-GCExperience': 'GC5', 'Accept-Language': 'en-US,en;q=0.9',
});

const SSO_PATHS = new Set(['/mobile/api/login', '/mobile/api/mfa/verifyCode']);
function allowed(url, method, kind) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
  if (kind === 'sso') return method === 'POST' && url.origin === SSO && SSO_PATHS.has(url.pathname);
  if (kind === 'di') return method === 'POST' && url.href === DI;
  return kind === 'api' && method === 'GET' && url.origin === API && (
    url.pathname === '/userprofile-service/socialProfile' ||
    url.pathname === '/activitylist-service/activities/search/activities' ||
    /^\/wellness-service\/wellness\/dailyHeartRate\/[A-Za-z0-9_.%~-]+$/u.test(url.pathname)
  );
}

// RFC6265 subset, scoped exclusively to this SSO flow. Domain cookies never reach
// connectapi/diauth or the user's browser. Persist only the encrypted snapshot for MFA.
class SSOJar {
  #cookies = [];
  constructor(snapshot = []) {
    if (!Array.isArray(snapshot) || snapshot.length > 30) fail('invalid_pending_state');
    for (const c of snapshot) {
      if (!c || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/u.test(c.name) ||
          !/^[\x21-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]{0,4096}$/u.test(c.value) ||
          typeof c.path !== 'string' || !c.path.startsWith('/') || c.path.length > 1024 ||
          (c.expires !== null && !Number.isFinite(c.expires))) fail('invalid_pending_state');
      this.#cookies.push({ name: c.name, value: c.value, path: c.path, expires: c.expires });
    }
  }
  accept(headers, url, now) {
    const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie()
      : (typeof headers.getAll === 'function' ? headers.getAll('Set-Cookie') : []);
    if (headers.has('set-cookie') && !values.length) fail('cookie_api_unsupported', 502);
    for (const raw of values) {
      if (raw.length > 8192) fail('provider_cookie_rejected', 502);
      const [pair, ...attrs] = raw.split(';'), eq = pair.indexOf('=');
      if (eq < 1) fail('provider_cookie_rejected', 502);
      const c = { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(),
        path: url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/', expires: null };
      let maxAge = null;
      for (const attr of attrs) {
        const i = attr.indexOf('='), key = (i < 0 ? attr : attr.slice(0, i)).trim().toLowerCase();
        const value = i < 0 ? '' : attr.slice(i + 1).trim();
        if (key === 'domain' && !['sso.garmin.com', '.sso.garmin.com', 'garmin.com', '.garmin.com'].includes(value.toLowerCase())) fail('provider_cookie_domain_rejected', 502);
        if (key === 'path' && value.startsWith('/')) c.path = value;
        if (key === 'max-age' && /^-?\d+$/u.test(value)) maxAge = Number(value);
        if (key === 'expires' && Number.isFinite(Date.parse(value))) c.expires = Date.parse(value);
      }
      if (maxAge !== null) c.expires = now + maxAge * 1000;
      // Reuse validation without retaining arbitrary cookie attributes.
      new SSOJar([c]);
      this.#cookies = this.#cookies.filter(x => !(x.name === c.name && x.path === c.path));
      if (c.expires === null || c.expires > now) this.#cookies.push(c);
      if (this.#cookies.length > 30) fail('provider_cookie_rejected', 502);
    }
  }
  header(path, now) {
    return this.#cookies.filter(c => (c.expires === null || c.expires > now) &&
      (path === c.path || path.startsWith(c.path.endsWith('/') ? c.path : c.path + '/')))
      .sort((a,b) => b.path.length - a.path.length).map(c => `${c.name}=${c.value}`).join('; ');
  }
  snapshot() { return this.#cookies.map(c => ({ ...c })); }
}

function ssoURL(path) {
  const url = new URL(path, SSO);
  url.search = new URLSearchParams({ clientId: SSO_CLIENT, locale: 'en-US', service: SERVICE });
  return url;
}
function tokenState(body, previous = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !opaqueString(body.access_token) ||
      (body.token_type !== undefined && String(body.token_type).toLowerCase() !== 'bearer')) fail('provider_invalid_token_response', 502);
  const refresh = Object.hasOwn(body, 'refresh_token') ? body.refresh_token : previous?.refreshToken;
  if (!opaqueString(refresh)) fail('provider_missing_refresh_token', 502);
  // The decoded claim is only a hint; never proves authenticity or expands the configured client set.
  try {
    const segments = body.access_token.split('.');
    if (segments.length === 3) {
      const payload = JSON.parse(atob(segments[1].replace(/-/gu, '+').replace(/_/gu, '/')));
      if (payload.client_id && payload.client_id !== DI_CLIENT) fail('provider_client_changed_stop', 502);
    }
  } catch (error) { if (error instanceof SafeError) throw error; }
  return { kind: 'di', accessToken: body.access_token, refreshToken: refresh, clientId: DI_CLIENT };
}
function validState(value) {
  if (!value || value.kind !== 'di' || value.clientId !== DI_CLIENT ||
      !opaqueString(value.accessToken) || !opaqueString(value.refreshToken)) fail('invalid_credential_state', 503);
  return value;
}
function displayName(profile) {
  const value = profile?.displayName;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.~-]{1,160}$/u.test(value) || value === '.' || value === '..') fail('provider_profile_unusable', 502);
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
      !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value) fail('invalid_date');
  return value;
}

export class GarminProtocol {
  #fetch; #now;
  constructor({ fetchImpl, now = Date.now }) {
    if (typeof fetchImpl !== 'function') fail('transport_not_configured', 503);
    this.#fetch = fetchImpl; this.#now = now;
  }
  toJSON() { return { kind: 'GarminProtocol', credentials: 'redacted' }; }
  async #request(kind, url, { method, headers, body, timeoutMs = 20000 }, jar = null) {
    if (!allowed(url, method, kind)) fail('destination_rejected', 500);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) fail('invalid_request_timeout',500);
    const signal=AbortSignal.timeout(timeoutMs);
    headers = new Headers(headers);
    // Caller-supplied credentials are forbidden except constructed Authorization for DI/API.
    headers.delete('cookie');
    if (kind === 'sso') {
      headers.delete('authorization');
      const value = jar?.header(url.pathname, this.#now()); if (value) headers.set('Cookie', value);
    }
    let response;
    try {
      response = await this.#fetch(url.href, { method, headers, body, redirect: 'manual',
        credentials: 'omit', cache: 'no-store', signal });
    } catch { if(signal.aborted)fail('provider_timeout_stop',504); fail('provider_transport_uncertain_stop', 502); }
    // No request is replayed after any redirect, CAPTCHA, denial, rate limit, or unknown answer.
    if (response.status >= 300 && response.status < 400) fail('provider_redirect_stop', 502);
    if (response.status === 429) fail('provider_rate_limited_stop', 429);
    if (response.status === 403) fail('provider_challenge_stop', 403);
    if (response.status === 401) fail('provider_authentication_stop', 401);
    if (response.status !== 200) fail('provider_http_stop', 502);
    let result;
    try { result = await boundedJSON(response); } catch(error) { if(signal.aborted)fail('provider_timeout_stop',504); throw error; }
    if (result?.error?.['status-code'] === '429' || result?.error?.['status-code'] === 429) fail('provider_rate_limited_stop', 429);
    if (result && Object.hasOwn(result, 'error') && result.error != null) fail('provider_error_stop',502);
    if (result?.responseStatus?.type === 'CAPTCHA_REQUIRED') fail('provider_challenge_stop', 403);
    if (kind === 'sso') jar.accept(response.headers, url, this.#now());
    return result;
  }
  async #sso(path, body, jar) {
    return this.#request('sso', ssoURL(path), { method: 'POST', headers: {
      'User-Agent': IOS_UA, Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json', Origin: SSO,
    }, body: JSON.stringify(body) }, jar);
  }
  async #finishSSO(result, jar) {
    const type = result?.responseStatus?.type;
    if (type === 'MFA_REQUIRED') {
      const method = result.customerMfaInfo?.mfaLastMethodUsed ?? 'email';
      if (!['email', 'sms', 'totp', 'authenticator'].includes(method)) fail('provider_mfa_method_stop', 409);
      return { kind: 'pending_mfa', method, cookies: jar.snapshot(), expiresAt: this.#now() + 300000 };
    }
    if (type !== 'SUCCESSFUL' || !opaqueString(result.serviceTicketId, 4096)) fail('provider_authentication_stop', 401);
    const state = tokenState(await this.#request('di', new URL(DI), { method: 'POST',
      headers: { ...NATIVE, Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache',
        Authorization: 'Basic ' + btoa(DI_CLIENT + ':') },
      body: new URLSearchParams({ client_id: DI_CLIENT, service_ticket: result.serviceTicketId,
        grant_type: GRANT, service_url: SERVICE }),
    }));
    // Unlike upstream's permissive verification, inconclusive profile reads do not count as success.
    await this.profile(state);
    return state;
  }
  async login({ username, password }) {
    if (typeof username !== 'string' || !username || username.length > 320 || /[\x00-\x20\x7f]/u.test(username)
        || typeof password !== 'string' || !password || password.length > 1024 || /[\x00\r\n]/u.test(password)) fail('invalid_login_input');
    const jar = new SSOJar();
    const result = await this.#sso('/mobile/api/login', { username, password, rememberMe: true, captchaToken: '' }, jar);
    // No reference to username/password is retained after this call. JS strings cannot be reliably zeroized.
    return this.#finishSSO(result, jar);
  }
  async completeMFA(pending, code) {
    if (!pending || pending.kind !== 'pending_mfa' || !Number.isSafeInteger(pending.expiresAt) ||
        pending.expiresAt <= this.#now() || pending.expiresAt > this.#now() + 300000 ||
        !['email', 'sms', 'totp', 'authenticator'].includes(pending.method) ||
        typeof code !== 'string' || !/^[0-9A-Za-z]{4,12}$/u.test(code)) fail('invalid_mfa_input');
    const jar = new SSOJar(pending.cookies);
    const result = await this.#sso('/mobile/api/mfa/verifyCode', {
      mfaMethod: pending.method, mfaVerificationCode: code, rememberMyBrowser: true,
      reconsentList: [], mfaSetup: false,
    }, jar);
    if (result?.responseStatus?.type !== 'SUCCESSFUL') fail('provider_mfa_rejected_stop', 401);
    return this.#finishSSO(result, jar);
  }
  async refresh(state, { timeoutMs = 20000 } = {}) {
    validState(state);
    const result = await this.#request('di', new URL(DI), { method: 'POST', timeoutMs, headers: {
      ...NATIVE, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache', Authorization: 'Basic ' + btoa(state.clientId + ':'),
    }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: state.clientId,
      refresh_token: state.refreshToken }) });
    return tokenState(result, state);
  }
  async #read(state, path, params = {}, { timeoutMs = 20000 } = {}) {
    validState(state);
    const url = new URL(path, API); url.search = new URLSearchParams(params);
    return this.#request('api', url, { method: 'GET', timeoutMs, headers: {
      ...NATIVE, Accept: 'application/json', Authorization: 'Bearer ' + state.accessToken,
    } });
  }
  async profile(state,options) { return displayName(await this.#read(state, '/userprofile-service/socialProfile',{},options)); }
  async activitiesPage(state,startDate,endDate,start,{timeoutMs=20000}={}) {
    date(startDate);date(endDate);
    if(startDate>endDate||!Number.isSafeInteger(start)||start<0||start>=200)fail('invalid_activity_page');
    const rows=await this.#read(state,'/activitylist-service/activities/search/activities',
      {start:String(start),limit:'20',startDate,endDate},{timeoutMs});
    if(!Array.isArray(rows)||rows.length>20)fail('provider_activities_shape_changed',502);
    return rows;
  }
  async dailyHeartRate(state, day, name, options) {
    date(day); displayName({ displayName: name });
    const result = await this.#read(state, '/wellness-service/wellness/dailyHeartRate/' + encodeURIComponent(name), { date: day },options);
    if (!result || typeof result !== 'object' || Array.isArray(result)) fail('provider_heart_rate_shape_changed', 502);
    return result;
  }
}
