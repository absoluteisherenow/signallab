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

    const profile = settings?.profile || {}
    const payment = settings?.payment || {}
    const artistName = payment.legal_name || profile.name || 'Artist'
    const address = (payment.address || '').replace(/\n/g, '<br>')
    const vatNumber = payment.vat_number || ''
    const paymentTerms = payment.payment_terms || '30'
    const bankAccounts: Array<Record<string, string>> = payment.bank_accounts || []

    // Find matching bank account by currency, or use default
    const matchingBank = bankAccounts.find((b: Record<string, string>) => b.currency === invoice.currency)
      || bankAccounts.find((b: Record<string, string>) => b.is_default)
      || bankAccounts[0]

    const invoiceNumber = `INV-${params.id.slice(-6).toUpperCase()}`
    const issueDate = new Date(invoice.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : `${paymentTerms} days from invoice`

    const bankSection = matchingBank ? `
      <div class="section">
        <div class="section-title">Payment details</div>
        ${matchingBank.currency ? `<div class="row"><span>Currency</span><span>${matchingBank.currency}</span></div>` : ''}
        ${matchingBank.account_name ? `<div class="row"><span>Account name</span><span>${matchingBank.account_name}</span></div>` : ''}
        ${matchingBank.bank_name ? `<div class="row"><span>Bank</span><span>${matchingBank.bank_name}</span></div>` : ''}
        ${matchingBank.sort_code ? `<div class="row"><span>Sort code</span><span>${matchingBank.sort_code}</span></div>` : ''}
        ${matchingBank.account_number ? `<div class="row"><span>Account number</span><span>${matchingBank.account_number}</span></div>` : ''}
        ${matchingBank.iban ? `<div class="row"><span>IBAN</span><span>${matchingBank.iban}</span></div>` : ''}
        ${matchingBank.swift_bic ? `<div class="row"><span>SWIFT / BIC</span><span>${matchingBank.swift_bic}</span></div>` : ''}
      </div>
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
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 56px; border-bottom: 2px solid #111; padding-bottom: 24px; }
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
  <div>
    <div class="artist-name">${artistName}</div>
    ${address ? `<div class="artist-meta">${address}</div>` : ''}
    ${vatNumber ? `<div class="artist-meta" style="margin-top:4px">VAT / Tax: ${vatNumber}</div>` : ''}
  </div>
  <div style="text-align:right">
    <div class="invoice-label">Invoice</div>
    <div class="invoice-number">${invoiceNumber}</div>
    <div class="invoice-date">Issued: ${issueDate}</div>
  </div>
</div>

<div class="to-section">
  <div class="label">Invoice for</div>
  <div class="value">${invoice.gig_title}</div>
  ${invoice.type ? `<div style="font-size:11px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.15em">${invoice.type === 'full' ? 'Full fee' : invoice.type === 'deposit' ? 'Deposit' : 'Balance'}</div>` : ''}
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
  Payment due within ${paymentTerms} days of invoice date.
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
