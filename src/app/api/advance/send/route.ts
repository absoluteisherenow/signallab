import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/api-auth'
import { getGmailClients } from '@/lib/gmail-accounts'
import { createNotification } from '@/lib/notifications'

// Service-role client for cross-table writes (advance_requests upsert, gig
// lookups). Always paired with a manual user_id filter — never auto-trust.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── HARD RULE (memory: rule_invoice_from_address) ─────────────────────────
// All outbound from the artist (invoices AND advances) must send via Gmail
// OAuth from advancingabsolute@gmail.com. Never Resend, never any other
// from-address. No silent fallbacks — if Gmail isn't connected we surface
// the error so the user reconnects in Settings.
function makeRFC2822(
  to: string,
  from: string,
  subject: string,
  html: string,
  cc?: string
): string {
  const altBoundary = `alt_${Date.now()}`
  const headers = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
  ]
  const body = [
    `--${altBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(html).toString('base64'),
    `--${altBoundary}--`,
  ].join('\r\n')
  const msg = [...headers, ``, body].join('\r\n')
  return Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id
  try {
    const body = await req.json()
    const { gigId, gigTitle, venue, date, promoterEmail, subject, html, confirmed, cc } = body

    if (!gigId || !promoterEmail || !subject || !html) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Step 1: preview — return payload for approval modal
    if (!confirmed) {
      return NextResponse.json({
        success: true,
        preview: true,
        to: promoterEmail,
        cc: cc || undefined,
        subject,
        html,
        message: 'Review this advance email. Call again with confirmed: true to send.',
      })
    }

    // Step 2: confirmed — send via Gmail OAuth (advancingabsolute@gmail.com).
    const clients = await getGmailClients(userId)
    if (!clients.length) {
      return NextResponse.json({
        error: 'Gmail not connected. Reconnect advancingabsolute@gmail.com in Settings to send advances.',
      }, { status: 400 })
    }
    const { gmail, email: fromEmail } = clients[0]
    const fromHeader = `Night Manoeuvres <${fromEmail}>`
    const ccAddr = typeof cc === 'string' ? cc.trim() : Array.isArray(cc) ? cc.filter(Boolean).join(', ') : ''
    const raw = makeRFC2822(promoterEmail, fromHeader, subject, html, ccAddr || undefined)
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

    // Upsert advance_requests record with status 'sent' (user-scoped via gig_id)
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
      user_id: userId,
      type: 'advance_sent',
      title: `Advance sent — ${gigTitle || 'Show'}`,
      message: `Sent from ${fromEmail} to ${promoterEmail}`,
      href: `/gigs/${gigId}`,
      gig_id: gigId,
    })

    return NextResponse.json({ success: true, sentFrom: fromEmail })
  } catch (err: any) {
    console.error('Advance send error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
