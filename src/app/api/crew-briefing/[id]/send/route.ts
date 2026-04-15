import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST: Approve and send a crew briefing draft
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const approvedVia = (await req.json().catch(() => ({}))).via || 'app'

    const { data: draft, error } = await supabase
      .from('crew_briefing_drafts')
      .select('*')
      .eq('id', params.id)
      .eq('status', 'draft')
      .single()

    if (error || !draft) {
      return NextResponse.json({ error: 'Briefing not found or already sent' }, { status: 404 })
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
