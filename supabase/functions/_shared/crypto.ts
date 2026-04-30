export function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`missing_env:${name}`)
  return v
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

async function importAesKeyFromB64(keyB64: string): Promise<CryptoKey> {
  const raw = b64ToBytes(keyB64)
  if (raw.byteLength !== 32) {
    throw new Error('invalid_enc_key:OPENCLAW_ENC_KEY_B64 must decode to 32 bytes')
  }
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/**
 * Encrypts a UTF-8 string with AES-256-GCM.
 * Output format (base64): iv(12 bytes) || ciphertext
 */
export async function encryptText(plain: string): Promise<string> {
  const keyB64 = requireEnv('OPENCLAW_ENC_KEY_B64')
  const key = await importAesKeyFromB64(keyB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const pt = new TextEncoder().encode(String(plain ?? ''))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt))
  const out = new Uint8Array(iv.byteLength + ct.byteLength)
  out.set(iv, 0)
  out.set(ct, iv.byteLength)
  return bytesToB64(out)
}

export async function decryptText(cipherB64: string): Promise<string> {
  const keyB64 = requireEnv('OPENCLAW_ENC_KEY_B64')
  const key = await importAesKeyFromB64(keyB64)
  const raw = b64ToBytes(String(cipherB64 ?? '').trim())
  if (raw.byteLength < 13) throw new Error('invalid_ciphertext')
  const iv = raw.slice(0, 12)
  const ct = raw.slice(12)
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct))
  return new TextDecoder().decode(pt)
}

