import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const [{ data: invoice, error: invErr }, { data: settings }] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', params.id).single(),
      supabase.from('artist_settings').select('profile, payment').single(),
    ])
    if (invErr || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // Pull promoter info from linked gig if available
    let promoterName = invoice.notes || ''
    let promoterEmail = ''
    let gigDate = ''
    let gigLocation = ''
    let gigVenue = ''
    let gigNotes = ''
    if (invoice.gig_id) {
      const { data: gig } = await supabase
        .from('gigs')
        .select('promoter_name, promoter_email, date, location, venue, notes')
        .eq('id', invoice.gig_id)
        .single()
      if (gig) {
        promoterName = promoterName || gig.promoter_name || ''
        promoterEmail = gig.promoter_email || ''
        gigDate = gig.date || ''
        gigLocation = gig.location || ''
        gigVenue = gig.venue || ''
        gigNotes = gig.notes || ''
      }
    }

    const profile = settings?.profile || {}
    const payment = settings?.payment || {}
    const artistName = invoice.artist_name || payment.legal_name || profile.name || 'Artist'
    const address = (payment.address || '160DL Studios, Dalston Lane\nLondon E8 1NG').replace(/\n/g, '<br>')
    const vatNumber = payment.vat_number || profile.vatNumber || ''
    const paymentTerms = payment.payment_terms || '30'
    // Bank accounts stored in profile.bankAccounts (camelCase) from onboarding
    const bankAccounts: Array<Record<string, string>> = profile.bankAccounts || payment.bank_accounts || []

    // Find matching bank account by currency, or use default
    const matchingBank = bankAccounts.find((b: Record<string, string>) => b.currency === invoice.currency)
      || bankAccounts.find((b: Record<string, string>) => b.is_default || b.isDefault)
      || bankAccounts[0]

    const invoiceNumber = `INV-${params.id.slice(-6).toUpperCase()}`
    const issueDate = new Date(invoice.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : `${paymentTerms} days from invoice`

    // Country-specific: AUD requires ABN + "Tax Invoice" heading
    const isAUD = invoice.currency === 'AUD'
    const abn = isAUD ? (vatNumber || '') : ''
    const invoiceHeading = isAUD ? 'Tax Invoice' : 'Invoice'

    const payToName = payment.legal_name || (matchingBank?.accountName || matchingBank?.account_name) || artistName
    const bankSection = matchingBank ? `
      <div class="section">
        <div class="section-title">Payment details</div>
        <div class="row"><span>Pay to</span><span style="font-weight:500">${payToName}</span></div>
        ${(matchingBank.bankName || matchingBank.bank_name) ? `<div class="row"><span>Bank</span><span>${matchingBank.bankName || matchingBank.bank_name}</span></div>` : ''}
        ${matchingBank.currency ? `<div class="row"><span>Currency</span><span>${matchingBank.currency}</span></div>` : ''}
        ${(matchingBank.sortCode || matchingBank.sort_code) ? `<div class="row"><span>Sort code</span><span>${matchingBank.sortCode || matchingBank.sort_code}</span></div>` : ''}
        ${(matchingBank.accountNumber || matchingBank.account_number) ? `<div class="row"><span>Account number</span><span>${matchingBank.accountNumber || matchingBank.account_number}</span></div>` : ''}
        ${matchingBank.iban ? `<div class="row"><span>IBAN</span><span>${matchingBank.iban}</span></div>` : ''}
        ${(matchingBank.bic || matchingBank.swift_bic) ? `<div class="row"><span>SWIFT / BIC</span><span>${matchingBank.bic || matchingBank.swift_bic}</span></div>` : ''}
        ${(matchingBank.intermediaryBic || matchingBank.intermediary_bic) ? `<div class="row"><span>Intermediary BIC</span><span>${matchingBank.intermediaryBic || matchingBank.intermediary_bic}</span></div>` : ''}
      </div>
    ` : '<p style="color:#888;font-size:13px">No bank account configured — add payment details in Settings.</p>'

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${invoiceNumber} — ${invoice.gig_title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@300&family=DM+Mono:wght@300;400;500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Mono', 'Courier New', monospace; background: #f5f5f5; color: #111; padding: 24px; font-size: 13px; }
  .invoice { background: #fff; max-width: 760px; margin: 0 auto; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 1.5px solid #111; padding-bottom: 18px; }
  .logo { width: 220px; height: auto; display: block; }
  .invoice-label { font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: #888; margin-bottom: 4px; font-weight: 300; }
  .invoice-number { font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
  .invoice-date { font-size: 11px; color: #555; margin-top: 4px; font-weight: 300; }
  .pulse-motif { width: 100%; height: 24px; overflow: hidden; opacity: 0.05; margin-bottom: 24px; }
  .section-title { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #888; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e5e5; font-weight: 300; }
  .amount-block { background: #111; color: #fff; padding: 22px 32px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #b08d57; }
  .amount-label { font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin-bottom: 6px; font-weight: 300; }
  .amount-value { font-family: 'Unbounded', sans-serif; font-weight: 300; font-size: 32px; letter-spacing: 0.02em; color: #f0ebe2; }
  .amount-meta { font-size: 11px; color: rgba(255,255,255,0.45); margin-top: 4px; letter-spacing: 0.06em; font-weight: 300; }
  .due-value { font-size: 15px; color: #c9a96e; font-weight: 500; margin-top: 3px; }
  .section { margin-bottom: 20px; page-break-inside: avoid; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e8e3da; font-size: 13px; }
  .row span:first-child { color: #555; font-weight: 300; }
  .row span:last-child { font-weight: 600; }
  .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #888; text-align: center; font-weight: 300; line-height: 1.8; }
  .download-btn { position: fixed; top: 24px; right: 24px; background: #111; color: #fff; border: none; padding: 10px 20px; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; z-index: 100; }
  .download-btn:hover { background: #333; }
  @media print { html { zoom: 0.65; } body { background: #fff; padding: 0; } .invoice { box-shadow: none; } .download-btn { display: none; } @page { size: A4; margin: 8mm; } }
</style>
</head>
<body>
<button class="download-btn" onclick="">Download PDF</button>
<div class="invoice">

  <div class="header">
    <div style="font-size:22px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding-top:4px">${artistName}</div>
    <div style="text-align:right">
      <div class="invoice-label">${invoiceHeading}</div>
      <div class="invoice-number">${invoiceNumber}</div>
      <div class="invoice-date">Issued: ${issueDate}</div>
    </div>
  </div>

  <div class="pulse-motif">
    <svg width="100%" height="24" viewBox="0 0 760 24" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <polyline points="0,12 120,12 180,4 240,20 300,2 360,18 420,8 480,12 760,12" stroke="#070706" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;gap:32px">
    <div>
      ${promoterName ? `
      <div class="section-title">Bill to</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:4px">${promoterName.split('\n')[0].trim()}</div>
      <div style="font-size:12px;color:#555;line-height:1.8">${promoterName.replace(/\n/g, '<br>')}</div>
      ${promoterEmail ? `<div style="font-size:11px;color:#888;margin-top:4px">${promoterEmail}</div>` : ''}
      ` : ''}
    </div>
    <div style="text-align:right">
      <div class="section-title">Event details</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:4px">${invoice.gig_title}</div>
      ${gigVenue ? `<div style="font-size:12px;color:#555">${gigVenue}</div>` : ''}
      ${gigDate ? `<div style="font-size:11px;color:#888;margin-top:4px">${new Date(gigDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>` : ''}
      ${gigLocation ? `<div style="font-size:11px;color:#888">${gigLocation}</div>` : ''}
      ${invoice.type ? `<div style="font-size:10px;color:#aaa;margin-top:6px;text-transform:uppercase;letter-spacing:0.2em">${invoice.type === 'full' ? 'Full fee' : invoice.type === 'deposit' ? 'Deposit' : 'Balance'}</div>` : ''}
    </div>
  </div>

  <div class="amount-block">
    <div>
      <div class="amount-label">${invoice.wht_rate ? 'Gross fee' : 'Amount due'}</div>
      <div class="amount-value">${invoice.currency} ${Number(invoice.amount).toLocaleString()}</div>
      ${invoice.wht_rate ? `
      <div class="amount-meta" style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.1);padding-top:10px">
        WHT ${invoice.wht_rate}% — ${invoice.currency} ${Math.round(Number(invoice.amount) * (invoice.wht_rate / 100)).toLocaleString()}
      </div>
      <div style="font-size:22px;font-weight:600;color:#fff;margin-top:6px">
        Net: ${invoice.currency} ${Math.round(Number(invoice.amount) * (1 - invoice.wht_rate / 100)).toLocaleString()}
      </div>` : `
      <div class="amount-meta">${invoice.status === 'paid' ? 'PAID' : 'PENDING PAYMENT'}</div>`}
      ${isAUD && !invoice.wht_rate ? `<div class="amount-meta" style="margin-top:8px;letter-spacing:0.1em">WHT: 0% — DETERMINED</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="amount-label">Due date</div>
      <div class="due-value">${dueDate}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Line items</div>
    <div class="row" style="font-weight:600;padding:12px 0;border-bottom:2px solid #111">
      <span style="color:#111">Description</span>
      <span style="color:#111">Amount</span>
    </div>
    <div class="row">
      <span>${invoice.gig_title}${invoice.type && invoice.type !== 'full' ? ` — ${invoice.type === 'deposit' ? 'Deposit' : 'Balance'}` : ''}</span>
      <span>${invoice.currency} ${Number(invoice.amount).toLocaleString()}</span>
    </div>
    ${invoice.wht_rate ? `
    <div class="row" style="font-size:11px">
      <span>WHT deduction (${invoice.wht_rate}%)</span>
      <span>− ${invoice.currency} ${Math.round(Number(invoice.amount) * (invoice.wht_rate / 100)).toLocaleString()}</span>
    </div>
    <div class="row" style="font-weight:700;border-bottom:2px solid #111">
      <span style="color:#111">Net payable</span>
      <span style="color:#111">${invoice.currency} ${Math.round(Number(invoice.amount) * (1 - invoice.wht_rate / 100)).toLocaleString()}</span>
    </div>` : ''}
  </div>

  ${bankSection}

  <div class="footer">
    <p style="margin-bottom:8px">Please use <strong>${invoiceNumber}</strong> as your payment reference.</p>
    <p style="margin-bottom:16px"><strong>Please pay in ${invoice.currency} only.</strong> Any foreign exchange charges incurred will be charged back to the payee.</p>
    <p style="margin-bottom:4px">Payment is due by the date shown above.</p>
    <p style="margin-bottom:2px">${artistName} &nbsp;|&nbsp; ${address.replace(/<br>/g, ', ')}</p>
    <p style="margin-bottom:2px">${(payment.email || profile.email || 'advancingabsolute@gmail.com').replace('@', '&#64;')}</p>
    ${vatNumber ? `<p style="margin-bottom:12px">${isAUD ? 'ABN' : 'VAT'}: ${vatNumber}</p>` : '<p style="margin-bottom:12px"></p>'}
    <a href="https://signallabos.com/join" style="display:inline-flex;align-items:center;gap:6px;color:#bbb;text-decoration:none;font-size:10px">
      <svg width="14" height="14" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle">
        <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#b08d57" stroke-width="1.5" opacity="0.5"/>
        <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#b08d57" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
      Signal Lab OS
    </a>
  </div>

</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
  document.querySelector('.download-btn').onclick = function() {
    const btn = document.querySelector('.download-btn');
    btn.style.display = 'none';
    html2pdf().set({
      margin: 8,
      filename: '${invoiceNumber}.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(document.querySelector('.invoice')).save().then(function() {
      btn.style.display = '';
    });
  }
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
  try {
    const body = await req.json()
    const updates: Record<string, any> = {}
    if (body.status) updates.status = body.status
    if (body.status === 'paid') updates.paid_at = new Date().toISOString()
    if (body.due_date) updates.due_date = body.due_date
    if (body.amount !== undefined) updates.amount = body.amount
    if (body.notes !== undefined) updates.notes = body.notes

    const { data, error } = await supabase
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
  try {
    const { error } = await supabase.from('invoices').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
