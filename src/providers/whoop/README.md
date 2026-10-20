# WHOOP reference provider

This is a local, single-user reference implementation for the official WHOOP v2
OAuth API. Importing it does not read credentials, start a server, or make network
requests. Tests use synthetic responses only. No live account authorization,
real-health-data read, or provider refresh was performed during development.

Official references checked on 2026-10-20:

- [WHOOP API](https://developer.whoop.com/api/)
- [WHOOP OAuth](https://developer.whoop.com/docs/developing/oauth/)

## Pure API module: `index.mjs`

All operations that perform HTTP require an explicit `transport(url, init)`
function returning a standard `Response`. There is no default `fetch`. A supplied
transport is trusted code and **must honor `redirect: "manual"` and the abort
signal**; this module cannot undo credential disclosure by a transport that ignores
its instructions. Request destinations are fixed to `https://api.prod.whoop.com`.
The reader rejects redirect responses, mismatched response URLs, oversized bodies,
malformed collections, repeated cursors, and unsupported token shapes.

Exports:

- `readWhoopSummary({transport, accessToken, start?, end?, now?})`
- `createAuthorizationUrl({clientId, redirectUri, state})`
- `exchangeAuthorizationCode({transport, clientId, clientSecret, redirectUri, code, now?})`
- `refreshAccessToken({transport, clientId, clientSecret, refreshToken, now?})`
- `WhoopError`, `WHOOP_SCOPES`, `WHOOP_LIMITS`

`now` accepts epoch milliseconds, a `Date`, an ISO timestamp, or a function returning
one of these. `start` and `end` must be ISO timestamps including a timezone. The
default window is seven days ending at `now`; windows must be positive, no longer
than 31 days, and not end in the future.

The reader fetches cycles, recovery, sleep, workouts, and body measurements. It
requests at most three pages of 25 records for each collection and one body
measurement response: at most 13 requests, sequentially, without automatic retries.
Each request has a 15-second deadline and a 1 MiB response-body cap. Token responses
have a 64 KiB cap. HTTP 401 aborts the entire read with `AUTHORIZATION_REQUIRED`.
Other failures appear as safe per-resource errors, with partial data explicitly
marked incomplete. No provider error text or thrown transport exception is echoed.

The summary shape is:

```js
{
  provider: 'whoop',
  status: 'available' | 'partial' | 'no_records' | 'unavailable',
  collectionStartedAt, window, fullHistoricalSync: false,
  resources: {
    cycles, recovery, sleep, workout, body_measurement
  },
  highlights: {primarySleep, latestNap, recovery},
  coverage: {implemented, notImplemented, notProvidedByThisIntegration, bounds},
  limitations
}
```

Each resource includes `status`, `error`, `pages`, `recordCount`, `truncated`,
`completeWithinWindow`, `window`, `latest`, and `records`. Records are allowlisted
numeric projections with missing fields represented as `null`. Raw records, names,
emails, user IDs, record IDs, free text, pagination tokens, and credentials are not
included. IDs are used only transiently for exact recovery-to-sleep linkage.

Interpretation rules:

- Primary sleep is the newest returned record with `nap === false`. An unknown
  nap flag never establishes primary sleep; this does not label anything “last night.”
- Pending, unscorable, and unknown score states do not expose scored numeric fields.
- Total sleep duration is the sum of the three sleep stages only when all are
  present and nonnegative; a total exceeding time in bed is rejected.
- Recovery linkage is exact and can be missing, unmatched, ambiguous, or inconsistent.
  Matching an associated sleep never establishes a recovery measurement timestamp.
- Body measurements have no measurement timestamp and are not window-filtered.
- `updatedAt` and fetch time are not substituted for measurement time.
- Baselines, backfill, workout heart-rate-zone breakdowns, sleep-need breakdowns,
  sport labels, raw/live streams, journal, app coach, and profile are not implemented.

OAuth helpers request the five read scopes plus `offline`, never `read:profile`.
They require all selected scopes in the token response and reject unexpected scopes.
Returned token sets contain secrets: callers must not put them in agent output or
logs. The pure helpers do not persist them or refresh automatically. OAuth state
must be unpredictable, 32–128 URL-safe characters, and verified by the caller.

## Local lifecycle module: `local.mjs`

- `authenticateWhoop({store,promptSecret,promptText,transport,print?,clientId?,redirectUri?,receiveAuthorization?,now?})`
- `readLocalWhoop({store,transport,now?,start?,end?})`
- `receiveLoopbackAuthorization(...)`
- `WHOOP_LOOPBACK_REDIRECT`, `LocalWhoopError`

The CLI supplies the encrypted store and hidden-terminal prompt. `promptText` and
`promptSecret` are asynchronous `(text) => string` functions. The default `print`
writes only to stderr, preserving stdout for machine-readable/MCP output. Auth
returns only provider, authorization status, and expiry, never credentials.

Register this exact redirect URL in your own WHOOP developer app:

`http://127.0.0.1:8787/oauth/callback`

The built-in receiver binds only `127.0.0.1`, validates method, host, path, exact
constant-time state, and duplicate callback parameters, and shuts down after the
callback or a five-minute timeout. It prints a consent URL for the user to open;
it does not open a browser or collect WHOOP account passwords. Client secrets go
through the supplied hidden prompt. Only explicitly calling the auth command starts
this flow. Different explicit ports may be configured, with the same loopback host
and `/oauth/callback` path, if registered identically with WHOOP.

`store` must expose `{load,save,withLock}`. This implementation uses the repository's
encrypted `openSecretStore({directory,passphrase,namespace:'whoop'})`. Auth first
loads/unlocks any existing vault, so a wrong passphrase cannot overwrite it.

Reads hold the exclusive lock through restore, any refresh, and collection. When a
token expires within 60 seconds, the local lifecycle persists `phase: 'dispatched'`
before sending exactly one refresh request. A valid rotated token set is saved with
`phase: 'idle'`. An exception, bad response, or failed save is **not** rolled back:
future reads refuse to replay the old refresh token and report `REFRESH_BLOCKED`.
Explicit successful reauthorization can replace an uncertain session. A process
crash lock requires deliberate operator recovery; this module never removes it.

An unexpected 401 from a current access token clears the saved token set and marks
reauthorization required. It does not retry refresh, launch login, or change accounts.
Token sets and client credentials are encrypted at rest by the supplied store,
but exist in the local Node process while in use. This is not a multi-user hosted
vault or a guarantee against a compromised OS account.

## Verification boundary

`node --test tests/providers/whoop.test.mjs` verifies fully synthetic API and
lifecycle behavior, including real encrypted file storage and cold restore. Tests
deny global fetch and inject the callback, so the loopback listener and browser
consent are not end-to-end tested with WHOOP. Live app registration, callback
acceptance, real scope grants, and real refresh rotation remain unverified.
