import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabase } from '@/lib/supabase'
import { createNotification } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  try {
    const { gigId, gigTitle, venue, date, promoterEmail, subject, html } = await req.json()

    if (!gigId || !promoterEmail || !subject || !html) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    // Send the approved email
    await resend.emails.send({
      from: 'Night Manoeuvres <advance@signallabos.com>',
      to: promoterEmail,
      subject,
      html,
    })

    // Upsert advance_requests record with status 'sent'
    await supabase.from('advance_requests').upsert(
      {
        gig_id: gigId,
        promoter_email: promoterEmail,
        completed: false,
        status: 'sent',
        subject,
        email_html: html,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'gig_id' }
    )

    // Notify the artist
    await createNotification({
      type: 'advance_sent',
      title: `Advance sent — ${gigTitle || 'Show'}`,
      message: `Approved and sent to ${promoterEmail}`,
      href: `/gigs/${gigId}`,
      gig_id: gigId,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Advance send error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
