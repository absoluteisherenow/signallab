import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients } from '@/lib/gmail-accounts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function makeRFC2822(to: string, from: string, subject: string, html: string): string {
  const boundary = `boundary_${Date.now()}`
  const msg = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(html).toString('base64'),
    `--${boundary}--`,
  ].join('\r\n')
  return Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function buildEmailData(id: string, toOverride?: string) {
  const [{ data: invoice }, { data: settings }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', id).single(),
    supabase.from('artist_settings').select('profile, payment').single(),
  ])
  if (!invoice) return null

  const profile = settings?.profile || {}
  const payment = settings?.payment || {}
  const artistName = invoice.artist_name || payment.legal_name || profile.name || 'Artist'
  const invoiceNumber = `INV-${id.slice(-6).toUpperCase()}`
  const invoiceUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'}/api/invoices/${id}`
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'On receipt'

  let promoterName = invoice.notes || ''
  let promoterEmail = toOverride || ''
  if (invoice.gig_id && (!promoterName || !promoterEmail)) {
    const { data: gig } = await supabase.from('gigs').select('promoter_name, promoter_email').eq('id', invoice.gig_id).single()
    if (gig) {
      promoterName = promoterName || gig.promoter_name || ''
      promoterEmail = promoterEmail || gig.promoter_email || ''
    }
  }

  const subject = `Invoice: ${invoice.gig_title} — ${invoiceNumber}`
  // notes may be a multi-line billing block — use only the first line for display
  const promoterFirstLine = promoterName ? promoterName.split('\n')[0].trim() : ''
  // If it looks like a company (all caps, or contains Ltd/Pty/Trust/Group/Festival etc), greet as "Hi Team"
  const isCompany = promoterFirstLine && (
    /^[A-Z0-9\s&.,\-']+$/.test(promoterFirstLine) ||
    /\b(Ltd|Pty|Trust|Group|Festival|Agency|Productions?|Events?|Management|Inc|LLC)\b/i.test(promoterFirstLine)
  )
  const greeting = promoterFirstLine
    ? isCompany ? `Hi Team,` : `Hi ${promoterFirstLine.split(' ')[0]},`
    : 'Hi,'

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
body { font-family: 'Courier New', monospace; color: #111; background: #fff; padding: 40px; max-width: 600px; margin: 0 auto; }
.header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 28px; }
.artist { font-size: 18px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
.body-text { font-size: 14px; line-height: 1.8; color: #333; margin-bottom: 28px; }
.box { background: #111; color: #fff; padding: 20px 24px; margin: 24px 0; display: flex; justify-content: space-between; align-items: flex-start; }
.box-label { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
.box-value { font-size: 22px; font-weight: 700; }
.box-meta { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 4px; }
.btn { display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 14px 28px; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; margin: 8px 0; }
.footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 10px; color: #888; line-height: 1.8; }
</style></head>
<body>
<div class="header">
  <div class="artist">${artistName}</div>
</div>
<div class="body-text">
  <p>${greeting}</p>
  <p>Please find your invoice for <strong>${invoice.gig_title}</strong> below.</p>
  <p><strong>Please pay in ${invoice.currency} only.</strong> Any foreign exchange charges incurred will be charged back to the payee.</p>
</div>
<div class="box">
  <div>
    <div class="box-label">Amount due</div>
    <div class="box-value">${invoice.currency} ${Number(invoice.amount).toLocaleString()}</div>
    <div class="box-meta">${invoice.type === 'deposit' ? 'Deposit' : invoice.type === 'balance' ? 'Balance' : 'Full fee'} · ${invoiceNumber}</div>
  </div>
  <div style="text-align:right">
    <div class="box-label">Due</div>
    <div style="font-size:14px;color:#fff;margin-top:4px">${dueDate}</div>
  </div>
</div>
<p style="margin:24px 0 8px;font-size:13px;color:#333">View full invoice with payment details:</p>
<a href="${invoiceUrl}" class="btn">View Invoice →</a>
<div class="footer">
  Reference: ${invoiceNumber}<br>
  ${payment.address ? payment.address.replace(/\n/g, ' · ') + '<br>' : ''}
  ${payment.vat_number ? `VAT / Tax: ${payment.vat_number}<br>` : ''}
  <br>
  <span style="letter-spacing:0.1em;text-transform:uppercase;font-size:9px">Signal Lab OS — Tailored Artist OS</span>
</div>
</body>
</html>`

  return { invoice, artistName, invoiceNumber, invoiceUrl, dueDate, promoterName, promoterEmail, subject, greeting, html }
}

// GET — preview the email HTML in browser
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await buildEmailData(params.id)
    if (!data) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    return new NextResponse(data.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — send the email
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { to } = await req.json().catch(() => ({}))
    const data = await buildEmailData(params.id, to)
    if (!data) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const { artistName, invoiceUrl, invoice, dueDate, promoterEmail, subject, greeting, invoiceNumber, html } = data

    // Try Gmail send
    try {
      const clients = await getGmailClients()
      if (clients.length > 0 && promoterEmail) {
        const { gmail, email } = clients[0]
        const raw = makeRFC2822(promoterEmail, `${artistName} <${email}>`, subject, html)
        await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
        return NextResponse.json({ success: true, sent: true, sentFrom: email, to: promoterEmail, subject })
      }
    } catch {
      // Gmail not connected — fall through to mailto
    }

    // Mailto fallback
    const mailtoBody = encodeURIComponent(
      `${greeting}\n\nPlease find your invoice for ${invoice.gig_title} here:\n${invoiceUrl}\n\nAmount: ${invoice.currency} ${Number(invoice.amount).toLocaleString()}\nDue: ${dueDate}\nRef: ${invoiceNumber}\n\nPlease pay in ${invoice.currency} only. Any FX charges will be charged back to the payee.\n\n${artistName}\n\n--\nSignal Lab OS — Tailored Artist OS`
    )
    const mailto = `mailto:${promoterEmail}?subject=${encodeURIComponent(subject)}&body=${mailtoBody}`
    return NextResponse.json({ success: true, sent: false, mailto, subject })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
