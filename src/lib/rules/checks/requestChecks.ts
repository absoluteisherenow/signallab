// Request-shape checks — run against an inbound API request (not AI output).
// Used by outbound routes (invoice send, IG post, ad launch) before any
// external side-effect happens. These are the "last line of defence" for
// rules that can't be caught at generation time.

import type { CheckResult, RequestCheckFn } from '../types'

// Meta Graph API requires public HTTPS URLs. data:, blob:, localhost, http:
// all silently break when Meta tries to fetch the media. Enforce shape before
// we hit the Graph API — the bug that killed tonight's Reel publish.
export const platformMediaUrlShape: RequestCheckFn = (request) => {
  const urls: string[] = []
  if (typeof request.image_url === 'string') urls.push(request.image_url)
  if (typeof request.video_url === 'string') urls.push(request.video_url)
  if (Array.isArray(request.image_urls)) {
    for (const u of request.image_urls) if (typeof u === 'string') urls.push(u)
  }
  const bad = urls.filter((u) => {
    if (!u) return false
    if (u.startsWith('data:')) return true
    if (u.startsWith('blob:')) return true
    if (u.startsWith('http://')) return true
    if (u.includes('localhost')) return true
    if (u.startsWith('/')) return true
    return !u.startsWith('https://')
  })
  return bad.length
    ? {
        passed: false,
        detail: `media URLs must be public HTTPS. Bad: ${bad
          .map((u) => (u.length > 60 ? u.slice(0, 60) + '…' : u))
          .join(', ')}`,
      }
    : { passed: true }
}

// Invoice send must use ctx.connections.gmail_from. If the request specifies
// a different from_address, or if gmail_from is missing, block with a clear
// error so the user reconnects Gmail OAuth.
export const fromEmailMatches: RequestCheckFn = (request, ctx) => {
  const expected = ctx.connections.gmail_from
  if (!expected) {
    return {
      passed: false,
      detail:
        'No Gmail OAuth account connected — invoices must send from an authoritative Gmail account (connections.gmail_from is null)',
    }
  }
  const provided =
    (typeof request.from_email === 'string' && request.from_email) ||
    (typeof request.from === 'string' && request.from) ||
    null
  if (provided && provided.toLowerCase() !== expected.toLowerCase()) {
    return {
      passed: false,
      detail: `from_email (${provided}) must match connected Gmail account (${expected})`,
    }
  }
  return { passed: true }
}

// Enforce approve-before-send — body.confirmed === true before any send.
// Existing require-confirmed.ts is the runtime gate; this makes it visible
// in the invariant log too.
export const approveBeforeSend: RequestCheckFn = (request) => {
  if ((request as { confirmed?: boolean }).confirmed === true) return { passed: true }
  return {
    passed: false,
    detail: 'Outbound send requires body.confirmed === true (approve-before-send gate)',
  }
}

export const requestCheckRegistry: Record<string, RequestCheckFn> = {
  platformMediaUrlShape,
  fromEmailMatches,
  approveBeforeSend,
}
