// VAPID (Voluntary Application Server Identification) JWT signer for Web
// Push. Lets our server auth itself to FCM/Mozilla/Apple push endpoints
// without a shared secret per vendor.
//
// Why hand-rolled? The canonical `web-push` npm package depends on Node's
// `crypto` APIs that don't work in the Cloudflare Workers runtime. Workers
// ships SubtleCrypto with P-256 ECDSA, which is all we need for VAPID.
//
// Key generation (one-time, local machine):
//   npx web-push generate-vapid-keys
//   → set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY as wrangler secrets
//   → put VAPID_PUBLIC_KEY in NEXT_PUBLIC_VAPID_PUBLIC_KEY too (client needs it)
//   → set VAPID_SUBJECT=mailto:you@example.com
//
// This module only handles the JWT + Authorization/Crypto-Key headers. We
// send push notifications WITHOUT a payload (data-less push) to avoid the
// aes128gcm encryption dance that requires extra Workers-compatible crypto.
// The service worker receives an empty push event, then fetches a queued
// notification from /api/notifications/next. That tradeoff is standard for
// edge-hosted push backends and keeps this file tiny.

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : ''
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Convert a raw 65-byte P-256 public key (0x04 || X || Y) — the Web Push
// spec format — into JWK for SubtleCrypto import.
function rawPublicKeyToJwk(raw: Uint8Array): JsonWebKey {
  if (raw.byteLength !== 65 || raw[0] !== 0x04) {
    throw new Error('VAPID public key must be 65 bytes starting with 0x04 (uncompressed P-256)')
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(raw.slice(1, 33)),
    y: b64urlEncode(raw.slice(33, 65)),
    ext: true,
  }
}

// Convert a raw 32-byte P-256 private scalar to JWK, combined with the
// public key so SubtleCrypto can import a full key pair for signing.
function rawPrivateKeyToJwk(privRaw: Uint8Array, pubRaw: Uint8Array): JsonWebKey {
  const pub = rawPublicKeyToJwk(pubRaw)
  return { ...pub, d: b64urlEncode(privRaw) }
}

export interface VapidKeys {
  publicKey: string // base64url, 65 bytes raw uncompressed
  privateKey: string // base64url, 32 bytes raw scalar
  subject: string // mailto: or https: URL
}

// Sign a VAPID JWT for a given push endpoint audience. JWT is valid for 12h
// per spec; most UAs accept up to 24h. We use 12h to match common guidance.
export async function signVapidJwt(
  endpoint: string,
  keys: VapidKeys,
  expSeconds = 12 * 60 * 60
): Promise<string> {
  const url = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`

  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { aud: audience, exp: now + expSeconds, sub: keys.subject }

  const encoder = new TextEncoder()
  const headerPart = b64urlEncode(encoder.encode(JSON.stringify(header)))
  const payloadPart = b64urlEncode(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${headerPart}.${payloadPart}`

  const privRaw = b64urlDecode(keys.privateKey)
  const pubRaw = b64urlDecode(keys.publicKey)
  const jwk = rawPrivateKeyToJwk(privRaw, pubRaw)

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    encoder.encode(signingInput)
  )

  return `${signingInput}.${b64urlEncode(sig)}`
}

// Build the headers a push service expects. Returns everything except the
// body — data-less pushes have no body, or an empty Uint8Array if your
// chosen push service rejects missing Content-Length.
export async function vapidHeaders(
  endpoint: string,
  keys: VapidKeys,
  ttlSeconds = 60 * 60 * 24
): Promise<Record<string, string>> {
  const jwt = await signVapidJwt(endpoint, keys)
  return {
    Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
    TTL: String(ttlSeconds),
  }
}

// Minimal push dispatch. subscription shape matches what PushSubscription.toJSON()
// returns on the browser. Returns the raw Response so the caller can detect
// 410 Gone (subscription expired — delete from DB) vs retryable errors.
export interface WebPushSubscription {
  endpoint: string
  keys?: { p256dh?: string; auth?: string }
}

export async function sendDatalessWebPush(
  subscription: WebPushSubscription,
  keys: VapidKeys
): Promise<Response> {
  const headers = await vapidHeaders(subscription.endpoint, keys)
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: { ...headers, 'Content-Length': '0' },
  })
}
