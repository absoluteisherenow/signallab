import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients } from '@/lib/gmail-accounts'
import { buildInvoicePdf } from '@/lib/invoice-pdf'
import { requireUser } from '@/lib/api-auth'

// Service role for artist_settings/gigs cross-table reads, paired with manual
// user_id filters in every query below. NEVER auto-trust this client to scope.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function makeRFC2822(
  to: string,
  from: string,
  subject: string,
  html: string,
  cc?: string,
  attachment?: { filename: string; contentBase64: string; mime: string }
): string {
  const mixedBoundary = `mixed_${Date.now()}`
  const altBoundary = `alt_${Date.now()}`
  const headers = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    attachment
      ? `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
      : `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
  ]

  // Wrap the HTML body in its own multipart/alternative, then optionally wrap
  // that inside multipart/mixed alongside the PDF. Gmail clients handle both.
  const htmlPart = [
    `--${altBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(html).toString('base64'),
    `--${altBoundary}--`,
  ].join('\r\n')

  let body: string
  if (attachment) {
    // Chunk base64 at 76 chars per RFC 2045
    const chunked = attachment.contentBase64.replace(/(.{76})/g, '$1\r\n')
    body = [
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      ``,
      htmlPart,
      ``,
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.mime}; name="${attachment.filename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      ``,
      chunked,
      `--${mixedBoundary}--`,
    ].join('\r\n')
  } else {
    body = htmlPart
  }

  const msg = [...headers, ``, body].join('\r\n')
  return Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function normaliseAddresses(v: string | string[] | undefined): string {
  if (!v) return ''
  const arr = Array.isArray(v) ? v : [v]
  return arr.map(s => s.trim()).filter(Boolean).join(', ')
}

async function buildEmailData(id: string, userId: string, toOverride?: string) {
  // Scoped load — invoice must belong to this user.
  const [{ data: invoice }, { data: settings }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', id).eq('user_id', userId).single(),
    supabase.from('artist_settings').select('profile, payment').eq('user_id', userId).maybeSingle(),
  ])
  if (!invoice) return null

  const profile = settings?.profile || {}
  const payment = settings?.payment || {}
  const artistName = invoice.artist_name || payment.legal_name || profile.name || 'Artist'
  const invoiceNumber = `INV-${id.slice(-6).toUpperCase()}`
  const invoiceUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'}/api/invoices/${id}`
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'On receipt'

  let promoterName = invoice.notes || ''
  let promoterEmail = toOverride || ''
  let venue = ''
  if (invoice.gig_id) {
    // NOTE: gigs table has no promoter_name column — selecting it aborts the whole
    // query (Postgres 42703), which previously wiped promoter_email and venue too.
    // Scope by user so we can't pull another tenant's gig via a leaked gig_id.
    const { data: gig } = await supabase.from('gigs').select('promoter_email, venue').eq('id', invoice.gig_id).eq('user_id', userId).single()
    if (gig) {
      promoterEmail = promoterEmail || gig.promoter_email || ''
      venue = gig.venue || ''
    }
  }
  // Fallback: extract venue from "… at <venue>" tail of gig_title
  if (!venue) {
    const m = invoice.gig_title?.match(/\bat\s+(.+)$/i)
    if (m) venue = m[1].trim()
  }
  // Sign-off uses real name, not the artist alias. profile.name resolves to
  // "NIGHT manoeuvres" which would sign "NIGHT" — wrong. Fall through to the bank
  // account holder (actual person) before defaulting.
  const firstBank = (profile.bankAccounts as Array<Record<string, string>> | undefined)?.[0]
    || (payment.bank_accounts as Array<Record<string, string>> | undefined)?.[0]
  const signoffSource = (payment.legal_name as string)
    || firstBank?.accountName
    || firstBank?.account_name
    || 'Anthony'
  const artistFirstName = signoffSource.split(' ')[0]

  const subject = `Invoice: ${invoice.gig_title} — ${invoiceNumber}`
  // notes may be a multi-line billing block — use only the first line for display
  const promoterFirstLine = promoterName ? promoterName.split('\n')[0].trim() : ''
  // If it looks like a company (all caps, or contains Ltd/Pty/Trust/Group/Festival etc), greet as "Hi Team"
  const isCompany = promoterFirstLine && (
    /^[A-Z0-9\s&.,\-']+$/.test(promoterFirstLine) ||
    /\b(Ltd|Pty|Trust|Group|Festival|Agency|Productions?|Events?|Management|Inc|LLC)\b/i.test(promoterFirstLine)
  )
  // If toOverride is provided and no promoter_name known, derive greeting from
  // the local-part of the email (e.g. archie@turbomgmt → "Hi Archie,").
  // Strip common noise like digits, dots, dashes. Skip generic inboxes (hello,
  // info, bookings, team, accounts, admin) → default to "Hi Team,".
  let greetingFromEmail = ''
  if (!promoterFirstLine && toOverride) {
    const local = toOverride.split('@')[0].split(/[.+_-]/)[0].replace(/\d+/g, '')
    const generic = /^(hello|info|bookings?|team|accounts?|admin|contact|mail|office)$/i
    if (local && !generic.test(local)) {
      greetingFromEmail = local[0].toUpperCase() + local.slice(1).toLowerCase()
    }
  }
  const greeting = promoterFirstLine
    ? isCompany ? `Hi Team,` : `Hi ${promoterFirstLine.split(' ')[0]},`
    : greetingFromEmail
      ? `Hi ${greetingFromEmail},`
      : 'Hi Team,'

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">

<style>
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #050505; background: #fff; padding: 40px; max-width: 600px; margin: 0 auto; font-size: 14px; font-weight: 400; }
.header { border-bottom: 1.5px solid #050505; padding-bottom: 16px; margin-bottom: 28px; }
.artist { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 200; font-size: 18px; letter-spacing: 0.08em; text-transform: uppercase; color: #050505; }
.body-text { font-size: 14px; line-height: 1.8; color: #909090; margin-bottom: 28px; font-weight: 300; }
.body-text strong { color: #050505; font-weight: 500; }
.box { background: #050505; color: #f2f2f2; padding: 20px 24px; margin: 24px 0; display: flex; justify-content: space-between; align-items: flex-start; border-top: 2px solid #ff2a1a; }
.box-label { font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; color: rgba(242,242,242,0.45); margin-bottom: 4px; font-weight: 300; }
.box-value { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 300; font-size: 22px; color: #f2f2f2; }
.box-meta { font-size: 11px; color: rgba(242,242,242,0.45); margin-top: 4px; font-weight: 300; }
.btn { display: inline-block; background: #050505; color: #f2f2f2; text-decoration: none; padding: 14px 28px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 300; letter-spacing: 0.18em; text-transform: uppercase; margin: 8px 0; border-left: 3px solid #ff2a1a; }
.footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #222; font-size: 10px; color: #909090; line-height: 1.8; font-weight: 300; }
</style></head>
<body>
<div class="header">
  <div style="display:flex;align-items:center;gap:12px">
    <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#050505" stroke-width="1.2" opacity="0.12"/>
      <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#050505" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
    <div class="artist">${artistName}</div>
  </div>
</div>
<div class="body-text">
  <p>${greeting}</p>
  <p>${
    invoice.type === 'deposit'
      ? `Great to have the${venue ? ` <strong>${venue}</strong>` : ''} booking locked in — deposit invoice below.`
      : `Thanks again for having us${venue ? ` at <strong>${venue}</strong>` : ''} — invoice for the night is attached below.`
  }</p>
</div>
<div class="box">
  <div>
    <div class="box-label">Amount due</div>
    <div class="box-value">${invoice.currency} ${Number(invoice.amount).toLocaleString()}</div>
    <div class="box-meta">${invoice.type === 'deposit' ? 'Deposit' : invoice.type === 'balance' ? 'Balance' : 'Full fee'} · ${invoiceNumber}</div>
  </div>
  <div style="text-align:right">
    <div class="box-label">Due</div>
    <div style="font-size:14px;color:#ff2a1a;margin-top:4px;font-weight:500">${dueDate}</div>
  </div>
</div>
<p style="margin:24px 0 8px;font-size:13px;color:#909090;font-weight:300">View full invoice with payment details:</p>
<a href="${invoiceUrl}" class="btn">View Invoice →</a>
<p style="margin:28px 0 4px;font-size:14px;color:#050505;font-weight:400">Let me know if you need anything else for your side.</p>
<p style="margin:16px 0 0;font-size:14px;color:#050505;font-weight:500">${artistFirstName}</p>
<div class="footer">
  Reference: ${invoiceNumber}<br>
  ${payment.address ? payment.address.replace(/\n/g, ' · ') + '<br>' : ''}
  ${payment.vat_number ? `VAT / Tax: ${payment.vat_number}<br>` : ''}
</div>
<div style="margin-top:24px;padding-top:20px;border-top:1px solid #222;text-align:center">
  <a href="https://signallabos.com/waitlist" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none">
    <svg width="16" height="16" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle">
      <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" stroke-width="1.5" opacity="0.25"/>
      <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#ff2a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
    <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:200;font-size:10px;color:#ff2a1a;letter-spacing:0.12em;text-transform:uppercase;vertical-align:middle">Signal Lab OS</span>
  </a>
  <div style="font-size:9px;color:#909090;margin-top:6px;font-weight:300">Tailored Artist OS platform for electronic music</div>
</div>
</body>
</html>`

  return { invoice, artistName, artistFirstName, invoiceNumber, invoiceUrl, dueDate, promoterName, promoterEmail, venue, subject, greeting, html }
}

// GET — preview the email HTML in browser
// Optional ?to=<email> to preview with a specific recipient (drives the greeting).
// User-scoped: 404s if the invoice belongs to another tenant.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  try {
    const toOverride = req.nextUrl.searchParams.get('to') || undefined
    const data = await buildEmailData(params.id, gate.user.id, toOverride)
    if (!data) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    return new NextResponse(data.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — preview OR send the invoice email
// Body: { to?: string | string[], cc?: string | string[], confirmed?: boolean, mode?: 'link' | 'attach' | 'both' }
//   mode = 'link'   → email body contains "View Invoice →" link only (default)
//   mode = 'attach' → PDF attached, no link button
//   mode = 'both'   → PDF attached AND link button
// Step 1 (no confirmed): returns preview data for approval
// Step 2 (confirmed: true): actually sends + stamps invoices.sent_to_promoter_at
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id
  try {
    const { to, cc, confirmed, mode: rawMode } = await req.json().catch(() => ({} as any))
    const mode: 'link' | 'attach' | 'both' = rawMode === 'attach' || rawMode === 'both' ? rawMode : 'link'
    const toAddr = normaliseAddresses(to)
    const ccAddr = normaliseAddresses(cc)
    const data = await buildEmailData(params.id, userId, toAddr || undefined)
    if (!data) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const { artistName, invoiceUrl, invoice, dueDate, promoterEmail, subject, greeting, invoiceNumber } = data
    const finalTo = toAddr || promoterEmail

    // Hide the View Invoice button when sending attach-only. Simple string
    // swap on the rendered HTML rather than threading mode through buildEmailData.
    const html = mode === 'attach'
      ? data.html.replace(/<p[^>]*>View full invoice[^<]*<\/p>\s*<a[^>]*class="btn"[^>]*>[^<]*<\/a>/i, '')
      : data.html

    // Step 1: return preview for approval (no sending)
    if (!confirmed) {
      return NextResponse.json({
        success: true,
        preview: true,
        to: finalTo,
        cc: ccAddr || undefined,
        subject,
        html,
        greeting,
        invoiceNumber,
        amount: `${invoice.currency} ${Number(invoice.amount).toLocaleString()}`,
        dueDate,
        mode,
        hasAttachment: mode !== 'link',
        message: 'Review this invoice email. Call again with confirmed: true to send.',
      })
    }

    // Build PDF attachment on-demand for attach/both modes. Skipped for 'link'
    // to keep the fast path fast.
    let attachment: { filename: string; contentBase64: string; mime: string } | undefined
    if (mode !== 'link') {
      const pdfBytes = await buildInvoicePdf(params.id)
      if (pdfBytes) {
        attachment = {
          filename: `${invoiceNumber}.pdf`,
          contentBase64: Buffer.from(pdfBytes).toString('base64'),
          mime: 'application/pdf',
        }
      }
    }

    // Step 2: confirmed — actually send.
    // Tenant-scoped: pulls only this user's connected Gmail clients.
    try {
      const clients = await getGmailClients(userId)
      if (clients.length > 0 && finalTo) {
        const { gmail, email } = clients[0]
        const raw = makeRFC2822(finalTo, `${artistName} <${email}>`, subject, html, ccAddr || undefined, attachment)
        await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
        // Double-scope on (id, user_id) — defensive redundancy since buildEmailData
        // already confirmed ownership.
        await supabase
          .from('invoices')
          .update({
            sent_to_promoter_at: new Date().toISOString(),
            sent_to_promoter_email: finalTo,
            send_mode: mode,
          })
          .eq('id', params.id)
          .eq('user_id', userId)
        return NextResponse.json({
          success: true, sent: true, sentFrom: email, to: finalTo, cc: ccAddr || undefined, subject, mode, attached: !!attachment,
        })
      }
    } catch {
      // Gmail not connected — fall through to mailto
    }

    // Mailto fallback
    const bodyLine = invoice.type === 'deposit'
      ? `Great to have the${data.venue ? ` ${data.venue}` : ''} booking locked in — deposit invoice below.`
      : `Thanks again for having us${data.venue ? ` at ${data.venue}` : ''} — invoice for the night is attached below.`
    const mailtoBody = encodeURIComponent(
      `${greeting}\n\n${bodyLine}\n\n${invoice.currency} ${Number(invoice.amount).toLocaleString()} · due ${dueDate}\nRef: ${invoiceNumber}\n\nView invoice: ${invoiceUrl}\n\nLet me know if you need anything else for your side.\n\n${data.artistFirstName}`
    )
    const mailto = `mailto:${finalTo}${ccAddr ? `?cc=${encodeURIComponent(ccAddr)}&` : '?'}subject=${encodeURIComponent(subject)}&body=${mailtoBody}`
    return NextResponse.json({ success: true, sent: false, mailto, subject })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
