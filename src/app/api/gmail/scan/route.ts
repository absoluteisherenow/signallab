import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients } from '@/lib/gmail-accounts'
import { requireUser } from '@/lib/api-auth'
import { env } from '@/lib/env'

// Service role for cross-tenant idempotency lookups. Every query below MUST
// filter by user.id manually — never trust this client to auto-scope.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractEmailBody(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBody(payload.body.data)
  if (payload.mimeType === 'text/html' && payload.body?.data)
    return decodeBody(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBody(plain.body.data)
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (html?.body?.data)
      return decodeBody(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    for (const part of payload.parts) {
      const text = extractEmailBody(part)
      if (text) return text
    }
  }
  return ''
}

interface PdfAttachmentRef {
  attachmentId: string
  filename: string
  size: number
}

function collectPdfAttachments(payload: any, out: PdfAttachmentRef[] = []): PdfAttachmentRef[] {
  if (!payload) return out
  const isPdf = payload.mimeType === 'application/pdf' ||
    (payload.filename || '').toLowerCase().endsWith('.pdf')
  if (isPdf && payload.body?.attachmentId) {
    out.push({
      attachmentId: payload.body.attachmentId,
      filename: payload.filename || 'attachment.pdf',
      size: payload.body.size || 0,
    })
  }
  if (payload.parts) {
    for (const part of payload.parts) collectPdfAttachments(part, out)
  }
  return out
}

async function fetchPdfsForClaude(
  gmail: any,
  messageId: string,
  refs: PdfAttachmentRef[]
): Promise<Array<{ filename: string; base64: string }>> {
  const MAX_PDFS = 3
  const MAX_BYTES = 5 * 1024 * 1024
  const picked = refs.filter(r => r.size > 0 && r.size <= MAX_BYTES).slice(0, MAX_PDFS)
  const out: Array<{ filename: string; base64: string }> = []
  for (const ref of picked) {
    try {
      const { data } = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: ref.attachmentId,
      })
      if (data?.data) {
        out.push({ filename: ref.filename, base64: data.data.replace(/-/g, '+').replace(/_/g, '/') })
      }
    } catch {
      // skip
    }
  }
  return out
}

async function classifyEmail(from: string, subject: string, body: string, existingGigs: any[], pdfs: Array<{ filename: string; base64: string }> = []): Promise<any> {
  const gigsContext = existingGigs.length
    ? `Existing gigs:\n${existingGigs.map(g => `- ID: ${g.id} | ${g.title} @ ${g.venue}, ${g.location} on ${g.date}`).join('\n')}`
    : 'No gigs yet.'

  const apiKey = (await env('ANTHROPIC_API_KEY'))!
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: `You are an email classifier for a DJ/electronic music artist. Classify incoming emails. Return ONLY valid JSON.

${gigsContext}

Email types: new_gig, hotel, flight, train, tech_spec, rider, invoice, invoice_request, billing_info, release, gig_update, remittance, ignore.
"remittance" = payment received / remittance advice / bank transfer confirmation / wire transfer notification. Keywords: remittance, payment advice, "payment has been made", "funds transferred", BACS, SWIFT.
"invoice_request" = someone asking Anthony to send an invoice or specifying where to bill. Keywords: "please invoice", "send the invoice to", "bill us at", "our accounts email".
"billing_info" = company billing / VAT / finance details for an existing gig (VAT number, company name, PO number, billing address).

Return: {"type":"...","confidence":0.0-1.0,"gig_id":"uuid or null","extracted":{
  // new_gig: title, venue, location, date (YYYY-MM-DD), time (HH:MM), fee, currency, promoter_name, promoter_email, notes
  // hotel: name, check_in, check_out, cost, currency, reference
  // flight: name, flight_number, from, to, departure_at (YYYY-MM-DDTHH:MM), arrival_at, cost, currency, reference
  // train: name, from, to, departure_at, arrival_at, cost, currency, reference
  // invoice: gig_title, amount, currency, type (deposit/full/balance), due_date, description
  // invoice_request: billing_email, billing_name, billing_company, notes
  // billing_info: company_name, billing_address, vat_number, po_number, billing_email
  // release: title, type (single/ep/album), release_date, label, streaming_url, notes
  // tech_spec / rider: details
  // gig_update: update
  // remittance: amount, currency, sender_name, reference, gig_title, payment_date, description
}}`,
      messages: [{
        role: 'user',
        content: pdfs.length > 0
          ? [
              { type: 'text', text: `From: ${from}\nSubject: ${subject}\n\nBody:\n${body.slice(0, 3000)}\n\n(${pdfs.length} PDF attachment${pdfs.length > 1 ? 's' : ''} included — extract fields from them too.)` },
              ...pdfs.map(pdf => ({
                type: 'document' as const,
                source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdf.base64 },
              })),
            ]
          : `From: ${from}\nSubject: ${subject}\n\nBody:\n${body.slice(0, 3000)}`,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// GET /api/gmail/scan — scan inbox and return findings WITHOUT creating any records.
// User-scoped: only scans the caller's own connected Gmail accounts and matches
// against the caller's own gigs. Dry-run endpoint, safe to expose in UI.
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    let clients: Awaited<ReturnType<typeof getGmailClients>>
    try {
      clients = await getGmailClients(userId)
    } catch {
      // No Gmail connected — return empty findings gracefully
      return NextResponse.json({ findings: [], reason: 'no_gmail_connected' })
    }

    // TODO(multi-tenant): processed_gmail_ids has no user_id column yet.
    // Message IDs are globally unique per Google, and this user's OAuth clients
    // only return message IDs from their own inboxes, so false-positive dedups
    // across tenants are theoretically possible only if two users share a mailbox
    // (not possible via OAuth). The watermark leak is real — we workaround by
    // using a fixed 30d lookback rather than derived-from-global-last-processed.
    const { data: processed } = await supabase
      .from('processed_gmail_ids')
      .select('message_id')
      .limit(5000)
    const processedIds = new Set((processed || []).map((r: any) => r.message_id))

    // Fixed 30-day lookback. See TODO above — can tighten once processed_gmail_ids
    // gets user_id + we derive per-user watermark.
    const watermark = new Date(Date.now() - 30 * 86400000)
    const afterQuery = `after:${watermark.getUTCFullYear()}/${String(watermark.getUTCMonth() + 1).padStart(2, '0')}/${String(watermark.getUTCDate()).padStart(2, '0')}`

    // Existing gigs for context matching — scoped to this user so the classifier
    // never correlates incoming email against another tenant's gig list.
    const { data: gigs } = await supabase
      .from('gigs')
      .select('id, title, venue, location, date')
      .eq('user_id', userId)
      .order('date', { ascending: true })

    const allFindings: any[] = []

    for (const { gmail, email } of clients) {
      try {
        // Paginate — safety cap 200 messages per account per scan run.
        const MAX_MESSAGES_PER_ACCOUNT = 200
        const allMessages: Array<{ id?: string | null }> = []
        let pageToken: string | undefined
        do {
          const { data: list } = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 100,
            q: `${afterQuery} -in:sent -in:draft -category:promotions -category:social`,
            ...(pageToken ? { pageToken } : {}),
          })
          for (const m of list?.messages || []) allMessages.push(m)
          pageToken = list?.nextPageToken
          if (allMessages.length >= MAX_MESSAGES_PER_ACCOUNT) break
        } while (pageToken)

        for (const msg of allMessages.slice(0, MAX_MESSAGES_PER_ACCOUNT)) {
          if (!msg.id || processedIds.has(msg.id)) continue

          const { data: full } = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          })

          const headers = full.payload?.headers || []
          const from = headers.find((h: any) => h.name === 'From')?.value || ''
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''
          const body = extractEmailBody(full.payload)

          if (!body && !subject) continue

          const pdfRefs = collectPdfAttachments(full.payload)
          const pdfs = pdfRefs.length > 0
            ? await fetchPdfsForClaude(gmail, msg.id, pdfRefs)
            : []

          try {
            const classification = await classifyEmail(from, subject, body, gigs || [], pdfs)
            if (classification.confidence >= 0.5 && classification.type !== 'ignore') {
              allFindings.push({
                messageId: msg.id,
                account: email,
                subject,
                from,
                type: classification.type,
                confidence: classification.confidence,
                extracted: classification.extracted,
                gig_id: classification.gig_id || null,
              })
            }
          } catch {
            // Classification failed for this email — skip
            continue
          }
        }
      } catch {
        // Account scan failed — continue with others
        continue
      }
    }

    return NextResponse.json({ findings: allFindings })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
