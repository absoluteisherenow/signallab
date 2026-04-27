import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApprovalToken } from '@/lib/invoice-approval'
import { getGmailClients } from '@/lib/gmail-accounts'
import { buildInvoicePdf } from '@/lib/invoice-pdf'

export const dynamic = 'force-dynamic'

const FROM_EMAIL = 'advancingabsolute@gmail.com'
const ARCHIE_CC = 'archie@turbomgmt.co.uk'

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

function buildHtml(args: {
  artistName: string
  artistFirstName: string
  invoiceNumber: string
  invoiceUrl: string
  dueDate: string
  venue: string
  greeting: string
  invoice: any
  payment: Record<string, unknown>
}): string {
  const { artistName, artistFirstName, invoiceNumber, invoiceUrl, dueDate, venue, greeting, invoice, payment } = args
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #050505; background: #fff; padding: 40px; max-width: 600px; margin: 0 auto; font-size: 14px; font-weight: 400; }
.header { border-bottom: 1.5px solid #050505; padding-bottom: 16px; margin-bottom: 28px; }
.artist { font-weight: 200; font-size: 18px; letter-spacing: 0.08em; text-transform: uppercase; }
.body-text { font-size: 14px; line-height: 1.8; color: #909090; margin-bottom: 28px; font-weight: 300; }
.body-text strong { color: #050505; font-weight: 500; }
.box { background: #050505; color: #f2f2f2; padding: 20px 24px; margin: 24px 0; display: flex; justify-content: space-between; border-top: 2px solid #ff2a1a; }
.box-label { font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; color: rgba(242,242,242,0.45); margin-bottom: 4px; font-weight: 300; }
.box-value { font-weight: 300; font-size: 22px; }
.box-meta { font-size: 11px; color: rgba(242,242,242,0.45); margin-top: 4px; font-weight: 300; }
.btn { display: inline-block; background: #050505; color: #f2f2f2; text-decoration: none; padding: 14px 28px; font-size: 11px; font-weight: 300; letter-spacing: 0.18em; text-transform: uppercase; margin: 8px 0; border-left: 3px solid #ff2a1a; }
.footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #222; font-size: 10px; color: #909090; line-height: 1.8; font-weight: 300; }
</style></head>
<body>
<div class="header"><div class="artist">${artistName}</div></div>
<div class="body-text">
  <p>${greeting}</p>
  <p>${
    invoice.type === 'deposit'
      ? `Great to have the${venue ? ` <strong>${venue}</strong>` : ''} booking locked in. Deposit invoice below.`
      : `Thanks again for having us${venue ? ` at <strong>${venue}</strong>` : ''}. Invoice for the night is attached below.`
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
<p style="margin:28px 0 4px;font-size:14px;font-weight:400">Let me know if you have any questions.</p>
<p style="margin:16px 0 0;font-size:14px;font-weight:500">${artistFirstName}</p>
<div class="footer">
  Reference: ${invoiceNumber}<br>
  Please email a remittance advice to advancingabsolute@gmail.com once payment is sent.<br>
  ${payment.address ? (payment.address as string).replace(/\n/g, ' · ') + '<br>' : ''}
  ${payment.vat_number ? `VAT / Tax: ${payment.vat_number}<br>` : ''}
</div>
</body>
</html>`
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.nextUrl.searchParams.get('t') || ''
    const check = verifyApprovalToken(token, params.id)
    if (!check.valid) {
      return NextResponse.json({ error: 'invalid_token', reason: check.reason, message: 'Link expired or invalid — generate a fresh SMS.' }, { status: 401 })
    }

    const { data: invoice } = await supabase.from('invoices').select('*').eq('id', params.id).maybeSingle()
    if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    // status=draft after a previous send means the invoice was amended and needs re-approval.
    if (invoice.sent_to_promoter_at && invoice.status !== 'draft') {
      return NextResponse.json({ error: 'already_sent', message: `Already sent ${new Date(invoice.sent_to_promoter_at).toLocaleString('en-GB')}` }, { status: 409 })
    }

    // The signed approval token already binds to this invoice id, so the caller
    // is authorized. Derive tenant scope from the invoice itself — this pulls the
    // right artist_settings + gigs row + Gmail client for the owner, even if
    // multiple tenants share the FROM_EMAIL address.
    const invoiceUserId: string | null = (invoice.user_id as string | null) || null

    const [{ data: settings }, gigRes] = await Promise.all([
      invoiceUserId
        ? supabase.from('artist_settings').select('profile, payment').eq('user_id', invoiceUserId).maybeSingle()
        : supabase.from('artist_settings').select('profile, payment').maybeSingle(),
      invoice.gig_id
        ? (invoiceUserId
            ? supabase.from('gigs').select('promoter_email, venue').eq('id', invoice.gig_id).eq('user_id', invoiceUserId).maybeSingle()
            : supabase.from('gigs').select('promoter_email, venue').eq('id', invoice.gig_id).maybeSingle())
        : Promise.resolve({ data: null }),
    ])
    const gig = (gigRes as any).data as { promoter_email?: string; venue?: string } | null
    const profile = (settings?.profile || {}) as Record<string, unknown>
    const payment = (settings?.payment || {}) as Record<string, unknown>

    const toAddr = (invoice.sent_to_promoter_email as string) || gig?.promoter_email || ''
    if (!toAddr) {
      return NextResponse.json({ error: 'no_recipient', message: 'No recipient email on invoice — set one from the dashboard before approving.' }, { status: 400 })
    }
    const toLower = toAddr.toLowerCase()
    const ccAddr = toLower.includes('archie') || toLower.includes('turbomgmt') ? '' : ARCHIE_CC

    const artistName = (invoice.artist_name as string) || (payment.legal_name as string) || (profile.name as string) || 'Artist'
    const invoiceNumber = `INV-${params.id.slice(-6).toUpperCase()}`
    const invoiceUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'}/api/invoices/${params.id}`
    const venue = gig?.venue || (invoice.gig_title as string)?.match(/\bat\s+(.+)$/i)?.[1]?.trim() || ''
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'On receipt'

    const firstBank = (profile.bankAccounts as Array<Record<string, string>> | undefined)?.[0]
      || (payment.bank_accounts as Array<Record<string, string>> | undefined)?.[0]
    const signoffSource = (payment.legal_name as string) || firstBank?.accountName || firstBank?.account_name || 'Anthony'
    const artistFirstName = signoffSource.split(' ')[0]

    const localPart = toAddr.split('@')[0].split(/[.+_-]/)[0].replace(/\d+/g, '')
    const generic = /^(hello|info|bookings?|team|accounts?|admin|contact|mail|office)$/i
    const greetingName = localPart && !generic.test(localPart)
      ? localPart[0].toUpperCase() + localPart.slice(1).toLowerCase()
      : 'Team'
    const greeting = `Hi ${greetingName},`

    const subject = `Invoice ${invoiceNumber}: ${invoice.gig_title}`
    const html = buildHtml({ artistName, artistFirstName, invoiceNumber, invoiceUrl, dueDate, venue, greeting, invoice, payment })

    // Attach PDF
    const pdfBytes = await buildInvoicePdf(params.id).catch(() => null)
    const attachment = pdfBytes ? {
      filename: `${invoiceNumber}.pdf`,
      contentBase64: Buffer.from(pdfBytes).toString('base64'),
      mime: 'application/pdf',
    } : undefined

    // Locate advancingabsolute@gmail.com client — NEVER fall back to other senders.
    // Scoped to the invoice owner: each tenant has their own OAuth-connected Gmail,
    // so we pick the right set of clients per invoice rather than pulling all.
    if (!invoiceUserId) {
      return NextResponse.json({
        error: 'invoice_unowned',
        message: 'Invoice missing user_id — legacy record that predates multi-tenant migration. Relink to a user before sending.',
      }, { status: 400 })
    }
    const clients = await getGmailClients(invoiceUserId)
    const match = clients.find(c => c.email.toLowerCase() === FROM_EMAIL)
    if (!match) {
      return NextResponse.json({
        error: 'from_address_not_connected',
        message: `${FROM_EMAIL} is not connected in Gmail. Connect it in Settings before approving.`,
      }, { status: 503 })
    }

    const raw = makeRFC2822(toAddr, `${artistName} <${FROM_EMAIL}>`, subject, html, ccAddr || undefined, attachment)
    await match.gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

    // Double-scope on (id, user_id) to prevent a malformed token from flipping
    // another tenant's sent_to_promoter_at.
    await supabase.from('invoices').update({
      sent_to_promoter_at: new Date().toISOString(),
      sent_to_promoter_email: toAddr,
      send_mode: 'both',
    }).eq('id', params.id).eq('user_id', invoiceUserId)

    return NextResponse.json({
      success: true,
      sent: true,
      sentFrom: FROM_EMAIL,
      to: toAddr,
      cc: ccAddr || undefined,
      subject,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'send_failed', message: err?.message || 'Unknown error' }, { status: 500 })
  }
}
