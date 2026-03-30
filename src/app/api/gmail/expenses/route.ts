import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

// Use service role key to bypass RLS for token reads/writes and expense inserts
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

// ── Claude expense classifier ───────────────────────────────────────────────

interface ExpenseClassification {
  is_expense: boolean
  confidence?: number
  category?: string
  description?: string
  amount?: number | null
  currency?: string
  date?: string
  vendor?: string
}

async function classifyExpense(subject: string, body: string): Promise<ExpenseClassification> {
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
      system: `You are an expense classifier for a professional DJ and electronic music artist.
Scan this email and determine if it represents a business expense.

Business expense categories for a DJ/artist:
- Travel: flights, trains, taxis, Uber, fuel, parking (to/from shows)
- Accommodation: hotels, Airbnb (for shows)
- Equipment: gear, cables, headphones, software, plugins, hard drives
- Marketing: promo costs, photography, graphic design, ads
- Venue: stage fees, backline hire
- Software: DAW licenses, streaming services, plugins, cloud storage
- Other: any other legitimate business expense

Return ONLY valid JSON:
{
  "is_expense": true/false,
  "confidence": 0.0-1.0,
  "category": "Travel|Accommodation|Equipment|Marketing|Venue|Software|Other",
  "description": "one-line description, 50 chars max",
  "amount": <number or null>,
  "currency": "GBP|EUR|USD|AUD",
  "date": "YYYY-MM-DD",
  "vendor": "company/service name"
}

If is_expense is false or confidence < 0.65, return { "is_expense": false }.`,
      messages: [{
        role: 'user',
        content: `Subject: ${subject}\n\nBody:\n${body.slice(0, 2000)}`,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{ "is_expense": false }'
  return JSON.parse(text.replace(/```json|```/g, '').trim()) as ExpenseClassification
}

// ── Main route ─────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const gmail = await getGmailClient()

    // Get already-processed expense email IDs
    const { data: processed } = await supabase
      .from('processed_expense_gmail_ids')
      .select('message_id')
    const processedIds = new Set((processed || []).map((r: any) => r.message_id))

    // Fetch up to 50 messages matching expense patterns from last 30 days
    const { data: list } = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: 'newer_than:30d (receipt OR invoice OR "order confirmation" OR "booking confirmation" OR "payment received" OR "your order" OR "transaction" OR "purchase" OR easyjet OR ryanair OR skyscanner OR airbnb OR booking.com OR "uber receipt" OR trainline OR "amazon order")',
    })

    const messages = list.messages || []
    const foundExpenses: any[] = []
    let scanned = 0

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

      let classification: ExpenseClassification
      try {
        classification = await classifyExpense(subject, body)
      } catch {
        // Mark as processed to avoid retrying broken emails
        try {
          await supabase.from('processed_expense_gmail_ids').insert([{
            message_id: msg.id,
            processed_at: new Date().toISOString(),
          }])
        } catch { /* non-fatal */ }
        continue
      }

      // Mark as processed regardless of outcome
      try {
        await supabase.from('processed_expense_gmail_ids').insert([{
          message_id: msg.id,
          processed_at: new Date().toISOString(),
        }])
      } catch { /* non-fatal */ }

      if (!classification.is_expense || (classification.confidence ?? 0) < 0.65) {
        continue
      }

      // Insert into expenses table with pending_review status
      const { data: expense, error } = await supabase
        .from('expenses')
        .insert([{
          date: classification.date || new Date().toISOString().slice(0, 10),
          description: classification.description || subject.slice(0, 100),
          category: classification.category || 'Other',
          amount: classification.amount || 0,
          currency: classification.currency || 'GBP',
          notes: `Auto-imported from Gmail — ${classification.vendor || 'unknown vendor'}`,
          status: 'pending_review',
        }])
        .select()
        .single()

      if (!error && expense) {
        foundExpenses.push(expense)
      }
    }

    return NextResponse.json({
      ok: true,
      scanned,
      found: foundExpenses.length,
      expenses: foundExpenses,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'POST /api/gmail/expenses',
    description: 'Scans Gmail for receipts and auto-populates the expense log',
  })
}
