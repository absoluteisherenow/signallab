import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  try {
    const { contacts, message, subject, releaseId } = await req.json()

    if (!contacts?.length || !message?.trim()) {
      return NextResponse.json({ error: 'No contacts or message provided' }, { status: 400 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const sent: string[] = []
    const errors: { id: string; name: string; error: string }[] = []

    // Send individually so each is personalised and failures are per-contact
    for (const contact of contacts) {
      if (!contact.email) continue
      try {
        // Convert plain text message to simple HTML — preserve line breaks
        const htmlBody = message
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')

        await resend.emails.send({
          from: 'Signal Lab OS <onboarding@resend.dev>',
          to: contact.email,
          subject: subject || 'New release',
          html: `<div style="font-family:monospace;background:#070706;color:#f0ebe2;padding:40px;max-width:560px">
<p style="font-size:14px;line-height:1.8;color:#f0ebe2;margin:0 0 32px">${htmlBody}</p>
<div style="margin-top:40px;padding-top:20px;border-top:1px solid #1a1917;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#52504c">Signal Lab OS &middot; signallabos.com</div>
</div>`,
        })
        sent.push(contact.id)
      } catch (err: any) {
        errors.push({ id: contact.id, name: contact.name, error: err.message || 'Send failed' })
      }
    }

    return NextResponse.json({ success: true, sent, errors })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 })
  }
}
