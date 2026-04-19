import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST: Preview or approve + send a crew briefing draft
// Body: { via?: string, confirmed?: boolean }
// Step 1 (no confirmed): returns preview of the draft
// Step 2 (confirmed: true, or via === 'sms'): actually sends
// NOTE: SMS reply approval (`via: 'sms'`) is the human confirmation surface for
// that path — see /api/sms/inbound. App-triggered sends must use the approval
// modal (confirmed: true).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({} as { via?: string; confirmed?: boolean }))
    const approvedVia = body.via || 'app'
    const isSmsApproval = body.via === 'sms'

    const { data: draft, error } = await supabase
      .from('crew_briefing_drafts')
      .select('*')
      .eq('id', params.id)
      .eq('status', 'draft')
      .single()

    if (error || !draft) {
      return NextResponse.json({ error: 'Briefing not found or already sent' }, { status: 404 })
    }

    // Step 1: preview (app callers only — SMS has already approved)
    if (!isSmsApproval && !body.confirmed) {
      return NextResponse.json({
        success: true,
        preview: true,
        to: draft.recipient_email,
        subject: draft.subject,
        html: draft.body_html,
        message: 'Review this briefing. Call again with confirmed: true to send.',
      })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: 'NIGHT manoeuvres <content@signallabos.com>',
      to: draft.recipient_email,
      subject: draft.subject,
      html: draft.body_html,
      text: draft.body_text,
    })

    // Mark as sent
    await supabase
      .from('crew_briefing_drafts')
      .update({ status: 'sent', sent_at: new Date().toISOString(), approved_via: approvedVia })
      .eq('id', draft.id)

    // Notify artist
    const { createNotification } = await import('@/lib/notifications')
    await createNotification({
      type: 'system',
      title: `Briefing sent to ${draft.recipient_name || draft.recipient_email}`,
      message: `Content brief for ${draft.subject.replace('Content brief: ', '')} delivered`,
      href: `/gigs/${draft.gig_id}`,
      gig_id: draft.gig_id,
    })

    return NextResponse.json({ success: true, sentTo: draft.recipient_email })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
