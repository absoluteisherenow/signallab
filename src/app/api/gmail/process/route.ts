import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
- "hotel": hotel booking confirmation → extract hotel name, check-in date, cost
- "flight": flight confirmation → extract flight details, dates, cost
- "tech_spec": technical specification confirmed for a show
- "rider": hospitality or technical rider confirmed
- "payment": invoice, payment receipt, deposit received
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

    // For hotel/flight:
    "name": "hotel or airline name",
    "date": "YYYY-MM-DD",
    "cost": <number or null>,
    "currency": "EUR/GBP/USD",
    "confirmation_ref": "booking reference",
    "details": "one-line summary",

    // For tech_spec / rider:
    "details": "summary of what was confirmed",

    // For payment:
    "amount": <number>,
    "currency": "EUR/GBP/USD",
    "description": "what the payment is for",

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

async function handleHotelOrFlight(type: string, gigId: string | null, extracted: any) {
  if (!gigId) return

  const field = type === 'hotel' ? 'hotel_name' : 'flight_details'
  const costField = type === 'hotel' ? 'hotel_cost' : 'flight_cost'

  await supabase.from('gigs').update({
    [field]: extracted.name || extracted.details || '',
    [costField]: extracted.cost || 0,
    updated_at: new Date().toISOString(),
  }).eq('id', gigId)
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

// ── Main route ─────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const gmail = await getGmailClient()

    // Get already-processed IDs
    const { data: processed } = await supabase
      .from('processed_gmail_ids')
      .select('message_id')
    const processedIds = new Set((processed || []).map((r: any) => r.message_id))

    // Fetch existing gigs for context matching
    const { data: gigs } = await supabase
      .from('gigs')
      .select('id, title, venue, location, date')
      .order('date', { ascending: true })

    // Fetch recent unread emails
    const { data: list } = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 30,
      q: 'is:unread newer_than:7d',
    })

    const messages = list.messages || []
    const results: any[] = []

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
        classification = await classifyEmail(from, subject, body, gigs || [])
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
          await handleHotelOrFlight(classification.type, classification.gig_id, classification.extracted)
          actionResult = { updated: classification.gig_id }
          break
        case 'rider':
        case 'tech_spec':
          await handleRiderOrTechSpec(classification.type, classification.gig_id, classification.extracted)
          actionResult = { updated: classification.gig_id }
          break
        case 'gig_update':
          await handleGigUpdate(classification.gig_id, classification.extracted)
          actionResult = { updated: classification.gig_id }
          break
      }

      await markProcessed(gmail, msg.id)

      results.push({
        messageId: msg.id,
        subject,
        type: classification.type,
        gig_id: classification.gig_id,
        action: actionResult,
      })
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Gmail process error:', message)
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
