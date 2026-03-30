import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

// Use service role key to bypass RLS for token reads/writes and invoice inserts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Gmail auth ──────────────────────────────────────────────────────────────

async function getGmailClient() {
  const { data: settings } = await supabase
    .from('artist_settings')
    .select('gmail_access_token, gmail_refresh_token, gmail_token_expiry')
    .single()

  if (!settings?.gmail_refresh_token) {
    throw new Error('Gmail not connected — visit /api/gmail/auth to connect')
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://signal-lab-rebuild.vercel.app/api/gmail/callback'
  )

  oauth2Client.setCredentials({
    access_token: settings.gmail_access_token,
    refresh_token: settings.gmail_refresh_token,
    expiry_date: settings.gmail_token_expiry,
  })

  // Auto-refresh token if expired
  oauth2Client.on('tokens', async (tokens) => {
    const { data: existing } = await supabase.from('artist_settings').select('id').single()
    if (existing) {
      await supabase.from('artist_settings').update({
        gmail_access_token: tokens.access_token,
        gmail_token_expiry: tokens.expiry_date,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    }
  })

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// ── Email body extraction ───────────────────────────────────────────────────

function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractEmailBody(payload: any): string {
  if (!payload) return ''

  // Plain text part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBody(payload.body.data)
  }

  // HTML part (strip tags)
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBody(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  // Multipart — prefer plain text
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBody(plain.body.data)
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (html?.body?.data) return decodeBody(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const text = extractEmailBody(part)
      if (text) return text
    }
  }

  return ''
}

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
      system: `You extract invoice request details from emails sent to a DJ/electronic music artist by their management, booking agents, or promoters asking them to submit an invoice.

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
}

Only set is_invoice_request: true if the email is clearly requesting the artist to send/submit an invoice. Newsletters, spam, and general booking enquiries should return is_invoice_request: false.`,
      messages: [{
        role: 'user',
        content: `Subject: ${subject}\n\nBody:\n${body.slice(0, 2500)}`,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// ── Main route ──────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const gmail = await getGmailClient()

    // Get already-processed invoice Gmail IDs
    const { data: processed } = await supabase
      .from('processed_invoice_gmail_ids')
      .select('message_id')
    const processedIds = new Set((processed || []).map((r: any) => r.message_id))

    // Search Gmail for invoice-related emails in the last 60 days
    const searchQuery = 'newer_than:60d (subject:(invoice) OR "please invoice" OR "can you invoice" OR "send an invoice" OR "invoice us" OR "please send invoice" OR "invoice for" OR "payment request" OR "billing" OR "please bill")'

    const { data: list } = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: searchQuery,
    })

    const messages = list.messages || []
    let scanned = 0
    const createdInvoices: any[] = []

    for (const msg of messages) {
      if (!msg.id || processedIds.has(msg.id)) continue

      scanned++

      const { data: full } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      })

      const headers = full.payload?.headers || []
      const from    = headers.find((h: any) => h.name === 'From')?.value || ''
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

        // Fire notification
        await supabase.from('notifications').insert([{
          type: 'invoice_request',
          title: `Invoice request — ${newInvoice.gig_title}`,
          message: `From ${extraction.from_name || 'unknown'} — review in Finances`,
          href: '/business/finances',
          created_at: new Date().toISOString(),
        }])
      }
    }

    return NextResponse.json({
      ok: true,
      scanned,
      found: createdInvoices.length,
      invoices: createdInvoices,
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
    // Non-fatal
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'POST /api/gmail/invoice-requests',
    description: 'Scans Gmail for invoice requests from management/promoters, creates draft invoices for review',
  })
}
