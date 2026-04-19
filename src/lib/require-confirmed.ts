import { NextResponse } from 'next/server'

/**
 * requireConfirmed — backend half of the approve-before-send contract.
 *
 * Every outbound route (/send, /publish, /post, /chase, /blast) must gate its
 * actual-send branch behind `body.confirmed === true`. The first call (no
 * `confirmed`) returns a preview payload; the second call with `confirmed: true`
 * fires the send.
 *
 * Usage:
 *
 *   if (!body.confirmed) {
 *     return NextResponse.json({ success: true, preview: true, ...previewPayload })
 *   }
 *   // …actually send
 *
 * Or, if a route is always gated (no preview shape):
 *
 *   const gate = requireConfirmed(body)
 *   if (gate) return gate
 *
 * See HARD RULE: feedback_approve_before_send.md.
 */
export function requireConfirmed(body: unknown): NextResponse | null {
  const confirmed = (body as { confirmed?: unknown } | null)?.confirmed
  if (confirmed === true) return null
  return NextResponse.json(
    {
      error:
        'Outbound send requires explicit user confirmation. Call the preview endpoint first, then POST with { confirmed: true }.',
      requiresConfirmation: true,
    },
    { status: 400 }
  )
}
