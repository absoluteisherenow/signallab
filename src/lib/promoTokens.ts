// ── Stream token helpers ─────────────────────────────────────────────────────
// HMAC-SHA256 signed tokens for authenticating private audio streams on /go/[code].
// Format: base64url(payload).base64url(signature)
// Runs on Cloudflare Workers (WebCrypto) and Node.
// ─────────────────────────────────────────────────────────────────────────────

export type StreamPayload = {
  track_id: string
  link_id: string | null
  exp: number
}

function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function getSecret(): string {
  const s = process.env.PROMO_STREAM_SECRET
  if (!s) throw new Error('PROMO_STREAM_SECRET not set')
  return s
}

export async function signStreamToken(
  track_id: string,
  link_id: string | null,
  ttlSec = 60 * 60 * 24
): Promise<string> {
  const payload: StreamPayload = {
    track_id,
    link_id,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  }
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await getKey(getSecret())
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${b64urlEncode(sig)}`
}

export async function verifyStreamToken(token: string): Promise<StreamPayload | null> {
  const [payloadB64, sigB64] = token.split('.')
  if (!payloadB64 || !sigB64) return null

  try {
    const key = await getKey(getSecret())
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sigB64) as BufferSource,
      new TextEncoder().encode(payloadB64)
    )
    if (!ok) return null

    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as StreamPayload
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
