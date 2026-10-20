// Codes are fixed literals. Do not attach raw provider bodies, requests, errors, or causes.
export class SafeError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'SafeError'; this.code = code; this.status = status; }
  toJSON() { return { error: this.code }; }
}
export function fail(code, status) { throw new SafeError(code, status); }
export function opaqueString(value, max = 32768) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x20\x7f]/u.test(value);
}
export function exactObject(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
export async function boundedJSON(response, limit = 4 * 1024 * 1024) {
  const type = response.headers.get('content-type')?.split(';')[0].trim();
  if (type !== 'application/json' && !type?.endsWith('+json')) fail('provider_non_json_stop', 502);
  const reader = response.body?.getReader();
  if (!reader) fail('provider_empty_response', 502);
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); fail('provider_response_too_large', 502); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) { if (error instanceof SafeError) throw error; fail('provider_invalid_json', 502); }
  finally { reader.releaseLock(); }
}
