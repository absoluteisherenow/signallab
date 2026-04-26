import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/api-auth'

// GET is intentionally public — promoters open invoice links without an account.
// Service-role is fine for the read because we look up by invoice id only and
// scope artist_settings to invoice.user_id (no cross-tenant leak).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const printMode = req.nextUrl.searchParams.get('print') === '1'
  try {
    const { data: invoice, error: invErr } = await supabase
      .from('invoices').select('*').eq('id', params.id).single()
    if (invErr || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    const { data: settings } = await supabase
      .from('artist_settings').select('profile, payment').eq('user_id', invoice.user_id).maybeSingle()

    // Pull promoter info from linked gig if available
    let promoterName = invoice.notes || ''
    let promoterEmail = ''
    let gigDate = ''
    let gigLocation = ''
    let gigVenue = ''
    let gigNotes = ''
    if (invoice.gig_id) {
      // NOTE: gigs table has no promoter_name column — only promoter_email/phone/handle.
      // Selecting a non-existent column aborts the whole query (Postgres 42703),
      // which previously wiped venue/location/date too.
      const { data: gig } = await supabase
        .from('gigs')
        .select('promoter_email, promoter_handle, date, location, venue, notes')
        .eq('id', invoice.gig_id)
        .single()
      if (gig) {
        promoterEmail = gig.promoter_email || ''
        gigDate = gig.date || ''
        gigLocation = gig.location || ''
        gigVenue = gig.venue || ''
        gigNotes = gig.notes || ''
      }
    }

    const profile = settings?.profile || {}
    const payment = settings?.payment || {}
    const hideBranding = profile.hide_invoice_branding === true || payment.hide_invoice_branding === true
    const artistName = invoice.artist_name || payment.legal_name || profile.name || 'Artist'
    const address = (payment.address || '160DL Studios, Dalston Lane\nLondon E8 1NG').replace(/\n/g, '<br>')
    const vatNumber = payment.vat_number || profile.vatNumber || ''
    const paymentTerms = payment.payment_terms || '30'
    // Source of truth: profile.bankAccounts (camelCase). Legacy payment.bank_accounts
    // kept as fallback for rows not yet migrated — safe to remove once migration confirmed.
    const bankAccounts: Array<Record<string, string>> = profile.bankAccounts || payment.bank_accounts || []
    // NOTE: also check that payment.bank_accounts isn't stale-duplicated — settings page now writes only to profile.bankAccounts.

    // Find matching bank account by currency, or use default
    const matchingBank = bankAccounts.find((b: Record<string, string>) => b.currency === invoice.currency)
      || bankAccounts.find((b: Record<string, string>) => b.is_default || b.isDefault)
      || bankAccounts[0]

    const invoiceNumber = `INV-${params.id.slice(-6).toUpperCase()}`
    const issueDate = new Date(invoice.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : `${paymentTerms} days from invoice`

    // Prose line-item description: "DJ performance at <venue>, <location> — <date>"
    // Falls back to gig_title for non-performance invoices (royalties, remixes, radio mixes).
    const perfDate = gigDate || invoice.gig_date
    const formattedPerfDate = perfDate
      ? new Date(perfDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : ''
    const venueLoc = [gigVenue?.trim(), gigLocation?.trim()].filter(Boolean).join(', ')
    const hasGigContext = Boolean(venueLoc || formattedPerfDate)
    const lineItemDesc = hasGigContext
      ? `DJ performance at ${venueLoc}${formattedPerfDate ? ', ' + formattedPerfDate : ''}`
      : invoice.gig_title

    // Country-specific: AUD requires ABN + "Tax Invoice" heading
    const isAUD = invoice.currency === 'AUD'
    const abn = isAUD ? (vatNumber || '') : ''
    const invoiceHeading = isAUD ? 'Tax Invoice' : 'Invoice'

    const payToName = payment.legal_name || (matchingBank?.accountName || matchingBank?.account_name) || artistName

    // ── HARD RULE: bank detail display by invoice currency ────────────────────
    // GBP (domestic UK): sort code + account number ONLY — no IBAN/BIC/intermediary
    // EUR (SEPA): IBAN + SWIFT/BIC ONLY — no intermediary
    // AUD/USD: IBAN + SWIFT/BIC + intermediary BIC
    // See memory rule_invoice_bank_details.md — invoices bring in finances, must be right.
    const currency = invoice.currency
    const showGBPRails = currency === 'GBP'
    const showIBAN    = currency === 'EUR' || currency === 'AUD' || currency === 'USD'
    const showBIC     = currency === 'EUR' || currency === 'AUD' || currency === 'USD'
    const showIntermediary = currency === 'AUD' || currency === 'USD'

    const sortCodeVal      = matchingBank?.sortCode || matchingBank?.sort_code
    const accountNumberVal = matchingBank?.accountNumber || matchingBank?.account_number
    const bicVal           = matchingBank?.bic || matchingBank?.swift_bic
    const intermediaryVal  = matchingBank?.intermediaryBic || matchingBank?.intermediary_bic

    const bankSection = matchingBank ? `
      <div class="section">
        <div class="section-title">Payment details</div>
        <div class="row"><span>Pay to</span><span style="font-weight:500">${payToName}</span></div>
        ${(matchingBank.bankName || matchingBank.bank_name) ? `<div class="row"><span>Bank</span><span>${matchingBank.bankName || matchingBank.bank_name}</span></div>` : ''}
        <div class="row"><span>Currency</span><span>${currency}</span></div>
        ${showGBPRails && sortCodeVal ? `<div class="row"><span>Sort code</span><span>${sortCodeVal}</span></div>` : ''}
        ${showGBPRails && accountNumberVal ? `<div class="row"><span>Account number</span><span>${accountNumberVal}</span></div>` : ''}
        ${showIBAN && matchingBank.iban ? `<div class="row"><span>IBAN</span><span>${matchingBank.iban}</span></div>` : ''}
        ${showBIC && bicVal ? `<div class="row"><span>SWIFT / BIC</span><span>${bicVal}</span></div>` : ''}
        ${showIntermediary && intermediaryVal ? `<div class="row"><span>Intermediary BIC</span><span>${intermediaryVal}</span></div>` : ''}
      </div>
    ` : '<p style="color:#888;font-size:13px">No bank account configured — add payment details in Settings.</p>'

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${invoiceNumber}: ${invoice.gig_title}</title>
<style>
  @import  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #050505; color: #f2f2f2; padding: 32px; font-size: 13px; font-weight: 300; }
  .invoice { background: #0a0a0a; max-width: 780px; margin: 0 auto; padding: 48px; border: 1px solid #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #ff2a1a; padding-bottom: 24px; }
  .logo { width: 380px; height: auto; display: block; filter: invert(1); }
  .invoice-label { font-size: 10px; letter-spacing: 0.32em; text-transform: uppercase; color: rgba(242,242,242,0.45); margin-bottom: 8px; font-weight: 400; }
  .invoice-number { font-size: 42px; font-weight: 700; letter-spacing: 0.02em; line-height: 1; color: #f2f2f2; }
  .invoice-date { font-size: 11px; color: rgba(242,242,242,0.5); margin-top: 10px; font-weight: 300; letter-spacing: 0.04em; }
  .pulse-motif { width: 100%; height: 28px; overflow: hidden; opacity: 0.25; margin-bottom: 32px; }
  .section-title { font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(242,242,242,0.45); margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #1d1d1d; font-weight: 500; }
  .event-hero { font-size: 54px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.02; color: #f2f2f2; margin: 8px 0 14px; }
  .event-hero-sub { font-size: 13px; letter-spacing: 0.04em; color: rgba(242,242,242,0.65); font-weight: 400; line-height: 1.6; margin-bottom: 36px; }
  .event-hero-sub strong { color: #f2f2f2; font-weight: 500; }
  .event-title { font-size: 18px; font-weight: 600; letter-spacing: 0.01em; margin-bottom: 8px; line-height: 1.2; color: #f2f2f2; }
  .meta-line { font-size: 12px; color: rgba(242,242,242,0.7); line-height: 1.7; font-weight: 300; }
  .meta-line strong { color: #f2f2f2; font-weight: 500; }
  .amount-block { background: #050505; color: #fff; padding: 40px 40px 36px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end; border: 1px solid #1a1a1a; border-top: 3px solid #ff2a1a; gap: 24px; }
  .amount-label { font-size: 10px; letter-spacing: 0.32em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin-bottom: 14px; font-weight: 400; }
  .amount-value { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 500; font-size: 64px; letter-spacing: -0.02em; color: #f2f2f2; line-height: 0.95; }
  .amount-meta { font-size: 10px; color: rgba(255,255,255,0.55); margin-top: 12px; letter-spacing: 0.22em; font-weight: 500; text-transform: uppercase; }
  .status-stamp { display: inline-block; font-size: 11px; letter-spacing: 0.32em; font-weight: 700; text-transform: uppercase; padding: 6px 12px; margin-top: 16px; border: 1.5px solid #ff2a1a; color: #ff2a1a; }
  .status-stamp.paid { border-color: rgba(242,242,242,0.4); color: rgba(242,242,242,0.85); }
  .due-value { font-size: 28px; color: #ff2a1a; font-weight: 600; letter-spacing: -0.005em; line-height: 1; text-transform: uppercase; }
  .section { margin-bottom: 28px; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #1a1a1a; font-size: 13px; }
  .row span:first-child { color: rgba(242,242,242,0.55); font-weight: 300; }
  .row span:last-child { font-weight: 500; color: #f2f2f2; }
  .line-header { font-weight: 600 !important; padding: 12px 0 !important; border-bottom: 2px solid #ff2a1a !important; text-transform: uppercase; letter-spacing: 0.18em; font-size: 11px !important; }
  .line-header span { color: #f2f2f2 !important; }
  .line-total { font-weight: 700 !important; border-bottom: 2px solid #ff2a1a !important; padding-top: 12px !important; font-size: 14px !important; }
  .line-total span { color: #f2f2f2 !important; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #1d1d1d; font-size: 11px; color: rgba(242,242,242,0.5); text-align: center; font-weight: 300; line-height: 1.9; letter-spacing: 0.02em; }
  .footer strong { color: rgba(242,242,242,0.85); font-weight: 500; }
  .download-btn { position: fixed; top: 24px; right: 24px; background: #ff2a1a; color: #050505; border: none; padding: 12px 22px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; cursor: pointer; z-index: 100; font-weight: 700; }
  .download-btn:hover { background: #fff; }
  @media print { body { background: #050505; } .invoice { border: none; } .download-btn { display: none; } @page { size: A4; margin: 0; } }
</style>
</head>
<body>
<button class="download-btn" onclick="">Download PDF</button>
<div class="invoice">

  <div class="header">
    <div style="padding-top:4px">
      <img src="https://signallabos.com/nm-logo-bw.png" alt="NIGHT manoeuvres" class="logo" />
    </div>
    <div style="text-align:right">
      <div class="invoice-label">${invoiceHeading}</div>
      <div class="invoice-number">${invoiceNumber}</div>
      <div class="invoice-date">Issued: ${issueDate}</div>
    </div>
  </div>

  <div class="pulse-motif">
    <svg width="100%" height="28" viewBox="0 0 760 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <polyline points="0,14 120,14 180,4 240,24 300,2 360,22 420,8 480,14 760,14" stroke="#ff2a1a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  </div>

  <div class="section-title">Event</div>
  <div class="event-hero">${invoice.gig_title}</div>
  <div class="event-hero-sub">
    ${gigVenue ? `<strong>${gigVenue.trim()}</strong>` : ''}${gigVenue && (gigLocation || gigDate) ? ' &middot; ' : ''}${gigLocation ? gigLocation.trim() : ''}${gigLocation && gigDate ? ' &middot; ' : ''}${gigDate ? new Date(gigDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
    ${invoice.type ? `<div style="font-size:10px;color:#ff2a1a;margin-top:10px;text-transform:uppercase;letter-spacing:0.28em;font-weight:600">${invoice.type === 'full' ? 'Full fee' : invoice.type === 'deposit' ? 'Deposit · 50%' : 'Balance · 50%'}</div>` : ''}
  </div>

  ${promoterName ? `
  <div style="margin-bottom:32px">
    <div class="section-title">Bill to</div>
    <div class="event-title">${promoterName.split('\n')[0].trim()}</div>
    <div class="meta-line">${promoterName.replace(/\n/g, '<br>')}</div>
    ${promoterEmail ? `<div class="meta-line" style="margin-top:6px;color:rgba(242,242,242,0.5)">${promoterEmail}</div>` : ''}
  </div>
  ` : ''}

  <div class="amount-block">
    <div>
      <div class="amount-label">${invoice.wht_rate ? 'Gross fee' : 'Amount due'}</div>
      <div class="amount-value">${invoice.currency} ${Number(invoice.amount).toLocaleString()}</div>
      ${invoice.wht_rate ? `
      <div class="amount-meta" style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.12);padding-top:14px">
        WHT ${invoice.wht_rate}%: ${invoice.currency} ${Math.round(Number(invoice.amount) * (invoice.wht_rate / 100)).toLocaleString()}
      </div>
      <div style="font-size:28px;font-weight:600;color:#fff;margin-top:8px;letter-spacing:-0.01em">
        Net: ${invoice.currency} ${Math.round(Number(invoice.amount) * (1 - invoice.wht_rate / 100)).toLocaleString()}
      </div>` : `
      <div class="status-stamp${invoice.status === 'paid' ? ' paid' : ''}">${invoice.status === 'paid' ? 'Paid' : invoice.status === 'overdue' ? 'Overdue' : 'Pending payment'}</div>`}
      ${isAUD && !invoice.wht_rate ? `<div class="amount-meta" style="margin-top:10px;letter-spacing:0.22em">WHT: 0% (Determined)</div>` : ''}
    </div>
    <div style="text-align:right;white-space:nowrap">
      <div class="amount-label">Due</div>
      <div class="due-value">${dueDate}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Line items</div>
    <div class="row line-header">
      <span>Description</span>
      <span>Amount</span>
    </div>
    <div class="row">
      <span>${lineItemDesc}${invoice.type && invoice.type !== 'full' ? ` (${invoice.type === 'deposit' ? 'Deposit · 50%' : 'Balance · 50%'})` : ''}</span>
      <span>${invoice.currency} ${Number(invoice.amount).toLocaleString()}</span>
    </div>
    ${invoice.wht_rate ? `
    <div class="row" style="font-size:12px">
      <span>WHT deduction (${invoice.wht_rate}%)</span>
      <span>− ${invoice.currency} ${Math.round(Number(invoice.amount) * (invoice.wht_rate / 100)).toLocaleString()}</span>
    </div>
    <div class="row line-total">
      <span>Net payable</span>
      <span>${invoice.currency} ${Math.round(Number(invoice.amount) * (1 - invoice.wht_rate / 100)).toLocaleString()}</span>
    </div>` : ''}
  </div>

  ${bankSection}

  <div class="footer">
    <p style="margin-bottom:8px">Please use <strong>${invoiceNumber}</strong> as your payment reference.</p>
    <p style="margin-bottom:16px"><strong>Please pay in ${invoice.currency} only.</strong>${invoice.currency !== 'GBP' && invoice.currency !== 'EUR' ? ' Any foreign exchange charges incurred will be charged back to the payee.' : ''}</p>
    <p style="margin-bottom:4px">Payment is due by the date shown above.</p>
    <p style="margin-bottom:2px">${artistName} &nbsp;|&nbsp; ${address.replace(/<br>/g, ', ')}</p>
    <p style="margin-bottom:2px">${(payment.email || profile.email || 'advancingabsolute@gmail.com').replace('@', '&#64;')}</p>
    ${vatNumber ? `<p style="margin-bottom:12px">${isAUD ? 'ABN' : 'VAT'}: ${vatNumber}</p>` : '<p style="margin-bottom:12px"></p>'}
    ${hideBranding ? '' : `<a href="https://signallabos.com/waitlist" style="display:inline-flex;align-items:center;gap:10px;color:rgba(242,242,242,0.7);text-decoration:none;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:500">
      <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle">
        <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" stroke-width="1.8" opacity="0.6"/>
        <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#ff2a1a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
      Powered by Signal Lab OS
    </a>`}
  </div>

</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script>
  // Single-page A4 export: rasterize the whole invoice, then scale-to-fit so it
  // always lands on one page regardless of line-item count or notes length.
  document.querySelector('.download-btn').onclick = async function() {
    const btn = document.querySelector('.download-btn');
    const invoice = document.querySelector('.invoice');
    btn.style.display = 'none';
    try {
      const canvas = await html2canvas(invoice, { scale: 2, useCORS: true, backgroundColor: '#050505' });
      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgAspect = canvas.width / canvas.height;
      const pageAspect = pageW / pageH;
      let drawW, drawH;
      if (imgAspect > pageAspect) { drawW = pageW; drawH = pageW / imgAspect; }
      else { drawH = pageH; drawW = pageH * imgAspect; }
      pdf.setFillColor(5, 5, 5);
      pdf.rect(0, 0, pageW, pageH, 'F');
      pdf.addImage(imgData, 'JPEG', (pageW - drawW) / 2, (pageH - drawH) / 2, drawW, drawH);
      pdf.save('${invoiceNumber}.pdf');
    } finally {
      btn.style.display = '';
    }
  }
  ${printMode ? 'window.onload = function() { window.print(); }' : ''}
</script>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase: userClient } = gate
  try {
    const body = await req.json()
    const updates: Record<string, any> = {}
    if (body.status) updates.status = body.status
    if (body.status === 'paid') updates.paid_at = new Date().toISOString()
    if (body.due_date) updates.due_date = body.due_date
    if (body.amount !== undefined) updates.amount = body.amount
    if (body.notes !== undefined) updates.notes = body.notes

    const { data, error } = await userClient
      .from('invoices')
      .update(updates)
      .eq('id', params.id)
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, invoice: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase: userClient } = gate
  try {
    const { error } = await userClient.from('invoices').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
