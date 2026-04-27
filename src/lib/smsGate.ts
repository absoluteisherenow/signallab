/**
 * Per-gig SMS approval gate.
 *
 * HARD RULE: nothing outbound fires without owner approval. Guest-list SMSes
 * are gated behind a one-time per-gig approval. Until `gigs.sms_templates_approved_at`
 * is set, every fan-facing SMS for that gig is queued in `sms_outbox` (status=pending).
 * Owner reviews + approves in dashboard; queue flushes; future SMSes for that gig
 * fire immediately and are logged to outbox as `sent`.
 */
import { createClient } from '@supabase/supabase-js'
import { sendSms } from './sms'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export interface QueueOrSendArgs {
  gigId: string
  to: string
  body: string
  templateKind: 'discount' | 'guestlist'
}

export interface QueueOrSendResult {
  queued: boolean
  sent: boolean
  sid?: string
  error?: string
}

export async function queueOrSendGigSms(args: QueueOrSendArgs): Promise<QueueOrSendResult> {
  const s = svc()
  const { data: gig } = await s
    .from('gigs')
    .select('sms_templates_approved_at')
    .eq('id', args.gigId)
    .maybeSingle()

  const approved = !!gig?.sms_templates_approved_at

  if (!approved) {
    // Queue and hold
    const { error } = await s.from('sms_outbox').insert({
      gig_id: args.gigId,
      recipient_phone: args.to,
      body: args.body,
      template_kind: args.templateKind,
      status: 'pending',
    })
    if (error) return { queued: false, sent: false, error: error.message }
    return { queued: true, sent: false }
  }

  // Approved — fire now and log
  const result = await sendSms({ to: args.to, body: args.body })
  await s.from('sms_outbox').insert({
    gig_id: args.gigId,
    recipient_phone: args.to,
    body: args.body,
    template_kind: args.templateKind,
    status: result.success ? 'sent' : 'failed',
    sent_sid: result.sid,
    error: result.error,
    sent_at: result.success ? new Date().toISOString() : null,
  })

  return { queued: false, sent: result.success, sid: result.sid, error: result.error }
}
