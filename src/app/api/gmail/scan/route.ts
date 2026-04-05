import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients } from '@/lib/gmail-accounts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

async function classifyEmail(from: string, subject: string, body: string, existingGigs: any[]): Promise<any> {
  const gigsContext = existingGigs.length
    ? `Existing gigs:\n${existingGigs.map(g => `- ID: ${g.id} | ${g.title} @ ${g.venue}, ${g.location} on ${g.date}`).join('\n')}`
    : 'No gigs yet.'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      system: `You are an email classifier for a DJ/electronic music artist. Classify incoming emails. Return ONLY valid JSON.

${gigsContext}

Email types: new_gig, hotel, flight, train, tech_spec, rider, invoice, release, gig_update, remittance, ignore.
"remittance" = payment received / remittance advice / bank transfer confirmation / wire transfer notification. Keywords: remittance, payment advice, "payment has been made", "funds transferred", BACS, SWIFT.

Return: {"type":"...","confidence":0.0-1.0,"gig_id":"uuid or null","extracted":{
  // new_gig: title, venue, location, date (YYYY-MM-DD), time (HH:MM), fee, currency, promoter_name, promoter_email, notes
  // hotel: name, check_in, check_out, cost, currency, reference
  // flight: name, flight_number, from, to, departure_at (YYYY-MM-DDTHH:MM), arrival_at, cost, currency, reference
  // train: name, from, to, departure_at, arrival_at, cost, currency, reference
  // invoice: gig_title, amount, currency, type (deposit/full/balance), due_date, description
  // release: title, type (single/ep/album), release_date, label, streaming_url, notes
  // tech_spec / rider: details
  // gig_update: update
  // remittance: amount, currency, sender_name, reference, gig_title, payment_date, description
}}`,
      messages: [{ role: 'user', content: `From: ${from}\nSubject: ${subject}\n\nBody:\n${body.slice(0, 3000)}` }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// GET /api/gmail/scan — scan inbox and return findings WITHOUT creating any records
export async function GET() {
  try {
    let clients: Awaited<ReturnType<typeof getGmailClients>>
    try {
      clients = await getGmailClients()
    } catch {
      // No Gmail connected — return empty findings gracefully
      return NextResponse.json({ findings: [], reason: 'no_gmail_connected' })
    }

    // Get already-processed IDs so we don't re-surface them
    const { data: processed } = await supabase
      .from('processed_gmail_ids')
      .select('message_id')
    const processedIds = new Set((processed || []).map((r: any) => r.message_id))

    // Existing gigs for context matching
    const { data: gigs } = await supabase
      .from('gigs')
      .select('id, title, venue, location, date')
      .order('date', { ascending: true })

    const allFindings: any[] = []

    for (const { gmail, email } of clients) {
      try {
        const { data: list } = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 20,
          q: 'is:unread newer_than:14d',
        })

        for (const msg of (list?.messages || [])) {
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

          try {
            const classification = await classifyEmail(from, subject, body, gigs || [])
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
