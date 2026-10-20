/**
 * Review-only D1 persistence adapter. No network calls, provisioning, logging,
 * passwords, plaintext token parsing, or automatic recovery is performed here.
 * The caller supplies opaque encrypted strings, a verified owner, cryptographically
 * unique lease identifiers, and timestamps in one consistent unit (milliseconds).
 *
 * All conditional changes use ONE SQL statement, including token rotation and
 * setup consumption. A dispatched refresh never expires: any uncertain result
 * requires explicit reauthorization outside this adapter. In particular, callers
 * must not retry a provider refresh after a dispatch or commit storage error.
 */

export class D1StoreError extends Error {
  constructor(code = 'STORAGE_ERROR') {
    super(code === 'INVALID_ARGUMENT' ? 'Invalid storage arguments.' : 'Credential storage operation failed.');
    this.name = 'D1StoreError';
    this.code = code;
    // Deliberately omit the original error/cause, which may contain bound values.
  }
}

function requireString(...values) {
  if (values.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new D1StoreError('INVALID_ARGUMENT');
  }
}

function requireInteger(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new D1StoreError('INVALID_ARGUMENT');
  }
}

function requireLease(owner, revision, leaseId) {
  requireString(owner, leaseId);
  requireInteger(revision, 1);
}

const CREDENTIAL_COLUMNS = `
  revision, envelope, phase, lease_id AS leaseId, lease_until AS leaseUntil
`;

const SETUP_COLUMNS = `
  sid_hash AS sidHash, owner, csrf_hash AS csrfHash, envelope, expires_at AS expiresAt
`;

export class D1Store {
  #db;

  constructor(db) {
    if (!db || typeof db.prepare !== 'function') {
      throw new D1StoreError('INVALID_ARGUMENT');
    }
    this.#db = db;
  }

  async #first(sql, values) {
    try {
      const row = await this.#db.prepare(sql).bind(...values).first();
      return row ?? null;
    } catch {
      throw new D1StoreError();
    }
  }

  async #changes(sql, values) {
    try {
      const result = await this.#db.prepare(sql).bind(...values).run();
      if (result?.success !== true || !Number.isSafeInteger(result?.meta?.changes) || result.meta.changes < 0) {
        throw new D1StoreError();
      }
      return result.meta.changes;
    } catch {
      throw new D1StoreError();
    }
  }

  async getCredential(owner) {
    requireString(owner);
    return this.#first(`SELECT ${CREDENTIAL_COLUMNS} FROM owner_credentials WHERE owner = ?`, [owner]);
  }

  async insertCredential(owner, envelope) {
    requireString(owner, envelope);
    return (await this.#changes(`
      INSERT INTO owner_credentials (singleton, owner, revision, envelope, phase)
      VALUES (1, ?, 1, ?, 'idle') ON CONFLICT DO NOTHING
    `, [owner, envelope])) === 1;
  }

  async acquireRefresh(owner, revision, leaseId, now, until) {
    requireLease(owner, revision, leaseId);
    requireInteger(now);
    requireInteger(until);
    if (until <= now) throw new D1StoreError('INVALID_ARGUMENT');
    return (await this.#changes(`
      UPDATE owner_credentials
      SET phase = 'acquired', lease_id = ?, lease_until = ?
      WHERE owner = ? AND revision = ?
        AND (phase = 'idle' OR (phase = 'acquired' AND lease_until < ? AND lease_id <> ?))
    `, [leaseId, until, owner, revision, now, leaseId])) === 1;
  }

  async markDispatched(owner, revision, leaseId, now) {
    requireLease(owner, revision, leaseId);
    requireInteger(now);
    return (await this.#changes(`
      UPDATE owner_credentials SET phase = 'dispatched'
      WHERE owner = ? AND revision = ? AND lease_id = ?
        AND phase = 'acquired' AND lease_until > ?
    `, [owner, revision, leaseId, now])) === 1;
  }

  async commitRefresh(owner, revision, leaseId, newEnvelope) {
    requireLease(owner, revision, leaseId);
    requireString(newEnvelope);
    if (revision === Number.MAX_SAFE_INTEGER) throw new D1StoreError('INVALID_ARGUMENT');
    return (await this.#changes(`
      UPDATE owner_credentials
      SET revision = revision + 1, envelope = ?, phase = 'idle', lease_id = NULL, lease_until = NULL
      WHERE owner = ? AND revision = ? AND lease_id = ? AND phase = 'dispatched'
        AND (acceptance_attempt_id IS NULL OR acceptance_attempt_id <> lease_id OR acceptance_receipt IS NOT NULL)
    `, [newEnvelope, owner, revision, leaseId])) === 1;
  }

  async getAcceptance(owner) {
    requireString(owner);
    return this.#first(`SELECT acceptance_attempt_id AS attemptId,
      acceptance_started_at AS startedAt, acceptance_receipt AS receipt
      FROM owner_credentials WHERE owner = ?`, [owner]);
  }

  async acquireAcceptance(owner, leaseId, now, until) {
    requireString(owner, leaseId); requireInteger(now); requireInteger(until);
    if (until <= now) throw new D1StoreError('INVALID_ARGUMENT');
    // Attempt marker is permanent, even if the caller loses the response or
    // crashes before sending. Only revision 1 can start this explicit test.
    return (await this.#changes(`UPDATE owner_credentials
      SET phase = 'acquired', lease_id = ?, lease_until = ?,
          acceptance_attempt_id = ?, acceptance_started_at = ?
      WHERE owner = ? AND revision = 1 AND phase = 'idle'
        AND acceptance_attempt_id IS NULL AND acceptance_receipt IS NULL`,
      [leaseId, until, leaseId, now, owner])) === 1;
  }

  async commitAcceptance(owner, leaseId, newEnvelope, receipt) {
    requireString(owner, leaseId, newEnvelope, receipt);
    // New generation and authenticated receipt are committed together. A
    // revision increment alone is never evidence this acceptance happened.
    return (await this.#changes(`UPDATE owner_credentials
      SET revision = 2, envelope = ?, phase = 'idle', lease_id = NULL, lease_until = NULL,
          acceptance_receipt = ?
      WHERE owner = ? AND revision = 1 AND lease_id = ? AND phase = 'dispatched'
        AND acceptance_attempt_id = ? AND acceptance_receipt IS NULL`,
      [newEnvelope, receipt, owner, leaseId, leaseId])) === 1;
  }

  async blockRefresh(owner, revision, leaseId) {
    requireLease(owner, revision, leaseId);
    return (await this.#changes(`
      UPDATE owner_credentials SET phase = 'blocked'
      WHERE owner = ? AND revision = ? AND lease_id = ? AND phase = 'dispatched'
    `, [owner, revision, leaseId])) === 1;
  }

  async releaseAcquired(owner, revision, leaseId) {
    requireLease(owner, revision, leaseId);
    return (await this.#changes(`
      UPDATE owner_credentials SET phase = 'idle', lease_id = NULL, lease_until = NULL
      WHERE owner = ? AND revision = ? AND lease_id = ? AND phase = 'acquired'
    `, [owner, revision, leaseId])) === 1;
  }

  async saveSetup(setup) {
    if (!setup || typeof setup !== 'object') throw new D1StoreError('INVALID_ARGUMENT');
    const { sidHash, owner, csrfHash, envelope, expiresAt } = setup;
    requireString(sidHash, owner, csrfHash, envelope);
    requireInteger(expiresAt);
    return (await this.#changes(`
      INSERT INTO pending_setup (sid_hash, owner, csrf_hash, envelope, expires_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT (sid_hash) DO NOTHING
    `, [sidHash, owner, csrfHash, envelope, expiresAt])) === 1;
  }

  async consumeSetup(sidHash, owner, csrfHash, now) {
    requireString(sidHash, owner, csrfHash);
    requireInteger(now);
    return this.#first(`
      DELETE FROM pending_setup
      WHERE sid_hash = ? AND owner = ? AND csrf_hash = ? AND expires_at > ?
      RETURNING ${SETUP_COLUMNS}
    `, [sidHash, owner, csrfHash, now]);
  }

  async purgeExpired(now) {
    requireInteger(now);
    // Intentionally never touches refresh leases, including dispatched ones.
    return this.#changes('DELETE FROM pending_setup WHERE expires_at <= ?', [now]);
  }
}
