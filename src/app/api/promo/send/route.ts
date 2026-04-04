import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

// POST — preview OR send promo emails
// Body: { contacts, message, subject, releaseId, confirmed?: boolean }
// Step 1 (no confirmed): returns preview of what will be sent
// Step 2 (confirmed: true): actually sends

export async function POST(req: NextRequest) {
  try {
    const { contacts, message, subject, releaseId, confirmed } = await req.json()

    if (!contacts?.length || !message?.trim()) {
      return NextResponse.json({ error: 'No contacts or message provided' }, { status: 400 })
    }

    // Convert plain text message to simple HTML — preserve line breaks
    const htmlBody = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')

    const previewHtml = `<div style="font-family:monospace;background:#070706;color:#f0ebe2;padding:40px;max-width:560px">
<p style="font-size:14px;line-height:1.8;color:#f0ebe2;margin:0 0 32px">${htmlBody}</p>
<div style="margin-top:40px;padding-top:20px;border-top:1px solid #1a1917;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#52504c">Signal Lab OS &middot; signallabos.com</div>
</div>`

    // Step 1: preview only — show what will be sent
    if (!confirmed) {
      return NextResponse.json({
        success: true,
        preview: true,
        subject: subject || 'New release',
        html: previewHtml,
        recipientCount: contacts.filter((c: any) => c.email).length,
        recipients: contacts.filter((c: any) => c.email).map((c: any) => ({ name: c.name, email: c.email })),
        message: 'Review this promo email. Call again with confirmed: true to send to all recipients.',
      })
    }

    // Step 2: confirmed — actually send
    const resend = new Resend(process.env.RESEND_API_KEY)
    const sent: string[] = []
    const errors: { id: string; name: string; error: string }[] = []

    for (const contact of contacts) {
      if (!contact.email) continue
      try {
        await resend.emails.send({
          from: 'Night Manoeuvres <promo@signallabos.com>',
          to: contact.email,
          subject: subject || 'New release',
          html: previewHtml,
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
