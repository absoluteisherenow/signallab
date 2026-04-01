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
<head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@200;300&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
body { font-family: 'DM Mono', 'Courier New', monospace; color: #070706; background: #fff; padding: 40px; max-width: 600px; margin: 0 auto; font-size: 14px; font-weight: 400; }
.header { border-bottom: 1.5px solid #070706; padding-bottom: 16px; margin-bottom: 28px; }
.artist { font-family: 'Unbounded', Arial, sans-serif; font-weight: 200; font-size: 18px; letter-spacing: 0.08em; text-transform: uppercase; color: #070706; }
.body-text { font-size: 14px; line-height: 1.8; color: #52504c; margin-bottom: 28px; font-weight: 300; }
.body-text strong { color: #070706; font-weight: 500; }
.box { background: #070706; color: #f0ebe2; padding: 20px 24px; margin: 24px 0; display: flex; justify-content: space-between; align-items: flex-start; border-top: 2px solid #b08d57; }
.box-label { font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; color: rgba(240,235,226,0.45); margin-bottom: 4px; font-weight: 300; }
.box-value { font-family: 'Unbounded', Arial, sans-serif; font-weight: 300; font-size: 22px; color: #f0ebe2; }
.box-meta { font-size: 11px; color: rgba(240,235,226,0.45); margin-top: 4px; font-weight: 300; }
.btn { display: inline-block; background: #070706; color: #f0ebe2; text-decoration: none; padding: 14px 28px; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; font-weight: 300; letter-spacing: 0.18em; text-transform: uppercase; margin: 8px 0; border-left: 3px solid #b08d57; }
.footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e8e3da; font-size: 10px; color: #8a8780; line-height: 1.8; font-weight: 300; }
</style></head>
<body>
<div class="header">
  <div style="display:flex;align-items:center;gap:12px">
    <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#070706" stroke-width="1.2" opacity="0.12"/>
      <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#070706" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
    <div class="artist">${artistName}</div>
  </div>
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
    <div style="font-size:14px;color:#c9a96e;margin-top:4px;font-weight:500">${dueDate}</div>
  </div>
</div>
<p style="margin:24px 0 8px;font-size:13px;color:#52504c;font-weight:300">View full invoice with payment details:</p>
<a href="${invoiceUrl}" class="btn">View Invoice →</a>
<div class="footer">
  Reference: ${invoiceNumber}<br>
  ${payment.address ? payment.address.replace(/\n/g, ' · ') + '<br>' : ''}
  ${payment.vat_number ? `VAT / Tax: ${payment.vat_number}<br>` : ''}
</div>
<div style="margin-top:24px;padding-top:20px;border-top:1px solid #e8e3da;text-align:center">
  <svg width="16" height="16" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle">
    <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#b08d57" stroke-width="1.5" opacity="0.25"/>
    <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#b08d57" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>
  <span style="font-family:'Unbounded',Arial,sans-serif;font-weight:200;font-size:10px;color:#b08d57;letter-spacing:0.12em;text-transform:uppercase;margin-left:6px;vertical-align:middle">Signal Lab OS</span>
  <div style="font-size:9px;color:#8a8780;margin-top:6px;font-weight:300">Tailored Artist OS platform for electronic music</div>
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
