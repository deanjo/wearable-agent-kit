/**
 * Bounded WHOOP v2 reader. A transport must be explicitly injected; importing this
 * module never opens a socket, reads credentials, or performs authentication.
 *
 * API reference: https://developer.whoop.com/api/
 * OAuth reference: https://developer.whoop.com/docs/developing/oauth/
 */
const ORIGIN = 'https://api.prod.whoop.com';
const AUTH_URL = `${ORIGIN}/oauth/oauth2/auth`;
const TOKEN_URL = `${ORIGIN}/oauth/oauth2/token`;
const DAY = 86_400_000;
export const WHOOP_LIMITS = Object.freeze({ pages: 3, pageSize: 25, maxWindowDays: 31, timeoutMs: 15_000 });
export const WHOOP_SCOPES = Object.freeze([
  'read:cycles', 'read:recovery', 'read:sleep', 'read:workout', 'read:body_measurement', 'offline',
]);
const PATHS = Object.freeze({
  cycles: '/developer/v2/cycle',
  recovery: '/developer/v2/recovery',
  sleep: '/developer/v2/activity/sleep',
  workout: '/developer/v2/activity/workout',
  body_measurement: '/developer/v2/user/measurement/body',
});
const FIELDS = Object.freeze({
  cycles: ['strain', 'kilojoule', 'average_heart_rate', 'max_heart_rate'],
  recovery: ['recovery_score', 'resting_heart_rate', 'hrv_rmssd_milli', 'spo2_percentage', 'skin_temp_celsius'],
  sleep: ['sleep_performance_percentage', 'sleep_consistency_percentage', 'sleep_efficiency_percentage', 'respiratory_rate'],
  workout: ['strain', 'average_heart_rate', 'max_heart_rate', 'kilojoule', 'distance_meter'],
  body_measurement: ['height_meter', 'weight_kilogram', 'max_heart_rate'],
});
const STAGES = [
  'total_in_bed_time_milli', 'total_awake_time_milli', 'total_no_data_time_milli',
  'total_light_sleep_time_milli', 'total_slow_wave_sleep_time_milli', 'total_rem_sleep_time_milli',
];
const ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'Invalid WHOOP request input.',
  TRANSPORT_REQUIRED: 'An explicit WHOOP transport is required.',
  TRANSPORT_FAILED: 'WHOOP could not be reached.',
  REQUEST_TIMEOUT: 'WHOOP request timed out.',
  AUTHORIZATION_REQUIRED: 'WHOOP authorization is required. No automatic login was attempted.',
  FORBIDDEN: 'WHOOP access to this resource is not permitted.',
  RATE_LIMITED: 'WHOOP rate limit reached. No automatic retry was attempted.',
  REDIRECT_REJECTED: 'WHOOP redirect rejected.',
  HTTP_ERROR: 'WHOOP returned an unsuccessful response.',
  INVALID_RESPONSE: 'WHOOP returned an invalid response.',
});

/** Safe errors intentionally exclude URLs, tokens, provider bodies, and causes. */
export class WhoopError extends Error {
  constructor(code, status) {
    const safeCode = Object.hasOwn(ERROR_MESSAGES, code) ? code : 'INVALID_RESPONSE';
    super(ERROR_MESSAGES[safeCode]);
    this.name = 'WhoopError';
    this.code = safeCode;
    if (Number.isInteger(status) && status >= 100 && status <= 599) this.status = status;
  }
  toJSON() { return { code: this.code, message: this.message, ...(this.status ? { status: this.status } : {}) }; }
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function string(value, max = 16384) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
}
function token(value) { return string(value) && /^[A-Za-z0-9._~+/-]+=*$/u.test(value); }
function requireTransport(transport) {
  if (typeof transport !== 'function') throw new WhoopError('TRANSPORT_REQUIRED');
}
function instant(value) {
  if (typeof value !== 'string' || value.length > 40
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
      || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
function clockValue(now = Date.now()) {
  const value = typeof now === 'function' ? now() : now;
  const millis = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
  if (typeof millis !== 'number' || !Number.isSafeInteger(millis) || !Number.isFinite(new Date(millis).getTime())) {
    throw new WhoopError('INVALID_INPUT');
  }
  return millis;
}
function callbackUri(value) {
  if (!string(value, 2048)) throw new WhoopError('INVALID_INPUT');
  let uri;
  try { uri = new URL(value); } catch { throw new WhoopError('INVALID_INPUT'); }
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(uri.hostname);
  if ((uri.protocol !== 'https:' && !(uri.protocol === 'http:' && loopback))
      || uri.username || uri.password || uri.hash) throw new WhoopError('INVALID_INPUT');
  return uri.href;
}

/** Caller must generate unpredictable state and verify the exact callback state. */
export function createAuthorizationUrl({ clientId, redirectUri, state } = {}) {
  if (!string(clientId, 256) || typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/u.test(state)) {
    throw new WhoopError('INVALID_INPUT');
  }
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: callbackUri(redirectUri), response_type: 'code',
    scope: WHOOP_SCOPES.join(' '), state,
  }).toString();
  return url.href;
}

async function requestJson(transport, url, init, maxBytes = 1_048_576) {
  requireTransport(transport);
  const endpoint = new URL(url);
  if (endpoint.origin !== ORIGIN || endpoint.username || endpoint.password
      || ![...Object.values(PATHS), '/oauth/oauth2/token'].includes(endpoint.pathname)) {
    throw new WhoopError('INVALID_INPUT');
  }
  const controller = new AbortController();
  let response;
  let reader;
  let completed = false;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new WhoopError('REQUEST_TIMEOUT'));
    }, WHOOP_LIMITS.timeoutMs);
  });
  try {
    response = await Promise.race([
      Promise.resolve().then(() => transport(url, { ...init, redirect: 'manual', signal: controller.signal })),
      deadline,
    ]);
    if (!response || !Number.isInteger(response.status)) throw new WhoopError('INVALID_RESPONSE');
    if (response.redirected || (response.url && response.url !== endpoint.href)
        || (response.status >= 300 && response.status <= 399)) throw new WhoopError('REDIRECT_REJECTED');
    if (response.status === 401) throw new WhoopError('AUTHORIZATION_REQUIRED', 401);
    if (response.status === 403) throw new WhoopError('FORBIDDEN', 403);
    if (response.status === 429) throw new WhoopError('RATE_LIMITED', 429);
    if (response.status < 200 || response.status >= 300) throw new WhoopError('HTTP_ERROR', response.status);
    if (!response.body || typeof response.body.getReader !== 'function') throw new WhoopError('INVALID_RESPONSE');
    const length = response.headers?.get('content-length');
    if (length && (!/^\d+$/u.test(length) || Number(length) > maxBytes)) throw new WhoopError('INVALID_RESPONSE');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let text = '';
    for (;;) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) { completed = true; break; }
      if (!(part.value instanceof Uint8Array)) throw new WhoopError('INVALID_RESPONSE');
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw new WhoopError('INVALID_RESPONSE');
      try { text += decoder.decode(part.value, { stream: true }); } catch { throw new WhoopError('INVALID_RESPONSE'); }
    }
    try { text += decoder.decode(); } catch { throw new WhoopError('INVALID_RESPONSE'); }
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new WhoopError('INVALID_RESPONSE'); }
    if (!object(parsed)) throw new WhoopError('INVALID_RESPONSE');
    return parsed;
  } catch (error) {
    if (error instanceof WhoopError) throw error;
    throw new WhoopError(controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'TRANSPORT_FAILED');
  } finally {
    clearTimeout(timer);
    if (reader) {
      if (!completed) void reader.cancel().catch(() => {});
      try { reader.releaseLock(); } catch { /* a pending read must not leak an unsafe error */ }
    } else if (response?.body && typeof response.body.cancel === 'function') {
      void response.body.cancel().catch(() => {});
    }
  }
}

async function requestTokens({ transport, clientId, clientSecret, fields, now }) {
  requireTransport(transport);
  if (!string(clientId, 256) || !string(clientSecret)) throw new WhoopError('INVALID_INPUT');
  const collectedAt = clockValue(now);
  const raw = await requestJson(transport, TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ ...fields, client_id: clientId, client_secret: clientSecret }).toString(),
  }, 65_536);
  if (!token(raw.access_token) || !token(raw.refresh_token) || raw.token_type?.toLowerCase?.() !== 'bearer'
      || !Number.isSafeInteger(raw.expires_in) || raw.expires_in <= 0
      || !string(raw.scope, 1024)) throw new WhoopError('INVALID_RESPONSE');
  const scopes = [...new Set(raw.scope.split(/\s+/u).filter(Boolean))];
  if (scopes.some(scope => !WHOOP_SCOPES.includes(scope))
      || WHOOP_SCOPES.some(scope => !scopes.includes(scope))) throw new WhoopError('INVALID_RESPONSE');
  const expiresAt = collectedAt + raw.expires_in * 1000;
  if (!Number.isSafeInteger(expiresAt) || !Number.isFinite(new Date(expiresAt).getTime())) throw new WhoopError('INVALID_RESPONSE');
  return { accessToken: raw.access_token, refreshToken: raw.refresh_token, tokenType: 'Bearer', expiresAt, scopes };
}

/** Returns credentials to the caller; this function never persists or prints them. */
export function exchangeAuthorizationCode({ transport, clientId, clientSecret, redirectUri, code, now } = {}) {
  if (!string(code)) throw new WhoopError('INVALID_INPUT');
  return requestTokens({
    transport, clientId, clientSecret, now,
    fields: { grant_type: 'authorization_code', code, redirect_uri: callbackUri(redirectUri) },
  });
}

/** Refresh is explicit. The caller must serialize and atomically persist rotation. */
export function refreshAccessToken({ transport, clientId, clientSecret, refreshToken, now } = {}) {
  if (!token(refreshToken)) throw new WhoopError('INVALID_INPUT');
  return requestTokens({
    transport, clientId, clientSecret, now,
    fields: { grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'offline' },
  });
}

function numeric(value, nonnegative = false) {
  return typeof value === 'number' && Number.isFinite(value) && (!nonnegative || value >= 0) ? value : null;
}
function uuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value) ? value.toLowerCase() : null;
}
function cycleId(value) { return Number.isSafeInteger(value) && value >= 0 ? value : null; }
function project(resource, raw, now) {
  const body = resource === 'body_measurement';
  const recovery = resource === 'recovery';
  const state = body ? 'NOT_APPLICABLE'
    : ['SCORED', 'PENDING_SCORE', 'UNSCORABLE'].includes(raw.score_state) ? raw.score_state : 'UNKNOWN';
  const scored = state === 'SCORED' || body;
  const score = body ? raw : object(raw.score) ? raw.score : {};
  const values = {};
  const qualityFlags = [];
  for (const field of FIELDS[resource]) values[field] = scored ? numeric(score[field], field !== 'skin_temp_celsius') : null;
  for (const field of Object.keys(values)) {
    if ((field.endsWith('_percentage') || field === 'recovery_score') && values[field] > 100) values[field] = null;
  }
  if (resource === 'sleep') {
    const stages = object(score.stage_summary) ? score.stage_summary : {};
    for (const field of STAGES) values[field] = scored ? numeric(stages[field], true) : null;
    const parts = ['total_light_sleep_time_milli', 'total_slow_wave_sleep_time_milli', 'total_rem_sleep_time_milli'].map(field => values[field]);
    values.total_sleep_time_milli = parts.every(value => value !== null) ? numeric(parts.reduce((a, b) => a + b, 0), true) : null;
    if (values.total_sleep_time_milli !== null && values.total_in_bed_time_milli !== null
        && values.total_sleep_time_milli > values.total_in_bed_time_milli) {
      values.total_sleep_time_milli = null;
      qualityFlags.push('sleep_stages_exceed_time_in_bed');
    }
  }
  if (resource === 'cycles') values.step_count = Number.isSafeInteger(raw.step_count) && raw.step_count >= 0 ? raw.step_count : null;
  const start = body || recovery ? null : instant(raw.start);
  const end = body || recovery ? null : instant(raw.end);
  if (start && end && Date.parse(end) < Date.parse(start)) qualityFlags.push('end_precedes_start');
  const observedAt = qualityFlags.includes('end_precedes_start') ? null : end ?? start;
  const future = observedAt !== null && Date.parse(observedAt) > now;
  if (future) qualityFlags.push('future_record_timestamp');
  const dto = {
    start, end, updatedAt: body ? null : instant(raw.updated_at),
    timezoneOffset: !body && !recovery && typeof raw.timezone_offset === 'string'
      && /^[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00)$/u.test(raw.timezone_offset) ? raw.timezone_offset : null,
    scoreState: state, values, missingFields: Object.keys(values).filter(field => values[field] === null),
    freshness: {
      measurementAt: observedAt,
      basis: observedAt ? (end ? 'record_end' : 'record_start') : 'unknown',
      ageHours: observedAt && !future ? (now - Date.parse(observedAt)) / 3_600_000 : null,
    },
    qualityFlags,
  };
  if (resource === 'sleep') dto.nap = typeof raw.nap === 'boolean' ? raw.nap : null;
  if (recovery) dto.userCalibrating = scored && typeof score.user_calibrating === 'boolean' ? score.user_calibrating : null;
  // Link keys are ephemeral and never included in the public DTO.
  return { dto, sleepKey: uuid(recovery ? raw.sleep_id : raw.id), cycleKey: cycleId(raw.cycle_id) };
}

async function collect({ resource, transport, accessToken, window, now }) {
  const rows = [];
  let pages = 0;
  let nextToken;
  let error = null;
  const seen = new Set();
  try {
    do {
      const url = new URL(PATHS[resource], ORIGIN);
      if (resource !== 'body_measurement') {
        url.searchParams.set('start', window.start);
        url.searchParams.set('end', window.end);
        url.searchParams.set('limit', String(WHOOP_LIMITS.pageSize));
        if (nextToken) url.searchParams.set('nextToken', nextToken);
      }
      const raw = await requestJson(transport, url.href, {
        method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });
      pages++;
      if (resource === 'body_measurement') {
        const row = project(resource, raw, now);
        if (Object.values(row.dto.values).some(value => value !== null)) rows.push(row);
        break;
      }
      if (!Array.isArray(raw.records) || raw.records.length > WHOOP_LIMITS.pageSize
          || raw.records.some(record => !object(record))) throw new WhoopError('INVALID_RESPONSE');
      const cursor = raw.next_token;
      if (cursor !== null && cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 2048
          || /[\u0000-\u001f\u007f]/u.test(cursor))) throw new WhoopError('INVALID_RESPONSE');
      const candidate = cursor || undefined;
      if (candidate && seen.has(candidate)) throw new WhoopError('INVALID_RESPONSE');
      if (candidate) seen.add(candidate);
      rows.push(...raw.records.map(record => project(resource, record, now)));
      nextToken = candidate;
    } while (nextToken && pages < WHOOP_LIMITS.pages);
  } catch (cause) {
    if (cause instanceof WhoopError && cause.code === 'AUTHORIZATION_REQUIRED') throw cause;
    error = (cause instanceof WhoopError ? cause : new WhoopError('INVALID_RESPONSE')).toJSON();
  }
  const truncated = !error && Boolean(nextToken);
  const records = rows.map(row => row.dto);
  return {
    rows,
    result: {
      resource,
      status: error ? (records.length ? 'partial' : 'unavailable') : records.length ? 'available' : 'no_records',
      error, pages, recordCount: records.length, truncated, completeWithinWindow: !error && !truncated,
      window: resource === 'body_measurement' ? null : window,
      latest: records[0] ?? null, records,
    },
  };
}

function linkRecoveries(recoveries, sleeps, primarySleep) {
  for (const row of recoveries) {
    const matching = row.sleepKey ? sleeps.filter(sleep => sleep.sleepKey === row.sleepKey) : [];
    const match = matching.length === 1 ? matching[0] : null;
    const inconsistent = match && row.cycleKey !== null && match.cycleKey !== null && row.cycleKey !== match.cycleKey;
    const linked = match && !inconsistent ? match : null;
    row.dto.sleepLink = {
      status: !row.sleepKey ? 'missing_sleep_id' : matching.length > 1 ? 'ambiguous'
        : inconsistent ? 'inconsistent_cycle' : linked ? 'matched_sleep' : 'unmatched',
      matchesPrimarySleep: linked ? linked.dto === primarySleep : null,
      associatedSleep: linked ? { start: linked.dto.start, end: linked.dto.end, nap: linked.dto.nap } : null,
    };
  }
}

/**
 * Fetch at most 13 pages (4 collections × 3 pages plus body measurements).
 * Missing scores remain null; collection/update times are never measurement times.
 * 401 aborts the entire read. Other failures are explicit per-resource results.
 */
export async function readWhoopSummary({ transport, accessToken, start, end, now } = {}) {
  requireTransport(transport);
  if (!token(accessToken)) throw new WhoopError('INVALID_INPUT');
  const collectedAt = clockValue(now);
  const until = end === undefined ? new Date(collectedAt).toISOString() : instant(end);
  const from = start === undefined && until ? new Date(Date.parse(until) - 7 * DAY).toISOString() : instant(start);
  if (!from || !until || Date.parse(from) >= Date.parse(until) || Date.parse(until) > collectedAt
      || Date.parse(until) - Date.parse(from) > WHOOP_LIMITS.maxWindowDays * DAY) throw new WhoopError('INVALID_INPUT');
  const window = { start: from, end: until };
  const collections = {};
  // Sequential requests make rate use and authorization termination predictable.
  for (const resource of Object.keys(PATHS)) {
    collections[resource] = await collect({ resource, transport, accessToken, window, now: collectedAt });
  }
  const primarySleep = collections.sleep.rows.find(row => row.dto.nap === false)?.dto ?? null;
  const latestNap = collections.sleep.rows.find(row => row.dto.nap === true)?.dto ?? null;
  linkRecoveries(collections.recovery.rows, collections.sleep.rows, primarySleep);
  const resources = Object.fromEntries(Object.entries(collections).map(([name, value]) => [name, value.result]));
  const values = Object.values(resources);
  const status = values.every(value => value.status === 'unavailable') ? 'unavailable'
    : values.some(value => value.error || value.truncated) ? 'partial'
      : values.every(value => value.status === 'no_records') ? 'no_records' : 'available';
  return {
    provider: 'whoop', status, collectionStartedAt: new Date(collectedAt).toISOString(), window,
    fullHistoricalSync: false, resources,
    highlights: { primarySleep, latestNap, recovery: resources.recovery.latest },
    coverage: {
      implemented: Object.keys(PATHS),
      notImplemented: ['personal_baselines', 'historical_backfill', 'workout_heart_rate_zones', 'sleep_need_breakdown', 'workout_sport_labels'],
      notProvidedByThisIntegration: ['continuous_heart_rate', 'live_sensor_stream', 'app_coach', 'journal', 'profile'],
      bounds: { pagesPerCollection: WHOOP_LIMITS.pages, recordsPerPage: WHOOP_LIMITS.pageSize, maxWindowDays: WHOOP_LIMITS.maxWindowDays },
    },
    limitations: [
      'This is a bounded API snapshot; provider syncing and scoring can lag.',
      'Primary sleep means the newest returned record explicitly marked nap=false, not necessarily last night.',
      'Unknown nap flags are never treated as primary sleep.',
      'Recovery sleep linkage requires an exact sleep ID match within this snapshot; absent, ambiguous, or inconsistent links remain unknown.',
      'Recovery has no direct measurement timestamp. An associated sleep end does not establish the recovery measurement time.',
      'Body measurements have no provider measurement timestamp and are not filtered by the requested window.',
      'Fetched time and updated time are not measurement time. Missing scores remain null.',
      'Wearable measurements are estimates, not medical diagnoses.',
    ],
  };
}
