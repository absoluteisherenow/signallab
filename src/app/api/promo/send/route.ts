import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

// POST — preview OR send promo emails with tracked links
// Body: { contacts, message, subject, track_url, track_title, track_artist, track_label, confirmed?: boolean }
// Step 1 (no confirmed): returns preview of what will be sent
// Step 2 (confirmed: true): creates blast + tracked links, sends emails

export async function POST(req: NextRequest) {
  try {
    const { contacts, message, subject, track_url, track_title, track_artist, track_label, confirmed } = await req.json()

    if (!contacts?.length || !message?.trim()) {
      return NextResponse.json({ error: 'No contacts or message provided' }, { status: 400 })
    }

    const emailContacts = contacts.filter((c: any) => c.email)

    // Step 1: preview only
    if (!confirmed) {
      // Show preview with placeholder link
      const previewMessage = track_url
        ? message.replace(track_url, `${APP_URL}/go/[tracked-link]`)
        : message
      const htmlBody = previewMessage
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')

      const previewHtml = `<div style="font-family:monospace;background:#050505;color:#f2f2f2;padding:40px;max-width:560px">
<p style="font-size:14px;line-height:1.8;color:#f2f2f2;margin:0 0 32px">${htmlBody}</p>
<div style="margin-top:40px;padding-top:20px;border-top:1px solid #1d1d1d;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#909090">NIGHT manoeuvres</div>
</div>`

      return NextResponse.json({
        success: true,
        preview: true,
        subject: subject || 'New release',
        html: previewHtml,
        recipientCount: emailContacts.length,
        recipients: emailContacts.map((c: any) => ({ name: c.name, email: c.email })),
        message: 'Review this promo email. Call again with confirmed: true to send.',
      })
    }

    // Step 2: confirmed — create blast, tracked links, send emails
    const resend = new Resend(process.env.RESEND_API_KEY)

    // Create blast record
    const { data: blast } = await supabase
      .from('promo_blasts')
      .insert({
        track_url: track_url || null,
        track_title: track_title || null,
        track_artist: track_artist || null,
        track_label: track_label || null,
        message,
        contact_count: emailContacts.length,
      })
      .select()
      .single()

    // Generate tracked links per contact. Bulk insert (one round-trip, transactional)
    // — was per-contact await which threw on first failure (unique-code collision,
    // constraint violation, network blip) and aborted the whole blast before any
    // email sent. Contacts we fail to generate links for fall through to the raw
    // track_url in the send loop below.
    const trackedLinks: Record<string, string> = {}
    if (track_url && blast) {
      const rows = emailContacts.map((contact: any) => ({
        blast_id: blast.id,
        contact_id: contact.id,
        code: Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4),
        destination_url: track_url,
      }))
      const { data: inserted, error: linkErr } = await supabase
        .from('promo_tracked_links')
        .insert(rows)
        .select('contact_id, code')
      if (linkErr) {
        console.error('[promo/send] tracked link insert failed — falling back to raw URL:', linkErr.message)
      }
      for (const row of inserted || []) {
        trackedLinks[row.contact_id as string] = `${APP_URL}/go/${row.code}`
      }
    }

    const sent: string[] = []
    const errors: { id: string; name: string; error: string }[] = []

    for (const contact of emailContacts) {
      try {
        // Replace the raw track URL with this contact's tracked link
        const contactLink = trackedLinks[contact.id] || track_url || ''
        let personalMessage = message
        if (track_url && contactLink) {
          personalMessage = message.replace(track_url, contactLink)
        }
        // If message doesn't contain the URL, append the tracked link
        if (contactLink && !personalMessage.includes(contactLink)) {
          personalMessage += `\n\n${contactLink}`
        }

        // Personalise greeting if contact has a name
        if (contact.name) {
          personalMessage = personalMessage
            .replace(/^(Hey|Hi|Hello)\s*,?\s*$/mi, `$1 ${contact.name},`)
            .replace(/^(Hey|Hi|Hello)\s*$/mi, `$1 ${contact.name}`)
        }

        const htmlBody = personalMessage
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')

        const html = `<div style="font-family:monospace;background:#050505;color:#f2f2f2;padding:40px;max-width:560px">
<p style="font-size:14px;line-height:1.8;color:#f2f2f2;margin:0 0 32px">${htmlBody}</p>
<div style="margin-top:40px;padding-top:20px;border-top:1px solid #1d1d1d;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#909090">NIGHT manoeuvres</div>
</div>`

        await resend.emails.send({
          from: 'NIGHT manoeuvres <promo@signallabos.com>',
          to: contact.email,
          subject: subject || 'New release',
          html,
        })
        sent.push(contact.id)

        // Update contact last sent
        await supabase.from('dj_contacts').update({
          last_sent_at: new Date().toISOString(),
          total_promos_sent: (contact.total_promos_sent || 0) + 1,
        }).eq('id', contact.id)
      } catch (err: any) {
        errors.push({ id: contact.id, name: contact.name, error: err.message || 'Send failed' })
      }
    }

    // Update blast with results
    if (blast) {
      await supabase.from('promo_blasts').update({
        sent_count: sent.length,
        failed_count: errors.length,
      }).eq('id', blast.id)
    }

    return NextResponse.json({ success: true, sent: sent.length, failed: errors.length, errors, blast_id: blast?.id })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 })
  }
}
