// Required Supabase table (run once):
// CREATE TABLE travel_bookings (
//   id uuid primary key default gen_random_uuid(),
//   gig_id uuid references gigs(id) on delete set null,
//   type text not null, -- 'flight' | 'train' | 'hotel'
//   name text,          -- airline / operator / hotel name
//   flight_number text,
//   from_location text,
//   to_location text,
//   departure_at timestamptz,
//   arrival_at timestamptz,
//   check_in date,
//   check_out date,
//   reference text,
//   cost numeric,
//   currency text default 'EUR',
//   notes text,
//   source text default 'manual',
//   created_at timestamptz default now()
// );

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients } from '@/lib/gmail-accounts'

// Use service role key to bypass RLS for token reads/writes and gig updates
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Gmail auth: delegated to @/lib/gmail-accounts ─────────────────────────

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

// ── Claude email classifier ────────────────────────────────────────────────

async function classifyEmail(
  from: string,
  subject: string,
  body: string,
  existingGigs: any[]
): Promise<any> {
  const gigsContext = existingGigs.length
    ? `Existing gigs in the OS:\n${existingGigs.map(g =>
        `- ID: ${g.id} | ${g.title} @ ${g.venue}, ${g.location} on ${g.date}`
      ).join('\n')}`
    : 'No gigs in the OS yet.'

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
      system: `You are an email classifier for a DJ/electronic music artist. Classify incoming emails and extract relevant info. Return ONLY valid JSON.

${gigsContext}

Email types to detect:
- "new_gig": booking confirmation or contract with venue/date/fee details
- "hotel": hotel booking confirmation → extract hotel name, check-in/out dates, cost, booking ref
- "flight": flight confirmation → extract airline, flight number, route, departure/arrival times, cost, booking ref
- "train": train booking confirmation → extract operator, route, departure/arrival times, cost, booking ref
- "tech_spec": technical specification confirmed for a show
- "rider": hospitality or technical rider confirmed
- "invoice": invoice received, payment request, or payment receipt (deposit paid, balance due, payment confirmed)
- "release": release confirmation, distribution email, label announcement, streaming live notification, mastering delivery
- "gig_update": general info update for an existing show (schedule change, new contact, etc.)
- "ignore": newsletters, spam, unrelated

Return:
{
  "type": "<one of the types above>",
  "confidence": <0.0–1.0>,
  "gig_id": "<matched gig ID from existing list, or null>",
  "extracted": {
    // For new_gig:
    "title": "event name",
    "venue": "venue name",
    "location": "city, country",
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "fee": <number or null>,
    "currency": "EUR/GBP/USD",
    "promoter_name": "name or null",
    "promoter_email": "email or null",
    "notes": "any special notes",

    // For hotel:
    "name": "hotel name",
    "check_in": "YYYY-MM-DD",
    "check_out": "YYYY-MM-DD",
    "cost": <number or null>,
    "currency": "EUR/GBP/USD",
    "reference": "booking reference",

    // For flight:
    "name": "airline name",
    "flight_number": "e.g. FR1234",
    "from": "departure airport/city",
    "to": "arrival airport/city",
    "departure_at": "YYYY-MM-DDTHH:MM",
    "arrival_at": "YYYY-MM-DDTHH:MM",
    "cost": <number or null>,
    "currency": "EUR/GBP/USD",
    "reference": "booking reference",

    // For train:
    "name": "operator name e.g. Eurostar, Avanti",
    "from": "departure station/city",
    "to": "arrival station/city",
    "departure_at": "YYYY-MM-DDTHH:MM",
    "arrival_at": "YYYY-MM-DDTHH:MM",
    "cost": <number or null>,
    "currency": "EUR/GBP/USD",
    "reference": "booking reference",

    // For tech_spec / rider:
    "details": "summary of what was confirmed",

    // For invoice:
    "gig_title": "event or show this relates to, or null",
    "amount": <number>,
    "currency": "EUR/GBP/USD",
    "type": "deposit or full or balance",
    "due_date": "YYYY-MM-DD or null",
    "description": "one-line summary of what this invoice/payment is for",

    // For release:
    "title": "release title",
    "type": "single or ep or album",
    "release_date": "YYYY-MM-DD or null",
    "label": "label name or null",
    "streaming_url": "URL if included or null",
    "notes": "any relevant notes",

    // For gig_update:
    "update": "one sentence summary of the change"
  }
}`,
      messages: [{
        role: 'user',
        content: `From: ${from}\nSubject: ${subject}\n\nBody:\n${body.slice(0, 3000)}`,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// ── Action handlers ────────────────────────────────────────────────────────

async function handleNewGig(extracted: any, emailFrom: string) {
  if (!extracted.title && !extracted.venue) return null

  const { data, error } = await supabase.from('gigs').insert([{
    title: extracted.title || `Show @ ${extracted.venue}`,
    venue: extracted.venue || '',
    location: extracted.location || '',
    date: extracted.date || null,
    time: extracted.time || '22:00',
    fee: extracted.fee || 0,
    currency: extracted.currency || 'EUR',
    status: 'confirmed',
    promoter_email: extracted.promoter_email || emailFrom,
    promoter_name: extracted.promoter_name || '',
    notes: extracted.notes || '',
    created_at: new Date().toISOString(),
  }]).select()

  if (error) throw error
  return data?.[0]
}

async function handleTravel(type: string, gigId: string | null, extracted: any) {
  const categoryMap: Record<string, string> = {
    hotel: 'Accommodation',
    flight: 'Travel',
    train: 'Travel',
  }

  // Build travel_bookings record
  const booking: Record<string, unknown> = {
    gig_id: gigId || null,
    type,
    name: extracted.name || null,
    reference: extracted.reference || null,
    cost: extracted.cost || null,
    currency: extracted.currency || 'EUR',
    notes: null,
    source: 'gmail',
    created_at: new Date().toISOString(),
  }

  if (type === 'hotel') {
    booking.check_in = extracted.check_in || null
    booking.check_out = extracted.check_out || null
  } else {
    booking.from_location = extracted.from || null
    booking.to_location = extracted.to || null
    booking.departure_at = extracted.departure_at || null
    booking.arrival_at = extracted.arrival_at || null
    if (type === 'flight') booking.flight_number = extracted.flight_number || null
  }

  await supabase.from('travel_bookings').insert([booking])

  // Also create expense record
  if (extracted.cost) {
    const label = type === 'hotel'
      ? `Hotel: ${extracted.name || 'accommodation'}`
      : `${type === 'flight' ? 'Flight' : 'Train'}: ${extracted.from || ''} → ${extracted.to || ''}`

    await supabase.from('expenses').insert([{
      date: (type === 'hotel' ? extracted.check_in : extracted.departure_at?.slice(0, 10)) || new Date().toISOString().slice(0, 10),
      description: label,
      category: categoryMap[type],
      amount: extracted.cost,
      currency: extracted.currency || 'EUR',
      notes: extracted.reference ? `Ref: ${extracted.reference}` : null,
    }])
  }
}

async function handleRiderOrTechSpec(type: string, gigId: string | null, extracted: any) {
  if (!gigId) return

  const field = type === 'rider' ? 'rider_notes' : 'tech_notes'
  await supabase.from('gigs').update({
    [field]: extracted.details || '',
    updated_at: new Date().toISOString(),
  }).eq('id', gigId)
}

async function handleGigUpdate(gigId: string | null, extracted: any) {
  if (!gigId) return
  const { data: gig } = await supabase.from('gigs').select('notes').eq('id', gigId).single()
  const existingNotes = gig?.notes || ''
  await supabase.from('gigs').update({
    notes: existingNotes ? `${existingNotes}\n\n${extracted.update}` : extracted.update,
    updated_at: new Date().toISOString(),
  }).eq('id', gigId)
}

async function handleInvoice(gigId: string | null, extracted: any) {
  const { data: gig } = gigId
    ? await supabase.from('gigs').select('title').eq('id', gigId).single()
    : { data: null }

  await supabase.from('invoices').insert([{
    gig_id: gigId || null,
    gig_title: gig?.title || extracted.gig_title || extracted.description || 'Email import',
    amount: extracted.amount || 0,
    currency: extracted.currency || 'EUR',
    type: extracted.type || 'full',
    status: 'pending',
    due_date: extracted.due_date || null,
  }])
}

async function handleRelease(extracted: any) {
  if (!extracted.title) return
  await supabase.from('releases').insert([{
    title: extracted.title,
    type: extracted.type || 'single',
    release_date: extracted.release_date || null,
    label: extracted.label || null,
    streaming_url: extracted.streaming_url || null,
    notes: extracted.notes || null,
    source: 'gmail',
    created_at: new Date().toISOString(),
  }])
}

// ── Mark email as processed ────────────────────────────────────────────────

async function markProcessed(gmail: any, messageId: string) {
  try {
    // Add a label "Artist OS" and mark as read
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    })

    // Track in Supabase to avoid reprocessing
    await supabase.from('processed_gmail_ids').insert([{
      message_id: messageId,
      processed_at: new Date().toISOString(),
    }])
  } catch {
    // Non-fatal
  }
}

// ── Process emails for one account ────────────────────────────────────────

async function processAccount(gmail: any, accountEmail: string, processedIds: Set<string>, gigs: any[]): Promise<any[]> {
  const results: any[] = []

  const { data: list } = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 30,
    q: 'is:unread newer_than:14d',
  })

  const messages = list?.messages || []

  for (const msg of messages) {
    if (!msg.id || processedIds.has(msg.id)) continue

    const { data: full } = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    })

    const headers = full.payload?.headers || []
    const from    = headers.find((h: any) => h.name === 'From')?.value || ''
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''
    const body    = extractEmailBody(full.payload)

    if (!body && !subject) { await markProcessed(gmail, msg.id); continue }

    let classification: any
    try {
      classification = await classifyEmail(from, subject, body, gigs)
    } catch {
      continue
    }

    if (classification.confidence < 0.5 || classification.type === 'ignore') {
      await markProcessed(gmail, msg.id)
      continue
    }

    let actionResult: any = null

    switch (classification.type) {
      case 'new_gig':
        actionResult = await handleNewGig(classification.extracted, from)
        break
      case 'hotel':
      case 'flight':
      case 'train':
        await handleTravel(classification.type, classification.gig_id, classification.extracted)
        actionResult = { created: 'travel_booking', type: classification.type }
        break
      case 'rider':
      case 'tech_spec':
        await handleRiderOrTechSpec(classification.type, classification.gig_id, classification.extracted)
        actionResult = { updated: classification.gig_id }
        break
      case 'invoice':
        await handleInvoice(classification.gig_id, classification.extracted)
        actionResult = { created: 'invoice' }
        break
      case 'release':
        await handleRelease(classification.extracted)
        actionResult = { created: 'release' }
        break
      case 'gig_update':
        await handleGigUpdate(classification.gig_id, classification.extracted)
        actionResult = { updated: classification.gig_id }
        break
    }

    await markProcessed(gmail, msg.id)
    processedIds.add(msg.id)

    results.push({
      account: accountEmail,
      messageId: msg.id,
      subject,
      type: classification.type,
      gig_id: classification.gig_id,
      action: actionResult,
    })
  }

  return results
}

// ── Main route ─────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const clients = await getGmailClients()

    // Get already-processed IDs (shared across accounts)
    const { data: processed } = await supabase
      .from('processed_gmail_ids')
      .select('message_id')
    const processedIds = new Set((processed || []).map((r: any) => r.message_id))

    // Fetch existing gigs for context matching
    const { data: gigs } = await supabase
      .from('gigs')
      .select('id, title, venue, location, date')
      .order('date', { ascending: true })

    const allResults: any[] = []

    for (const { gmail, email } of clients) {
      try {
        const results = await processAccount(gmail, email, processedIds, gigs || [])
        allResults.push(...results)
      } catch (err) {
        allResults.push({ account: email, error: err instanceof Error ? err.message : 'Failed' })
      }
    }

    return NextResponse.json({
      ok: true,
      accounts: clients.length,
      processed: allResults.filter(r => !r.error).length,
      results: allResults,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Health check / manual trigger from dashboard
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'POST /api/gmail/process',
    description: 'Reads unread Gmail, classifies with Claude, updates gigs',
  })
}
