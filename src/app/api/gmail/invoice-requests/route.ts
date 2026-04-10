import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients } from '@/lib/gmail-accounts'
import { extractEmailBody } from '@/lib/gmail-utils'
import { createNotification } from '@/lib/notifications'

// Use service role key to bypass RLS for token reads/writes and invoice inserts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Claude invoice request extractor ───────────────────────────────────────

interface InvoiceExtraction {
  is_invoice_request: boolean
  confidence: number
  gig_title: string
  amount: number | null
  currency: string
  due_days: number
  from_name: string
  notes: string
}

async function extractInvoiceRequest(
  subject: string,
  body: string
): Promise<InvoiceExtraction> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You extract invoice request details from emails sent to a DJ/electronic music artist by their management, booking agents, or promoters.

An invoice request is ANY email that signals the artist needs to submit/send an invoice. This includes:
- Direct requests: "please invoice", "can you send an invoice", "submit your invoice"
- Implicit signals: "will come back with invoice", "linking for advancing" (implies invoicing is next), "need your invoice details"
- Settlement emails: balance due, final settlement, fee breakdowns with amounts owed
- Advancing emails that mention fees or payment terms
- Management forwarding gig details with fee info (implies invoice needed)

Do NOT flag: newsletters, spam, invoices FROM other companies TO the artist (those are bills, not requests), or general booking enquiries with no fee confirmed.

Return ONLY valid JSON:
{
  "is_invoice_request": true/false,
  "confidence": 0.0-1.0,
  "gig_title": "event/show name or best description, max 60 chars",
  "amount": <number or null>,
  "currency": "GBP|EUR|USD|AUD",
  "due_days": <payment terms in days, default 30 if not specified>,
  "from_name": "sender name or company",
  "notes": "any extra context from the email, max 100 chars"
}`,
      messages: [{
        role: 'user',
        content: `Subject: ${subject}\n\nBody:\n${body.slice(0, 4000)}`,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// ── Process one account ───────────────────────────────────────────────────

async function processAccount(
  gmail: any,
  accountEmail: string,
  processedIds: Set<string>
): Promise<{ scanned: number; invoices: any[] }> {
  let scanned = 0
  const createdInvoices: any[] = []

  // Broadened search: match "invoice" anywhere (not just subject), plus
  // settlement language, balance due, fee discussions, and payment advice
  const searchQuery = 'newer_than:60d (invoice OR settlement OR "final invoice" OR "balance due" OR "please invoice" OR "can you invoice" OR "send an invoice" OR "invoice us" OR "please send invoice" OR "invoice for" OR "payment request" OR "please bill" OR "fee" OR "payment advice" OR advancing)'

  const { data: list } = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 50,
    q: searchQuery,
  })

  const messages = list?.messages || []

  for (const msg of messages) {
    if (!msg.id || processedIds.has(msg.id)) continue

    scanned++

    const { data: full } = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    })

    const headers = full.payload?.headers || []
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''
    const body    = extractEmailBody(full.payload)

    if (!body && !subject) {
      await markProcessed(msg.id)
      continue
    }

    let extraction: InvoiceExtraction
    try {
      extraction = await extractInvoiceRequest(subject, body)
    } catch {
      continue
    }

    // Mark as processed regardless of outcome to avoid reprocessing
    await markProcessed(msg.id)

    if (!extraction.is_invoice_request || extraction.confidence < 0.6) {
      continue
    }

    // Calculate due date
    const dueDays = extraction.due_days ?? 30
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + dueDays)
    const dueDateStr = dueDate.toISOString().slice(0, 10)

    // Build notes combining sender and extracted notes
    const notesStr = [
      extraction.from_name ? `From: ${extraction.from_name}.` : '',
      extraction.notes || '',
    ].filter(Boolean).join(' ').trim()

    // Insert draft invoice
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .insert([{
        gig_title: extraction.gig_title || subject.slice(0, 60) || 'Invoice Request',
        amount: extraction.amount ?? 0,
        currency: extraction.currency || 'GBP',
        type: 'invoice_request',
        status: 'draft',
        due_date: dueDateStr,
        notes: notesStr || null,
        created_at: new Date().toISOString(),
      }])
      .select()

    if (invoiceError) {
      console.error('Failed to insert invoice:', invoiceError)
      continue
    }

    const newInvoice = invoiceData?.[0]
    if (newInvoice) {
      createdInvoices.push(newInvoice)

      // Fire notification (createNotification handles in-app + SMS + email)
      await createNotification({
        type: 'invoice_request',
        title: `Invoice request — ${newInvoice.gig_title}`,
        message: `From ${extraction.from_name || 'unknown'} — review in Finances`,
        href: '/business/finances',
      })
    }
  }

  return { scanned, invoices: createdInvoices }
}

// ── Main route ──────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const clients = await getGmailClients()

    // Get already-processed invoice Gmail IDs
    const { data: processed } = await supabase
      .from('processed_invoice_gmail_ids')
      .select('message_id')
    const processedIds = new Set((processed || []).map((r: any) => r.message_id))

    let totalScanned = 0
    const allInvoices: any[] = []

    for (const { gmail, email } of clients) {
      try {
        const { scanned, invoices } = await processAccount(gmail, email, processedIds)
        totalScanned += scanned
        allInvoices.push(...invoices)
      } catch (err) {
        console.error(`Invoice scan failed for ${email}:`, err)
      }
    }

    return NextResponse.json({
      ok: true,
      accounts: clients.length,
      scanned: totalScanned,
      found: allInvoices.length,
      invoices: allInvoices,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function markProcessed(messageId: string) {
  try {
    await supabase.from('processed_invoice_gmail_ids').insert([{
      message_id: messageId,
      processed_at: new Date().toISOString(),
    }])
  } catch {
    // Non-fatal — likely duplicate
  }
}

// Vercel cron hits GET. Delegate to POST so the scan runs on the same
// daily schedule as /api/gmail/process (wired in vercel.json).
export async function GET() {
  return POST()
}
