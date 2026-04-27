import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { sendSms } from '@/lib/sms'

/**
 * Per-gig SMS approval gate.
 *
 * GET    → { approved_at, pending: [...], recent_sent: [...] }
 * POST   { action: 'approve' | 'unapprove' }
 *          - approve: set sms_templates_approved_at = now(), flush all pending
 *            queued SMSes for this gig (send via Twilio, mark sent/failed)
 *          - unapprove: clear sms_templates_approved_at (future SMSes will queue again)
 * DELETE { id } → mark a single pending outbox row as 'skipped'
 */

async function ownsGig(req: NextRequest, gigId: string) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return { error: gate }
  const { user, serviceClient } = gate

  const { data: gig, error } = await serviceClient
    .from('gigs')
    .select('id, user_id, sms_templates_approved_at')
    .eq('id', gigId)
    .maybeSingle()

  if (error || !gig) return { error: NextResponse.json({ error: 'gig not found' }, { status: 404 }) }
  if (gig.user_id !== user.id) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { gig, serviceClient }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await ownsGig(req, params.id)
  if ('error' in r && r.error) return r.error
  const { gig, serviceClient } = r as any

  const { data: outbox } = await serviceClient
    .from('sms_outbox')
    .select('id, recipient_phone, body, template_kind, status, error, sent_at, created_at')
    .eq('gig_id', params.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const pending = (outbox || []).filter((o: any) => o.status === 'pending')
  const recent_sent = (outbox || []).filter((o: any) => o.status === 'sent').slice(0, 10)
  const recent_failed = (outbox || []).filter((o: any) => o.status === 'failed').slice(0, 5)

  return NextResponse.json({
    approved_at: gig.sms_templates_approved_at,
    pending,
    recent_sent,
    recent_failed,
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await ownsGig(req, params.id)
  if ('error' in r && r.error) return r.error
  const { serviceClient } = r as any

  const body = await req.json().catch(() => ({}))
  const action = body.action

  if (action === 'unapprove') {
    await serviceClient
      .from('gigs')
      .update({ sms_templates_approved_at: null })
      .eq('id', params.id)
    return NextResponse.json({ success: true, approved_at: null })
  }

  if (action !== 'approve') {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  // Flip approval flag, then flush pending queue.
  const approvedAt = new Date().toISOString()
  await serviceClient
    .from('gigs')
    .update({ sms_templates_approved_at: approvedAt })
    .eq('id', params.id)

  const { data: pending } = await serviceClient
    .from('sms_outbox')
    .select('id, recipient_phone, body')
    .eq('gig_id', params.id)
    .eq('status', 'pending')

  let sent = 0
  let failed = 0
  for (const row of pending || []) {
    const result = await sendSms({ to: row.recipient_phone, body: row.body })
    await serviceClient
      .from('sms_outbox')
      .update({
        status: result.success ? 'sent' : 'failed',
        sent_sid: result.sid,
        error: result.error,
        sent_at: result.success ? new Date().toISOString() : null,
      })
      .eq('id', row.id)
    if (result.success) sent++
    else failed++
  }

  return NextResponse.json({ success: true, approved_at: approvedAt, sent, failed })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await ownsGig(req, params.id)
  if ('error' in r && r.error) return r.error
  const { serviceClient } = r as any

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await serviceClient
    .from('sms_outbox')
    .update({ status: 'skipped' })
    .eq('id', id)
    .eq('gig_id', params.id)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
