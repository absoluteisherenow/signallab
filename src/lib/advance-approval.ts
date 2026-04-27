import crypto from 'crypto'

// HMAC-signed approval links for ADVANCE form requests. Mirrors invoice-approval.ts.
// SMS recipient (Anthony) taps the link → preview page → tap Send → email goes out.
// No login required — possession of the signed link is auth. 48h TTL.
//
// Token payload binds { gigId, kind: 'advance', exp } so an invoice-approval token
// can never accidentally validate against an advance route (and vice-versa).
// Reuses INVOICE_APPROVAL_SECRET so we don't need a second secret in CF.

const TTL_MS = 48 * 60 * 60 * 1000
const KIND = 'advance'

function getSecret(): string {
  const secret = process.env.INVOICE_APPROVAL_SECRET
  if (!secret) throw new Error('INVOICE_APPROVAL_SECRET is not set')
  return secret
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function sign(payload: string, secret: string): string {
  return base64url(crypto.createHmac('sha256', secret).update(payload).digest())
}

export function signAdvanceApprovalToken(gigId: string, ttlMs: number = TTL_MS): string {
  const secret = getSecret()
  const exp = Date.now() + ttlMs
  const payload = base64url(Buffer.from(JSON.stringify({ gigId, kind: KIND, exp })))
  const sig = sign(payload, secret)
  return `${payload}.${sig}`
}

export function verifyAdvanceApprovalToken(token: string, gigId: string): { valid: true } | { valid: false; reason: string } {
  try {
    const secret = getSecret()
    const parts = token.split('.')
    if (parts.length !== 2) return { valid: false, reason: 'malformed' }
    const [payload, sig] = parts
    const expected = sign(payload, secret)
    const sigBuf = fromBase64url(sig)
    const expBuf = fromBase64url(expected)
    if (sigBuf.length !== expBuf.length) return { valid: false, reason: 'bad_sig' }
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return { valid: false, reason: 'bad_sig' }
    const decoded = JSON.parse(fromBase64url(payload).toString('utf8')) as { gigId: string; kind?: string; exp: number }
    if (decoded.kind !== KIND) return { valid: false, reason: 'wrong_kind' }
    if (decoded.gigId !== gigId) return { valid: false, reason: 'gig_mismatch' }
    if (Date.now() > decoded.exp) return { valid: false, reason: 'expired' }
    return { valid: true }
  } catch {
    return { valid: false, reason: 'error' }
  }
}

export function buildAdvanceApprovalPath(gigId: string, ttlMs: number = TTL_MS): string {
  return `/advance/${gigId}/approve?t=${encodeURIComponent(signAdvanceApprovalToken(gigId, ttlMs))}`
}

export function buildAdvanceApprovalUrl(gigId: string, ttlMs: number = TTL_MS): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'
  return `${base}${buildAdvanceApprovalPath(gigId, ttlMs)}`
}
