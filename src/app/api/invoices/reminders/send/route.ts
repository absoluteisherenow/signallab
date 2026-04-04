import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST — send an approved reminder draft
// Body: { id: string } — the draft ID to send
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing draft id' }, { status: 400 })

    const { data: draft, error } = await supabase
      .from('invoice_reminder_drafts')
      .select('*')
      .eq('id', id)
      .eq('status', 'draft')
      .single()

    if (error || !draft) return NextResponse.json({ error: 'Draft not found or already sent' }, { status: 404 })

    // Send via Resend
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Night Manoeuvres <bookings@signallabos.com>',
      to: draft.promoter_email,
      subject: draft.subject,
      html: draft.body_html,
      text: draft.body_text,
    })

    // Update draft status to sent
    await supabase
      .from('invoice_reminder_drafts')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', id)

    // Notify
    await createNotification({
      type: 'invoice_overdue',
      title: `Reminder sent — ${draft.subject}`,
      message: `Sent to ${draft.promoter_email}`,
      href: '/finances',
    })

    return NextResponse.json({ success: true, sentTo: draft.promoter_email })
  } catch (err: any) {
    console.error('Reminder send error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
