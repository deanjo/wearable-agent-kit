import { fail } from './errors.mjs';
const enc = new TextEncoder();
const toB64 = bytes => btoa(String.fromCharCode(...bytes));
function fromB64(value) { try { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); } catch { fail('vault_envelope_rejected', 503); } }
export async function importVaultKey(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) fail('vault_key_unavailable', 503);
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt']);
}
export class Vault {
  #key; #keyId;
  constructor(key, keyId) {
    if (!key || key.type !== 'secret' || key.extractable || key.algorithm?.name !== 'AES-GCM' ||
        key.algorithm?.length !== 256 || !/^[A-Za-z0-9_-]{1,80}$/u.test(keyId)) fail('vault_key_unavailable', 503);
    this.#key = key; this.#keyId = keyId;
  }
  toJSON() { return { kind: 'Vault', credentials: 'redacted' }; }
  #aad(owner, purpose, revision, binding) {
    if (typeof owner !== 'string' || !owner || owner.length > 512 || !['credential', 'setup', 'acceptance'].includes(purpose)
        || !Number.isSafeInteger(revision) || revision < 1) fail('vault_scope_rejected', 503);
    if (typeof binding !== 'string' || binding.length > 512 || (purpose === 'setup' && !binding)) fail('vault_scope_rejected',503);
    return enc.encode(JSON.stringify(['garmin-private-v1', this.#keyId, owner, purpose, revision, binding]));
  }
  async seal(value, owner, purpose, revision, binding = '') {
    const aad = this.#aad(owner, purpose, revision, binding), iv = crypto.getRandomValues(new Uint8Array(12));
    try {
      const bytes = enc.encode(JSON.stringify(value));
      if (bytes.length > 131072) fail('vault_payload_rejected', 503);
      const sealed = await crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData:aad }, this.#key, bytes);
      return JSON.stringify({ version:1, keyId:this.#keyId, iv:toB64(iv), ciphertext:toB64(new Uint8Array(sealed)) });
    } catch { fail('vault_seal_failed', 503); }
  }
  async open(envelope, owner, purpose, revision, binding = '') {
    const aad = this.#aad(owner, purpose, revision, binding);
    try {
      if (typeof envelope !== 'string' || envelope.length > 180000) throw Error();
      const v = JSON.parse(envelope);
      if (v.version !== 1 || v.keyId !== this.#keyId || Object.keys(v).sort().join(',') !== 'ciphertext,iv,keyId,version') throw Error();
      const iv = fromB64(v.iv); if (iv.length !== 12) throw Error();
      const bytes = await crypto.subtle.decrypt({ name:'AES-GCM', iv, additionalData:aad }, this.#key, fromB64(v.ciphertext));
      return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
    } catch { fail('vault_open_rejected', 503); }
  }
}
