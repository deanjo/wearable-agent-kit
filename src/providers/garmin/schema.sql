-- Private single-owner store. Apply locally for review; this is not provisioning.
-- Only authenticated encrypted envelopes belong here, never plaintext tokens.
CREATE TABLE IF NOT EXISTS owner_credentials (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  owner TEXT NOT NULL COLLATE BINARY UNIQUE CHECK (length(owner) > 0),
  revision INTEGER NOT NULL CHECK (
    typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991
  ),
  envelope TEXT NOT NULL CHECK (length(envelope) > 0),
  phase TEXT NOT NULL CHECK (phase IN ('idle', 'acquired', 'dispatched', 'blocked')),
  lease_id TEXT COLLATE BINARY,
  lease_until INTEGER,
  acceptance_attempt_id TEXT COLLATE BINARY,
  acceptance_started_at INTEGER,
  acceptance_receipt TEXT,
  CHECK ((acceptance_attempt_id IS NULL AND acceptance_started_at IS NULL AND acceptance_receipt IS NULL)
    OR (acceptance_attempt_id IS NOT NULL AND length(acceptance_attempt_id) > 0
      AND typeof(acceptance_started_at) = 'integer' AND acceptance_started_at >= 0)),
  CHECK (
    (phase = 'idle' AND lease_id IS NULL AND lease_until IS NULL)
    OR (
      phase IN ('acquired', 'dispatched', 'blocked')
      AND lease_id IS NOT NULL AND length(lease_id) > 0
      AND lease_until IS NOT NULL AND typeof(lease_until) = 'integer'
      AND lease_until BETWEEN 0 AND 9007199254740991
    )
  )
);

-- Session identifiers and CSRF values are hashes, not raw browser secrets.
-- This table contains only short-lived, encrypted setup payloads.
CREATE TABLE IF NOT EXISTS pending_setup (
  sid_hash TEXT PRIMARY KEY NOT NULL COLLATE BINARY CHECK (length(sid_hash) > 0),
  owner TEXT NOT NULL COLLATE BINARY CHECK (length(owner) > 0),
  csrf_hash TEXT NOT NULL COLLATE BINARY CHECK (length(csrf_hash) > 0),
  envelope TEXT NOT NULL CHECK (length(envelope) > 0),
  expires_at INTEGER NOT NULL CHECK (
    typeof(expires_at) = 'integer' AND expires_at BETWEEN 0 AND 9007199254740991
  )
);

CREATE INDEX IF NOT EXISTS pending_setup_expiry ON pending_setup (expires_at);
