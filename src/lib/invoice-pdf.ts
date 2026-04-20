import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * Server-side invoice PDF generation via pdf-lib. Runs on Cloudflare Workers
 * without a browser dependency — intentionally programmatic (not a screenshot
 * of the HTML invoice) so the output is searchable, copy/pasteable, and
 * small. Matches the bank-detail HARD RULE in rule_invoice_bank_details.md.
 *
 * Lives in /lib (not in the route file) because Next.js App Router rejects
 * route files that export anything other than HTTP method handlers. Having
 * this here lets both /api/invoices/[id]/pdf (which streams the PDF) and
 * /api/invoices/[id]/send (which attaches it to an email) import the same
 * builder — previously the send route imported it from the route file and
 * blew up the whole Next build on CI with "not a valid Route export field".
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function buildInvoicePdf(id: string): Promise<Uint8Array | null> {
  const [{ data: invoice }, { data: settings }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', id).single(),
    supabase.from('artist_settings').select('profile, payment').single(),
  ])
  if (!invoice) return null

  let gigDate = ''
  let gigLocation = ''
  let gigVenue = ''
  if (invoice.gig_id) {
    const { data: gig } = await supabase
      .from('gigs')
      .select('date, location, venue')
      .eq('id', invoice.gig_id)
      .single()
    if (gig) {
      gigDate = gig.date || ''
      gigLocation = gig.location || ''
      gigVenue = gig.venue || ''
    }
  }

  const profile = settings?.profile || {}
  const payment = settings?.payment || {}
  const artistName = invoice.artist_name || payment.legal_name || profile.name || 'Artist'
  const vatNumber = payment.vat_number || profile.vatNumber || ''
  const address = (payment.address || '160DL Studios, Dalston Lane, London E8 1NG').replace(/\n/g, ', ')
  const email = payment.email || profile.email || ''

  const bankAccounts: Array<Record<string, string>> = profile.bankAccounts || payment.bank_accounts || []
  const matchingBank = bankAccounts.find((b) => b.currency === invoice.currency)
    || bankAccounts.find((b) => b.is_default || b.isDefault)
    || bankAccounts[0]
  const payToName = payment.legal_name
    || matchingBank?.accountName
    || matchingBank?.account_name
    || artistName

  const invoiceNumber = `INV-${id.slice(-6).toUpperCase()}`
  const issueDate = fmtDate(invoice.created_at || Date.now())
  const dueDate = invoice.due_date ? fmtDate(invoice.due_date) : `${payment.payment_terms || '30'} days from invoice`

  const isAUD = invoice.currency === 'AUD'
  const invoiceHeading = isAUD ? 'TAX INVOICE' : 'INVOICE'

  const perfDate = gigDate || invoice.gig_date
  const formattedPerfDate = perfDate ? fmtDate(perfDate) : ''
  const venueLoc = [gigVenue?.trim(), gigLocation?.trim()].filter(Boolean).join(', ')
  const hasGigContext = Boolean(venueLoc || formattedPerfDate)
  const lineItemDesc = hasGigContext
    ? `DJ performance at ${venueLoc}${formattedPerfDate ? ' - ' + formattedPerfDate : ''}`
    : invoice.gig_title

  const currency = invoice.currency
  const showGBPRails = currency === 'GBP'
  const showIBAN = currency === 'EUR' || currency === 'AUD' || currency === 'USD'
  const showBIC = showIBAN
  const showIntermediary = currency === 'AUD' || currency === 'USD'

  const sortCode = matchingBank?.sortCode || matchingBank?.sort_code
  const accountNumber = matchingBank?.accountNumber || matchingBank?.account_number
  const bic = matchingBank?.bic || matchingBank?.swift_bic
  const intermediary = matchingBank?.intermediaryBic || matchingBank?.intermediary_bic
  const iban = matchingBank?.iban

  const bankLines: Array<[string, string]> = []
  bankLines.push(['Pay to', payToName])
  if (matchingBank?.bankName || matchingBank?.bank_name) {
    bankLines.push(['Bank', matchingBank.bankName || matchingBank.bank_name])
  }
  bankLines.push(['Currency', currency])
  if (showGBPRails && sortCode) bankLines.push(['Sort code', sortCode])
  if (showGBPRails && accountNumber) bankLines.push(['Account number', accountNumber])
  if (showIBAN && iban) bankLines.push(['IBAN', iban])
  if (showBIC && bic) bankLines.push(['SWIFT / BIC', bic])
  if (showIntermediary && intermediary) bankLines.push(['Intermediary BIC', intermediary])

  // ── Render ────────────────────────────────────────────────────────────────
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89]) // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const ink = rgb(0.04, 0.04, 0.04)
  const dim = rgb(0.45, 0.45, 0.45)
  const red = rgb(1, 0.165, 0.102)

  const margin = 48
  const contentW = 595.28 - margin * 2
  let y = 841.89 - margin

  // Header
  page.drawText(artistName.toUpperCase(), { x: margin, y: y - 14, size: 11, font: bold, color: ink })
  page.drawText(invoiceHeading, { x: margin + contentW - bold.widthOfTextAtSize(invoiceHeading, 9), y, size: 9, font: bold, color: dim })
  page.drawText(invoiceNumber, { x: margin + contentW - bold.widthOfTextAtSize(invoiceNumber, 22), y: y - 26, size: 22, font: bold, color: ink })
  page.drawText(`Issued: ${issueDate}`, { x: margin + contentW - font.widthOfTextAtSize(`Issued: ${issueDate}`, 9), y: y - 40, size: 9, font, color: dim })

  y -= 64
  page.drawLine({ start: { x: margin, y }, end: { x: margin + contentW, y }, thickness: 1.5, color: red })
  y -= 24

  // Event
  y = section(page, 'EVENT', y, margin, contentW, bold, dim)
  page.drawText(truncate(invoice.gig_title, 70), { x: margin, y: y - 18, size: 20, font: bold, color: ink })
  y -= 26
  const subParts = [gigVenue?.trim(), gigLocation?.trim(), gigDate ? fmtDate(gigDate) : ''].filter(Boolean)
  if (subParts.length) {
    page.drawText(subParts.join('  ·  '), { x: margin, y: y - 12, size: 10, font, color: dim })
    y -= 16
  }
  if (invoice.type) {
    const typeLabel = invoice.type === 'full' ? 'Full fee' : invoice.type === 'deposit' ? 'Deposit · 50%' : 'Balance · 50%'
    page.drawText(typeLabel.toUpperCase(), { x: margin, y: y - 12, size: 8, font: bold, color: red })
    y -= 16
  }
  y -= 16

  // Bill to
  const promoterName = (invoice.notes || '').trim()
  if (promoterName) {
    y = section(page, 'BILL TO', y, margin, contentW, bold, dim)
    for (const line of promoterName.split('\n').slice(0, 6)) {
      page.drawText(truncate(line, 80), { x: margin, y: y - 12, size: 10, font, color: ink })
      y -= 14
    }
    y -= 12
  }

  // Amount block
  const amount = Number(invoice.amount || 0)
  const whtRate = Number(invoice.wht_rate || 0)
  const whtAmount = Math.round(amount * (whtRate / 100))
  const netAmount = amount - whtAmount

  const amountBoxH = whtRate ? 96 : 72
  page.drawRectangle({ x: margin, y: y - amountBoxH, width: contentW, height: amountBoxH, color: rgb(0.02, 0.02, 0.02) })
  page.drawRectangle({ x: margin, y: y - 2, width: contentW, height: 2, color: red })

  page.drawText(whtRate ? 'GROSS FEE' : 'AMOUNT DUE', { x: margin + 20, y: y - 22, size: 8, font: bold, color: rgb(0.6, 0.6, 0.6) })
  page.drawText(`${currency} ${amount.toLocaleString()}`, { x: margin + 20, y: y - 50, size: 24, font: bold, color: rgb(0.95, 0.95, 0.95) })
  if (whtRate) {
    page.drawText(`WHT ${whtRate}% — ${currency} ${whtAmount.toLocaleString()}`, { x: margin + 20, y: y - 68, size: 9, font, color: rgb(0.6, 0.6, 0.6) })
    page.drawText(`Net: ${currency} ${netAmount.toLocaleString()}`, { x: margin + 20, y: y - 84, size: 12, font: bold, color: rgb(0.95, 0.95, 0.95) })
  }
  const statusLabel = invoice.status === 'paid' ? 'PAID' : invoice.status === 'overdue' ? 'OVERDUE' : 'PENDING'
  page.drawText('DUE', { x: margin + contentW - 20 - bold.widthOfTextAtSize('DUE', 8), y: y - 22, size: 8, font: bold, color: rgb(0.6, 0.6, 0.6) })
  const dueVal = dueDate.toUpperCase()
  page.drawText(dueVal, { x: margin + contentW - 20 - bold.widthOfTextAtSize(dueVal, 10), y: y - 40, size: 10, font: bold, color: red })
  page.drawText(statusLabel, { x: margin + contentW - 20 - bold.widthOfTextAtSize(statusLabel, 8), y: y - 56, size: 8, font: bold, color: invoice.status === 'paid' ? dim : red })

  y -= amountBoxH + 24

  // Line items
  y = section(page, 'LINE ITEMS', y, margin, contentW, bold, dim)
  page.drawText('DESCRIPTION', { x: margin, y: y - 12, size: 8, font: bold, color: ink })
  page.drawText('AMOUNT', { x: margin + contentW - bold.widthOfTextAtSize('AMOUNT', 8), y: y - 12, size: 8, font: bold, color: ink })
  y -= 18
  page.drawLine({ start: { x: margin, y }, end: { x: margin + contentW, y }, thickness: 1.2, color: red })
  y -= 14

  const lineSuffix = invoice.type && invoice.type !== 'full' ? ` — ${invoice.type === 'deposit' ? 'Deposit · 50%' : 'Balance · 50%'}` : ''
  const descText = truncate((lineItemDesc || 'Booking fee') + lineSuffix, 70)
  const amountText = `${currency} ${amount.toLocaleString()}`
  page.drawText(descText, { x: margin, y: y - 10, size: 10, font, color: ink })
  page.drawText(amountText, { x: margin + contentW - font.widthOfTextAtSize(amountText, 10), y: y - 10, size: 10, font, color: ink })
  y -= 18

  if (whtRate) {
    const whtLabel = `WHT deduction (${whtRate}%)`
    const whtVal = `- ${currency} ${whtAmount.toLocaleString()}`
    page.drawText(whtLabel, { x: margin, y: y - 10, size: 9, font, color: dim })
    page.drawText(whtVal, { x: margin + contentW - font.widthOfTextAtSize(whtVal, 9), y: y - 10, size: 9, font, color: dim })
    y -= 18
    page.drawLine({ start: { x: margin, y }, end: { x: margin + contentW, y }, thickness: 1.2, color: red })
    y -= 14
    const netLabel = 'Net payable'
    const netVal = `${currency} ${netAmount.toLocaleString()}`
    page.drawText(netLabel, { x: margin, y: y - 10, size: 11, font: bold, color: ink })
    page.drawText(netVal, { x: margin + contentW - bold.widthOfTextAtSize(netVal, 11), y: y - 10, size: 11, font: bold, color: ink })
    y -= 22
  }

  y -= 12

  // Payment details
  if (matchingBank) {
    y = section(page, 'PAYMENT DETAILS', y, margin, contentW, bold, dim)
    for (const [label, value] of bankLines) {
      page.drawText(label, { x: margin, y: y - 12, size: 9, font, color: dim })
      page.drawText(String(value), { x: margin + contentW - font.widthOfTextAtSize(String(value), 9), y: y - 12, size: 9, font: bold, color: ink })
      page.drawLine({ start: { x: margin, y: y - 18 }, end: { x: margin + contentW, y: y - 18 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) })
      y -= 20
    }
  } else {
    page.drawText('No bank account configured - add payment details in Settings.', { x: margin, y: y - 10, size: 9, font, color: dim })
    y -= 18
  }

  // Footer
  y = Math.max(y - 24, margin + 60)
  page.drawLine({ start: { x: margin, y }, end: { x: margin + contentW, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
  y -= 14
  const footerLines = [
    `Please use ${invoiceNumber} as your payment reference.`,
    `Please pay in ${currency} only.${currency !== 'GBP' && currency !== 'EUR' ? ' Any foreign exchange charges will be charged back to the payee.' : ''}`,
    `${artistName}  |  ${address}`,
    email ? email : '',
    vatNumber ? `${isAUD ? 'ABN' : 'VAT'}: ${vatNumber}` : '',
  ].filter(Boolean)
  for (const line of footerLines) {
    page.drawText(truncate(line, 110), { x: margin, y, size: 8, font, color: dim })
    y -= 11
  }

  return await pdf.save()
}

function section(page: any, label: string, y: number, margin: number, contentW: number, bold: any, dim: any): number {
  page.drawText(label, { x: margin, y: y - 10, size: 8, font: bold, color: dim })
  page.drawLine({ start: { x: margin, y: y - 16 }, end: { x: margin + contentW, y: y - 16 }, thickness: 0.4, color: dim })
  return y - 16
}

function fmtDate(d: string | number | Date): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function truncate(s: string | null | undefined, max: number): string {
  const str = String(s || '')
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}
