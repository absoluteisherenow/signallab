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
    const address = (payment.address || '').replace(/\n/g, '<br>')
    const vatNumber = payment.vat_number || profile.vatNumber || ''
    const paymentTerms = payment.payment_terms || '30'
    // Bank accounts stored in profile.bankAccounts (camelCase) from onboarding
    const bankAccounts: Array<Record<string, string>> = profile.bankAccounts || payment.bank_accounts || []

    // Find matching bank account by currency, or use default
    const matchingBank = bankAccounts.find((b: Record<string, string>) => b.currency === invoice.currency)
      || bankAccounts.find((b: Record<string, string>) => b.is_default)
      || bankAccounts[0]

    const invoiceNumber = `INV-${params.id.slice(-6).toUpperCase()}`
    const issueDate = new Date(invoice.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : `${paymentTerms} days from invoice`

    // Country-specific: AUD requires ABN + "Tax Invoice" heading
    const isAUD = invoice.currency === 'AUD'
    const abn = isAUD ? (vatNumber || '') : ''
    const invoiceHeading = isAUD ? 'Tax Invoice' : 'Invoice'

    const bankSection = matchingBank ? `
      <div class="section">
        <div class="section-title">Payment details</div>
        ${matchingBank.currency ? `<div class="row"><span>Currency</span><span>${matchingBank.currency}</span></div>` : ''}
        ${(matchingBank.accountName || matchingBank.account_name) ? `<div class="row"><span>Account name</span><span>${matchingBank.accountName || matchingBank.account_name}</span></div>` : ''}
        ${(matchingBank.recipientAddress || matchingBank.recipient_address) ? `<div class="row"><span>Account holder address</span><span style="text-align:right;max-width:300px">${(matchingBank.recipientAddress || matchingBank.recipient_address).replace(/\n/g, '<br>')}</span></div>` : ''}
        ${(matchingBank.bankName || matchingBank.bank_name) ? `<div class="row"><span>Bank</span><span>${matchingBank.bankName || matchingBank.bank_name}</span></div>` : ''}
        ${(matchingBank.bankAddress || matchingBank.bank_address) ? `<div class="row"><span>Bank address</span><span style="text-align:right;max-width:300px">${(matchingBank.bankAddress || matchingBank.bank_address).replace(/\n/g, '<br>')}</span></div>` : ''}
        ${(matchingBank.sortCode || matchingBank.sort_code) ? `<div class="row"><span>Sort code</span><span>${matchingBank.sortCode || matchingBank.sort_code}</span></div>` : ''}
        ${(matchingBank.accountNumber || matchingBank.account_number) ? `<div class="row"><span>Account number</span><span>${matchingBank.accountNumber || matchingBank.account_number}</span></div>` : ''}
        ${matchingBank.iban ? `<div class="row"><span>IBAN</span><span>${matchingBank.iban}</span></div>` : ''}
        ${(matchingBank.bic || matchingBank.swift_bic) ? `<div class="row"><span>SWIFT / BIC</span><span>${matchingBank.bic || matchingBank.swift_bic}</span></div>` : ''}
        ${(matchingBank.intermediaryBic || matchingBank.intermediary_bic) ? `<div class="row"><span>Intermediary BIC</span><span>${matchingBank.intermediaryBic || matchingBank.intermediary_bic}</span></div>` : ''}
        ${(matchingBank.label) ? `<div class="row" style="color:#888;font-size:11px;border-bottom:none"><span>Account label</span><span>${matchingBank.label}</span></div>` : ''}
      </div>
      ${isAUD ? `<div class="section" style="margin-top:-12px"><p style="font-size:11px;color:#888;padding:8px 0">GST: ${abn ? 'Registered — GST may apply. Please remit gross amount unless otherwise agreed.' : 'Not applicable to this invoice.'}</p></div>` : ''}
    ` : '<p style="color:#888;font-size:13px">No bank account configured — add payment details in Settings.</p>'

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${invoiceNumber} — ${invoice.gig_title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; background: #fff; color: #111; padding: 60px; max-width: 760px; margin: 0 auto; }
  .header { display: grid; grid-template-columns: 1fr auto; gap: 40px; margin-bottom: 56px; border-bottom: 2px solid #111; padding-bottom: 24px; align-items: flex-start; }
  .artist-name { font-size: 22px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  .artist-meta { font-size: 11px; color: #555; margin-top: 6px; line-height: 1.6; }
  .invoice-label { font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: #888; margin-bottom: 6px; }
  .invoice-number { font-size: 20px; font-weight: 700; }
  .invoice-date { font-size: 11px; color: #555; margin-top: 6px; }
  .to-section { margin-bottom: 40px; }
  .to-section .label { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin-bottom: 8px; }
  .to-section .value { font-size: 15px; font-weight: 600; }
  .amount-block { background: #111; color: #fff; padding: 32px 36px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: center; }
  .amount-label { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
  .amount-value { font-size: 36px; font-weight: 700; letter-spacing: 0.02em; }
  .amount-meta { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 6px; }
  .due-block { text-align: right; }
  .due-block .label { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 8px; }
  .due-block .value { font-size: 16px; color: #fff; }
  .section { margin-bottom: 36px; }
  .section-title { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #888; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #e5e5e5; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  .row span:first-child { color: #555; }
  .row span:last-child { font-weight: 600; }
  .footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #888; text-align: center; }
  @media print { body { padding: 40px; } }
</style>
</head>
<body>

<div class="header">
  <div style="display:flex;align-items:flex-start;gap:14px">
    <svg width="36" height="36" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;margin-top:1px">
      <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#111" stroke-width="1.5" opacity="0.2"/>
      <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
    <div>
      <div class="artist-name">${artistName}</div>
      ${address ? `<div class="artist-meta">${address}</div>` : ''}
      ${vatNumber ? `<div class="artist-meta" style="margin-top:4px">${isAUD ? 'ABN' : 'VAT / Tax'}: ${vatNumber}</div>` : ''}
    </div>
  </div>
  <div>
    <div class="invoice-label">${invoiceHeading}</div>
    <div class="invoice-number">${invoiceNumber}</div>
    <div class="invoice-date">Issued: ${issueDate}</div>
  </div>
</div>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;gap:40px">
  <div class="to-section" style="margin-bottom:0;flex:1">
    ${promoterName ? `
    <div class="label">Billed to</div>
    <div style="font-size:13px;color:#111;line-height:1.8;font-family:'Courier New',monospace">${promoterName.replace(/\n/g, '<br>')}</div>
    ${promoterEmail ? `<div style="font-size:11px;color:#555;margin-top:6px">${promoterEmail}</div>` : ''}
    ` : ''}
  </div>
  <div class="to-section" style="margin-bottom:0;flex:1;text-align:right">
    <div class="label">Performance</div>
    <div class="value">${invoice.gig_title}</div>
    ${gigVenue ? `<div style="font-size:12px;color:#555;margin-top:4px">${gigVenue}</div>` : ''}
    ${gigDate ? `<div style="font-size:11px;color:#888;margin-top:4px">${new Date(gigDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>` : ''}
    ${gigLocation ? `<div style="font-size:11px;color:#888;margin-top:2px">${gigLocation}</div>` : ''}
    ${invoice.type ? `<div style="font-size:11px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.15em">${invoice.type === 'full' ? 'Full fee' : invoice.type === 'deposit' ? 'Deposit' : 'Balance'}</div>` : ''}
    ${gigNotes ? `<div style="font-size:10px;color:#aaa;margin-top:6px;font-style:italic;max-width:220px">${gigNotes.slice(0, 120)}${gigNotes.length > 120 ? '…' : ''}</div>` : ''}
  </div>
</div>

<div class="amount-block">
  <div>
    <div class="amount-label">${invoice.wht_rate ? 'Gross fee' : 'Amount due'}</div>
    <div class="amount-value">${invoice.currency} ${Number(invoice.amount).toLocaleString()}</div>
    ${invoice.wht_rate ? `
    <div class="amount-meta" style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.1);padding-top:10px">
      WHT ${invoice.wht_rate}% — ${invoice.currency} ${Math.round(Number(invoice.amount) * (invoice.wht_rate / 100)).toLocaleString()}
    </div>
    <div style="font-size:20px;font-weight:700;color:#fff;margin-top:6px">
      Net: ${invoice.currency} ${Math.round(Number(invoice.amount) * (1 - invoice.wht_rate / 100)).toLocaleString()}
    </div>` : `
    <div class="amount-meta">${invoice.status === 'paid' ? 'PAID' : 'PENDING PAYMENT'}</div>`}
  </div>
  <div class="due-block">
    <div class="label">Due date</div>
    <div class="value">${dueDate}</div>
  </div>
</div>

${bankSection}

<div class="footer">
  Please include the invoice number <strong>${invoiceNumber}</strong> in your payment reference.<br>
  Payment due within ${paymentTerms} days of invoice date.<br><br>
  <strong>Please pay in ${invoice.currency} only.</strong> Any foreign exchange charges incurred will be charged back to the payee.<br><br>
  <span style="letter-spacing:0.12em;font-size:10px;color:#bbb;text-transform:uppercase">Signal Lab OS — Tailored Artist OS</span>
</div>

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
