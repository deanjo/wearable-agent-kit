import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readWhoopSummary, createAuthorizationUrl, exchangeAuthorizationCode,
  refreshAccessToken, WhoopError, WHOOP_SCOPES,
} from '../../src/providers/whoop/index.mjs';
import {
  authenticateWhoop, readLocalWhoop, WHOOP_LOOPBACK_REDIRECT,
} from '../../src/providers/whoop/local.mjs';
import { openSecretStore } from '../../src/core/storage/secret-store.mjs';

// These tests cannot accidentally use real fetch, even if the implementation regresses.
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('NETWORK_DENIED_IN_SYNTHETIC_TEST'); };
after(() => { globalThis.fetch = previousFetch; });

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const MAIN_ID = '11111111-1111-4111-8111-111111111111';
const NAP_ID = '22222222-2222-4222-8222-222222222222';
const SECRET = 'synthetic-provider-private-secret';
const ACCESS = 'synthetic.access.token';
const REFRESH = 'synthetic.refresh.token';
const CLIENT_SECRET = 'synthetic-client-secret';
const state = 's'.repeat(43);
const resource = url => {
  const path = new URL(url).pathname;
  if (path.endsWith('/measurement/body')) return 'body_measurement';
  if (path.endsWith('/activity/sleep')) return 'sleep';
  if (path.endsWith('/activity/workout')) return 'workout';
  if (path.endsWith('/cycle')) return 'cycles';
  if (path.endsWith('/recovery')) return 'recovery';
  return 'token';
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
function sleep({ id = MAIN_ID, nap = false, cycle = 42, start = '2026-10-19T23:00:00Z', end = '2026-10-20T07:00:00Z', scoreState = 'SCORED' } = {}) {
  return {
    id, cycle_id: cycle, nap, start, end, score_state: scoreState, user_id: 999,
    arbitrary_private: SECRET, timezone_offset: '+00:00', updated_at: '2026-10-20T11:59:00Z',
    score: {
      sleep_performance_percentage: 90, sleep_consistency_percentage: 80, sleep_efficiency_percentage: 95, respiratory_rate: 15,
      stage_summary: {
        total_in_bed_time_milli: 28_800_000, total_awake_time_milli: 1_800_000, total_no_data_time_milli: 0,
        total_light_sleep_time_milli: 15_000_000, total_slow_wave_sleep_time_milli: 6_000_000, total_rem_sleep_time_milli: 6_000_000,
      },
    },
  };
}
function fixture() {
  return {
    cycles: [{
      id: 42, user_id: 999, start: '2026-10-20T07:00:00Z', end: null, updated_at: '2026-10-20T11:59:00Z',
      score_state: 'SCORED', score: { strain: 7, kilojoule: 1234, average_heart_rate: 70, max_heart_rate: 130 }, step_count: 4200,
    }],
    recovery: [{
      cycle_id: 42, sleep_id: MAIN_ID, user_id: 999, updated_at: '2026-10-20T11:59:00Z', score_state: 'SCORED',
      score: { recovery_score: 75, resting_heart_rate: 55, hrv_rmssd_milli: 65, spo2_percentage: 98, skin_temp_celsius: 33, user_calibrating: false },
    }],
    sleep: [
      sleep({ id: NAP_ID, nap: true, start: '2026-10-20T10:00:00Z', end: '2026-10-20T10:30:00Z', cycle: 43 }),
      sleep(),
    ],
    workout: [],
    body_measurement: { height_meter: 1.8, weight_kilogram: 70, max_heart_rate: 190, private: SECRET },
  };
}
function fakeTransport(data = fixture(), overrides = {}) {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    const name = resource(url);
    if (overrides[name]) return overrides[name](url, init, calls);
    return json(name === 'body_measurement' ? data[name] : { records: data[name] });
  };
  return { transport, calls };
}
function tokenResponse(overrides = {}) {
  return {
    access_token: ACCESS, refresh_token: REFRESH, token_type: 'bearer', expires_in: 3600,
    scope: WHOOP_SCOPES.join(' '), ...overrides,
  };
}
function memoryStore(initial = null) {
  let record = initial;
  let held = false;
  const saves = [];
  return {
    saves,
    async load() { return structuredClone(record); },
    async save(value) { assert.equal(held, true); record = structuredClone(value); saves.push(structuredClone(value)); },
    async withLock(fn) {
      assert.equal(held, false);
      held = true;
      try { return await fn(); } finally { held = false; }
    },
  };
}
const storedSession = overrides => ({
  version: 1, provider: 'whoop', phase: 'idle', clientId: 'synthetic-client', clientSecret: CLIENT_SECRET,
  redirectUri: WHOOP_LOOPBACK_REDIRECT,
  tokens: { accessToken: ACCESS, refreshToken: REFRESH, expiresAt: NOW + 3_600_000, scopes: [...WHOOP_SCOPES] },
  ...overrides,
});
const authReceiver = async ({ redirectUri, state: actual }) => `${redirectUri}?code=synthetic-code&state=${actual}`;
const errorCode = code => error => error.code === code && !String(error).includes(SECRET);

test('WHOOP defaults to no transport and never falls back to fetch', async () => {
  await assert.rejects(readWhoopSummary({ accessToken: ACCESS, now: NOW }), errorCode('TRANSPORT_REQUIRED'));
});

test('WHOOP covers five resources with fixed origin and manual redirects', async () => {
  const { transport, calls } = fakeTransport();
  const result = await readWhoopSummary({ transport, accessToken: ACCESS, now: NOW });
  assert.equal(result.status, 'available');
  assert.equal(calls.length, 5);
  assert.equal(result.window.start, '2026-10-13T12:00:00.000Z');
  assert.deepEqual(result.coverage.implemented, ['cycles', 'recovery', 'sleep', 'workout', 'body_measurement']);
  for (const { url, init } of calls) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.prod.whoop.com');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, `Bearer ${ACCESS}`);
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(url.includes(ACCESS), false);
    if (resource(url) === 'body_measurement') assert.equal(parsed.search, '');
    else assert.equal(parsed.searchParams.get('limit'), '25');
  }
  assert.equal(result.resources.body_measurement.window, null);
  assert.equal(result.resources.body_measurement.latest.freshness.measurementAt, null);
  const serialized = JSON.stringify(result);
  for (const forbidden of [SECRET, ACCESS, MAIN_ID, NAP_ID, '"user_id"', '"cycle_id"', '"sleep_id"']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('WHOOP distinguishes newest nap from primary sleep and links recovery without inventing measurement time', async () => {
  const result = await readWhoopSummary({ ...fakeTransport(), accessToken: ACCESS, now: NOW });
  assert.equal(result.resources.sleep.latest.nap, true);
  assert.equal(result.highlights.primarySleep.nap, false);
  assert.equal(result.highlights.primarySleep.end, '2026-10-20T07:00:00.000Z');
  assert.equal(result.highlights.primarySleep.values.total_sleep_time_milli, 27_000_000);
  assert.equal(result.highlights.latestNap.nap, true);
  assert.equal(result.highlights.recovery.sleepLink.status, 'matched_sleep');
  assert.equal(result.highlights.recovery.sleepLink.matchesPrimarySleep, true);
  assert.equal(result.highlights.recovery.freshness.measurementAt, null);
  assert.equal(result.highlights.recovery.freshness.ageHours, null);
});

test('WHOOP never classifies unknown nap flags as primary sleep', async () => {
  const data = fixture();
  delete data.sleep[1].nap;
  const result = await readWhoopSummary({ ...fakeTransport(data), accessToken: ACCESS, now: NOW });
  assert.equal(result.highlights.primarySleep, null);
  assert.equal(result.resources.sleep.records[1].nap, null);
});

test('WHOOP keeps missing recovery link unknown instead of joining by array position', async () => {
  const data = fixture();
  data.recovery[0].sleep_id = '33333333-3333-4333-8333-333333333333';
  const result = await readWhoopSummary({ ...fakeTransport(data), accessToken: ACCESS, now: NOW });
  assert.equal(result.highlights.recovery.sleepLink.status, 'unmatched');
  assert.equal(result.highlights.recovery.sleepLink.matchesPrimarySleep, null);
  assert.equal(result.highlights.recovery.sleepLink.associatedSleep, null);
});

test('WHOOP rejects ambiguous and cycle-inconsistent recovery links', async () => {
  for (const expected of ['ambiguous', 'inconsistent_cycle', 'missing_sleep_id']) {
    const data = fixture();
    if (expected === 'ambiguous') data.sleep.push(sleep());
    if (expected === 'inconsistent_cycle') data.recovery[0].cycle_id = 9999;
    if (expected === 'missing_sleep_id') delete data.recovery[0].sleep_id;
    const result = await readWhoopSummary({ ...fakeTransport(data), accessToken: ACCESS, now: NOW });
    assert.equal(result.highlights.recovery.sleepLink.status, expected);
    assert.equal(result.highlights.recovery.sleepLink.matchesPrimarySleep, null);
  }
});

test('WHOOP pending scores remain null and are not replaced with older scored sleep', async () => {
  const data = fixture();
  data.sleep[1].score_state = 'PENDING_SCORE';
  const result = await readWhoopSummary({ ...fakeTransport(data), accessToken: ACCESS, now: NOW });
  assert.equal(result.highlights.primarySleep.scoreState, 'PENDING_SCORE');
  assert.ok(Object.values(result.highlights.primarySleep.values).every(value => value === null));
  assert.equal(result.highlights.primarySleep.missingFields.includes('total_sleep_time_milli'), true);
});

test('WHOOP rejects impossible derived sleep totals and does not use updated_at as freshness', async () => {
  const data = fixture();
  data.sleep[1].score.stage_summary.total_in_bed_time_milli = 1;
  const result = await readWhoopSummary({ ...fakeTransport(data), accessToken: ACCESS, now: NOW });
  assert.equal(result.highlights.primarySleep.values.total_sleep_time_milli, null);
  assert.deepEqual(result.highlights.primarySleep.qualityFlags, ['sleep_stages_exceed_time_in_bed']);
  assert.equal(result.highlights.primarySleep.freshness.ageHours, 5);
});

test('WHOOP collection bounds are three pages of 25 with explicit truncation', async () => {
  let page = 0;
  const { transport, calls } = fakeTransport(fixture(), {
    cycles: () => json({ records: Array.from({ length: 25 }, () => fixture().cycles[0]), next_token: `page-${++page}` }),
  });
  const result = await readWhoopSummary({ transport, accessToken: ACCESS, now: NOW });
  assert.equal(result.status, 'partial');
  assert.equal(result.resources.cycles.recordCount, 75);
  assert.equal(result.resources.cycles.pages, 3);
  assert.equal(result.resources.cycles.truncated, true);
  assert.equal(result.resources.cycles.completeWithinWindow, false);
  const cycleCalls = calls.filter(call => resource(call.url) === 'cycles');
  assert.equal(cycleCalls.length, 3);
  assert.equal(new URL(cycleCalls[1].url).searchParams.get('nextToken'), 'page-1');
});

test('WHOOP rejects repeated pagination cursor without unbounded requests', async () => {
  const { transport, calls } = fakeTransport(fixture(), {
    cycles: () => json({ records: [fixture().cycles[0]], next_token: 'same-cursor' }),
  });
  const result = await readWhoopSummary({ transport, accessToken: ACCESS, now: NOW });
  assert.equal(result.resources.cycles.error.code, 'INVALID_RESPONSE');
  assert.equal(result.resources.cycles.completeWithinWindow, false);
  assert.equal(calls.filter(call => resource(call.url) === 'cycles').length, 2);
});

test('WHOOP rejects oversized pages and malformed cursors', async () => {
  for (const payload of [{ records: Array(26).fill({}) }, { records: [], next_token: 'x'.repeat(2049) }, { records: [null] }]) {
    const result = await readWhoopSummary({
      ...fakeTransport(fixture(), { cycles: () => json(payload) }), accessToken: ACCESS, now: NOW,
    });
    assert.equal(result.resources.cycles.error.code, 'INVALID_RESPONSE');
  }
});

test('WHOOP 401 stops the read immediately, with no refresh or login', async () => {
  const { transport, calls } = fakeTransport(fixture(), { cycles: () => new Response(SECRET, { status: 401 }) });
  await assert.rejects(readWhoopSummary({ transport, accessToken: ACCESS, now: NOW }), errorCode('AUTHORIZATION_REQUIRED'));
  assert.equal(calls.length, 1);
});

test('WHOOP other failures are per-resource, safe, and never silently retried', async () => {
  for (const [status, code] of [[403, 'FORBIDDEN'], [429, 'RATE_LIMITED'], [500, 'HTTP_ERROR'], [302, 'REDIRECT_REJECTED']]) {
    const { transport, calls } = fakeTransport(fixture(), { cycles: () => new Response(SECRET, { status }) });
    const result = await readWhoopSummary({ transport, accessToken: ACCESS, now: NOW });
    assert.equal(result.status, 'partial');
    assert.equal(result.resources.cycles.error.code, code);
    assert.equal(calls.length, 5);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
  }
});

test('WHOOP masks transport exceptions and rejects a followed redirect response', async () => {
  const failures = [
    { code: 'TRANSPORT_FAILED', run: () => { throw new Error(`${ACCESS} ${SECRET}`); } },
    { code: 'REDIRECT_REJECTED', run: () => ({ status: 200, redirected: true, url: `https://evil.example/${SECRET}` }) },
  ];
  for (const failure of failures) {
    const result = await readWhoopSummary({
      ...fakeTransport(fixture(), { cycles: failure.run }), accessToken: ACCESS, now: NOW,
    });
    assert.equal(result.resources.cycles.error.code, failure.code);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
  }
});

test('WHOOP rejects oversized or invalid JSON bodies', async () => {
  for (const response of [
    () => new Response(`"${'x'.repeat(1_048_576)}"`),
    () => new Response('{ invalid json }'),
    () => json([]),
  ]) {
    const result = await readWhoopSummary({
      ...fakeTransport(fixture(), { cycles: response }), accessToken: ACCESS, now: NOW,
    });
    assert.equal(result.resources.cycles.error.code, 'INVALID_RESPONSE');
  }
});

test('WHOOP validates time bounds and bearer-token input before transport', async () => {
  let calls = 0;
  const transport = () => { calls++; throw Error(); };
  for (const overrides of [
    { start: '2020-01-01T00:00:00Z' },
    { start: 'not-time' },
    { end: '2027-01-01T00:00:00Z' },
    { accessToken: 'token\r\nInjected: x' },
    { start: '2026-10-20T12:00:00Z', end: '2026-10-20T12:00:00Z' },
  ]) {
    await assert.rejects(readWhoopSummary({ transport, accessToken: ACCESS, now: NOW, ...overrides }), errorCode('INVALID_INPUT'));
  }
  assert.equal(calls, 0);
});

test('WHOOP authorization URL has fixed endpoint and least selected resource scopes', () => {
  const url = new URL(createAuthorizationUrl({ clientId: 'client', redirectUri: WHOOP_LOOPBACK_REDIRECT, state }));
  assert.equal(url.origin, 'https://api.prod.whoop.com');
  assert.equal(url.pathname, '/oauth/oauth2/auth');
  assert.equal(url.searchParams.get('state'), state);
  assert.equal(url.searchParams.get('redirect_uri'), WHOOP_LOOPBACK_REDIRECT);
  assert.equal(url.searchParams.get('scope'), WHOOP_SCOPES.join(' '));
  assert.equal(url.searchParams.get('scope').includes('read:profile'), false);
  for (const redirectUri of ['http://evil.example/callback', 'https://user:pass@example.com/callback', 'https://example.com/cb#fragment']) {
    assert.throws(() => createAuthorizationUrl({ clientId: 'client', redirectUri, state }), errorCode('INVALID_INPUT'));
  }
  assert.throws(() => createAuthorizationUrl({ clientId: 'client', redirectUri: WHOOP_LOOPBACK_REDIRECT, state: 'weak' }), errorCode('INVALID_INPUT'));
});

test('WHOOP OAuth exchange and refresh use explicit injected transport and safe token projection', async () => {
  const calls = [];
  const transport = async (url, init) => { calls.push({ url, init }); return json(tokenResponse({ extra: SECRET })); };
  const tokens = await exchangeAuthorizationCode({
    transport, clientId: 'client', clientSecret: CLIENT_SECRET, redirectUri: WHOOP_LOOPBACK_REDIRECT, code: 'synthetic-code', now: NOW,
  });
  assert.equal(tokens.expiresAt, NOW + 3_600_000);
  assert.equal(JSON.stringify(tokens).includes(SECRET), false);
  await refreshAccessToken({ transport, clientId: 'client', clientSecret: CLIENT_SECRET, refreshToken: REFRESH, now: NOW });
  assert.equal(calls.length, 2);
  for (const { url, init } of calls) {
    assert.equal(url, 'https://api.prod.whoop.com/oauth/oauth2/token');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.method, 'POST');
    assert.equal(new URLSearchParams(init.body).get('client_secret'), CLIENT_SECRET);
  }
  assert.equal(new URLSearchParams(calls[0].init.body).get('grant_type'), 'authorization_code');
  assert.equal(new URLSearchParams(calls[1].init.body).get('scope'), 'offline');
});

test('WHOOP OAuth rejects unsafe/missing scopes, bad token type, and incomplete rotation responses', async () => {
  for (const override of [
    { scope: 'offline' }, { scope: `${WHOOP_SCOPES.join(' ')} read:profile` },
    { token_type: 'basic' }, { refresh_token: undefined }, { expires_in: -1 },
  ]) {
    await assert.rejects(refreshAccessToken({
      transport: async () => json(tokenResponse(override)), clientId: 'client', clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH, now: NOW,
    }), errorCode('INVALID_RESPONSE'));
  }
});

test('WHOOP token errors do not expose response body, client secret, or access token', async () => {
  try {
    await refreshAccessToken({
      transport: async () => new Response(`${SECRET} ${CLIENT_SECRET} ${ACCESS}`, { status: 400 }),
      clientId: 'client', clientSecret: CLIENT_SECRET, refreshToken: REFRESH, now: NOW,
    });
    assert.fail('Expected rejection');
  } catch (error) {
    assert.ok(error instanceof WhoopError);
    const output = `${String(error)} ${JSON.stringify(error)} ${error.stack}`;
    for (const value of [SECRET, CLIENT_SECRET, ACCESS]) assert.equal(output.includes(value), false);
  }
});

test('WHOOP local auth validates callback state and duplicate parameters before exchange', async () => {
  for (const makeCallback of [
    ({ redirectUri }) => `${redirectUri}?code=synthetic-code&state=wrong`,
    ({ redirectUri, state }) => `${redirectUri}?code=synthetic-code&state=${state}&state=${state}`,
    ({ redirectUri, state }) => `${redirectUri}?code=a&code=b&state=${state}`,
    ({ state }) => `https://evil.example/oauth/callback?code=synthetic-code&state=${state}`,
  ]) {
    let requests = 0;
    const store = memoryStore();
    await assert.rejects(authenticateWhoop({
      store, promptText: async () => 'client', promptSecret: async () => CLIENT_SECRET,
      receiveAuthorization: async args => makeCallback(args), transport: async () => { requests++; return json(tokenResponse()); }, now: NOW,
    }), errorCode('CALLBACK_REJECTED'));
    assert.equal(requests, 0);
    assert.equal(store.saves.length, 0);
  }
});

test('WHOOP local auth cancellation preserves the previous session', async () => {
  const store = memoryStore(storedSession());
  await assert.rejects(authenticateWhoop({
    store, promptText: async () => 'client', promptSecret: async () => CLIENT_SECRET,
    receiveAuthorization: async ({ redirectUri, state }) => `${redirectUri}?error=access_denied&state=${state}`,
    transport: async () => { assert.fail('No token exchange after denial'); }, now: NOW,
  }), errorCode('AUTHORIZATION_CANCELLED'));
  assert.equal((await store.load()).phase, 'idle');
  assert.equal(store.saves.length, 0);
});

test('WHOOP local session auth, encrypted cold restore, and rotation use synthetic transport only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wearable-whoop-'));
  const options = { directory, passphrase: 'synthetic-only-vault-passphrase', namespace: 'whoop' };
  try {
    const store = await openSecretStore(options);
    const result = await authenticateWhoop({
      store, promptText: async () => 'client', promptSecret: async () => CLIENT_SECRET,
      receiveAuthorization: authReceiver, transport: async () => json(tokenResponse()), now: NOW,
    });
    assert.deepEqual(result, { provider: 'whoop', status: 'authorized', expiresAt: NOW + 3_600_000 });
    const serialized = await readFile(join(directory, 'whoop.vault'), 'utf8');
    for (const value of [ACCESS, REFRESH, CLIENT_SECRET]) assert.equal(serialized.includes(value), false);
    assert.deepEqual(await readdir(directory), ['whoop.vault']);
    const coldStore = await openSecretStore(options);
    const read = await readLocalWhoop({ store: coldStore, ...fakeTransport(), now: NOW });
    assert.equal(read.highlights.primarySleep.nap, false);
    const rotationCalls = [];
    const replacement = fakeTransport(fixture(), {
      token: async (url, init) => {
        rotationCalls.push(init);
        const during = await coldStore.load();
        assert.equal(during.phase, 'dispatched');
        return json(tokenResponse({ access_token: 'synthetic.rotated.access', refresh_token: 'synthetic.rotated.refresh' }));
      },
    });
    await readLocalWhoop({ store: coldStore, transport: replacement.transport, now: NOW + 3_600_000 });
    assert.equal(rotationCalls.length, 1);
    const restoredAgain = await openSecretStore(options);
    const saved = await restoredAgain.load();
    assert.equal(saved.phase, 'idle');
    assert.equal(saved.tokens.refreshToken, 'synthetic.rotated.refresh');
    const subsequent = fakeTransport();
    await readLocalWhoop({ store: restoredAgain, transport: subsequent.transport, now: NOW + 3_600_001 });
    assert.equal(subsequent.calls.length, 5);
    assert.ok(subsequent.calls.every(call => call.init.headers.Authorization === 'Bearer synthetic.rotated.access'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('WHOOP uncertain refresh persists dispatched and refuses credential replay after cold restore', async () => {
  const record = storedSession();
  record.tokens.expiresAt = NOW - 1;
  const store = memoryStore(record);
  let calls = 0;
  const transport = async () => { calls++; throw new Error(`${SECRET} provider may have rotated`); };
  await assert.rejects(readLocalWhoop({ store, transport, now: NOW }), errorCode('REFRESH_BLOCKED'));
  assert.equal((await store.load()).phase, 'dispatched');
  const restored = memoryStore(await store.load());
  await assert.rejects(readLocalWhoop({ store: restored, transport, now: NOW }), errorCode('REFRESH_BLOCKED'));
  assert.equal(calls, 1);
});

test('WHOOP 401 on a current local token marks reauthorization and never silently refreshes', async () => {
  const store = memoryStore(storedSession());
  let calls = 0;
  const transport = async () => { calls++; return new Response(SECRET, { status: 401 }); };
  await assert.rejects(readLocalWhoop({ store, transport, now: NOW }), errorCode('AUTHORIZATION_REQUIRED'));
  assert.equal((await store.load()).phase, 'reauthorization_required');
  assert.equal((await store.load()).tokens, null);
  await assert.rejects(readLocalWhoop({ store, transport, now: NOW }), errorCode('AUTHORIZATION_REQUIRED'));
  assert.equal(calls, 1);
});

test('WHOOP local read without saved auth is explicitly blocked', async () => {
  await assert.rejects(readLocalWhoop({ store: memoryStore(), transport: async () => assert.fail(), now: NOW }), errorCode('AUTHORIZATION_REQUIRED'));
});

test('WHOOP wrong vault passphrase blocks auth before prompting or dispatching', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wearable-whoop-wrong-pass-'));
  try {
    const goodStore = await openSecretStore({ directory, passphrase: 'synthetic-good-passphrase', namespace: 'whoop' });
    await goodStore.withLock(() => goodStore.save(storedSession()));
    const before = await readFile(join(directory, 'whoop.vault'), 'utf8');
    const wrongStore = await openSecretStore({ directory, passphrase: 'synthetic-wrong-passphrase', namespace: 'whoop' });
    let interactions = 0;
    const unexpected = async () => { interactions++; assert.fail('No interaction before vault unlock'); };
    await assert.rejects(authenticateWhoop({
      store: wrongStore, promptText: unexpected, promptSecret: unexpected,
      receiveAuthorization: unexpected, transport: unexpected, now: NOW,
    }), /VAULT_UNLOCK_FAILED/u);
    assert.equal(interactions, 0);
    assert.equal(await readFile(join(directory, 'whoop.vault'), 'utf8'), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
