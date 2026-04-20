import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients } from '@/lib/gmail-accounts'
import { extractEmailBody } from '@/lib/gmail-utils'
import { createNotification } from '@/lib/notifications'
import { requireCronAuth } from '@/lib/cron-auth'
import { requireUser } from '@/lib/api-auth'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// Inbox scraper
//
// Responsibilities (in order):
//   1. Find Gmail threads likely to contain invoice/advance/fee content.
//   2. For each unprocessed thread: concatenate every message's body so billing
//      details in a reply correlate with the original fee ask.
//   3. Ask Claude Sonnet to extract recipient email, CC, billing entity, VAT,
//      fee, currency, gig date, venue, city, due terms.
//   4. Match the extraction to an existing gigs row (date ±7d + venue/city
//      substring). When matched, backfill promoter_email + billing notes on
//      the gig and link any new invoice to gig_id.
//   5. Create a draft invoice (type='invoice_request', status='draft') with
//      sent_to_promoter_email pre-populated. NOTHING is sent — Anthony still
//      taps through the SMS approval flow before anything leaves.
//   6. Fire an in-app notification so the draft shows up in the feed.
//
// Auth:
//   GET  → cron-compatible, requires Bearer CRON_SECRET in prod.
//   POST → same logic, legacy entry point retained for internal UI triggers.
//
// Idempotency: processed_invoice_gmail_ids stores the message_id of the LATEST
// message in each processed thread. Re-processing is triggered whenever a new
// reply arrives on the same thread (because the latest message_id changes).
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Extraction {
  is_invoice_request: boolean
  confidence: number
  gig_title: string
  gig_date: string | null      // ISO yyyy-mm-dd, best guess from thread
  venue: string | null
  city: string | null
  amount: number | null
  currency: string
  due_days: number
  recipient_email: string | null   // who to send the invoice TO
  cc_emails: string[]              // additional recipients worth CCing
  billing_entity: string | null    // legal name of the company paying
  billing_address: string | null   // full address if present
  vat_number: string | null        // VAT / Tax reg number
  from_name: string
  notes: string
}

async function extractFromThread(subject: string, combinedBody: string): Promise<Extraction> {
  const apiKey = (await env('ANTHROPIC_API_KEY'))!
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: `You extract invoice request details from email threads addressed to a DJ / electronic music artist (NIGHT manoeuvres) or their management (Turbo Mgmt). Threads come from booking agents, promoters, festivals, and venues.

An invoice request is ANY thread that signals the artist needs to submit/send an invoice. Treat these as positive signals:
- Direct: "please invoice", "send us the invoice", "submit your invoice"
- Implicit: "will come back with invoice", "linking for advancing", "please bill us"
- Settlement / final fee / balance due / payment advice / hold fee confirmation
- Advance threads where a fee is confirmed

Do NOT flag: newsletters, bills FROM suppliers TO the artist, bookings still being negotiated with no fee confirmed.

You will receive the WHOLE thread concatenated in chronological order, so correlate details across replies. The billing entity / VAT often appears in a later reply than the initial fee ask.

Return ONLY valid JSON, no prose, no markdown:
{
  "is_invoice_request": true|false,
  "confidence": 0.0-1.0,
  "gig_title": "short event/show description, max 60 chars",
  "gig_date": "YYYY-MM-DD" | null,
  "venue": "venue name" | null,
  "city": "city" | null,
  "amount": <number> | null,
  "currency": "GBP"|"EUR"|"USD"|"AUD"|...,
  "due_days": <integer, default 30>,
  "recipient_email": "who the invoice should be emailed to — the finance/production contact who said 'send us the invoice', not the artist or their manager" | null,
  "cc_emails": ["other addresses worth CCing: original agent/promoter contacts, excluding turbomgmt.co.uk which is auto-added"],
  "billing_entity": "exact legal company name to bill (often in reply with VAT details)" | null,
  "billing_address": "full address including postcode and country" | null,
  "vat_number": "VAT/Tax registration number as written" | null,
  "from_name": "lead contact name or company",
  "notes": "any extra context that will help the artist, max 140 chars"
}`,
      messages: [{
        role: 'user',
        content: `Thread subject: ${subject}\n\nFull thread (chronological):\n${combinedBody.slice(0, 12000)}`,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  const cleaned = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}

// ── Gig matcher ─────────────────────────────────────────────────────────────

interface GigRow {
  id: string
  title: string | null
  venue: string | null
  location: string | null
  date: string | null
  promoter_email: string | null
  notes: string | null
}

function daysDiff(a: string, b: string): number {
  return Math.abs(Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000))
}

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function matchGig(userId: string, ex: Extraction): Promise<GigRow | null> {
  if (!ex.gig_date) return null

  // Window of ±14d catches advances 2 weeks ahead and paid settlements 2 weeks back.
  const min = new Date(new Date(ex.gig_date).getTime() - 14 * 86400000).toISOString().slice(0, 10)
  const max = new Date(new Date(ex.gig_date).getTime() + 14 * 86400000).toISOString().slice(0, 10)

  // Scoped to caller — otherwise we'd happily match one tenant's incoming thread
  // against another tenant's gig list.
  const { data: candidates } = await supabase
    .from('gigs')
    .select('id, title, venue, location, date, promoter_email, notes')
    .eq('user_id', userId)
    .gte('date', min)
    .lte('date', max)

  if (!candidates?.length) return null

  // Score each candidate. Perfect date match + venue/city hit wins.
  const vQ = norm(ex.venue)
  const cQ = norm(ex.city)
  const tQ = norm(ex.gig_title)
  let best: { gig: GigRow; score: number } | null = null

  for (const g of candidates as GigRow[]) {
    const vG = norm(g.venue)
    const lG = norm(g.location)
    const tG = norm(g.title)
    let score = 0
    const d = daysDiff(g.date!, ex.gig_date)
    if (d === 0) score += 5
    else if (d <= 2) score += 3
    else if (d <= 7) score += 1
    if (vQ && (vG.includes(vQ) || vQ.includes(vG))) score += 4
    if (cQ && (lG.includes(cQ) || cQ.includes(lG))) score += 3
    if (tQ && tG && (tG.includes(tQ.split(' ')[0]) || tQ.includes(tG.split(' ')[0]))) score += 1
    if (!best || score > best.score) best = { gig: g, score }
  }

  // Require at least a date hit + one of venue/city — avoids matching a random gig in the same month.
  return best && best.score >= 4 ? best.gig : null
}

// ── Thread processor ────────────────────────────────────────────────────────

interface ProcessedThread {
  threadId: string
  subject: string
  extraction: Extraction
  matchedGigId: string | null
  invoiceId: string | null
  gigBackfilled: boolean
  skipped?: string
}

async function processThread(
  userId: string,
  gmail: any,
  threadId: string,
  processedLatestIds: Set<string>
): Promise<ProcessedThread | null> {
  const { data: thread } = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })
  const msgs: any[] = thread?.messages || []
  if (!msgs.length) return null

  // Idempotency: dedupe on the latest message id. If the thread has had a new
  // reply since last scan, the id changes and we re-process. (Otherwise skip.)
  const latestId = msgs[msgs.length - 1].id as string
  if (processedLatestIds.has(latestId)) return null

  const subject =
    msgs[0].payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '(no subject)'

  // Build a chronological, labelled dump so the model can correlate replies.
  const parts: string[] = []
  for (const m of msgs) {
    const hs = m.payload?.headers || []
    const from = hs.find((h: any) => h.name === 'From')?.value || ''
    const to = hs.find((h: any) => h.name === 'To')?.value || ''
    const cc = hs.find((h: any) => h.name === 'Cc')?.value || ''
    const date = hs.find((h: any) => h.name === 'Date')?.value || ''
    const body = extractEmailBody(m.payload) || m.snippet || ''
    parts.push(
      `── MESSAGE (${date}) ──\nFrom: ${from}\nTo: ${to}${cc ? `\nCc: ${cc}` : ''}\n\n${body.slice(0, 3500)}`
    )
  }
  const combined = parts.join('\n\n')

  let ex: Extraction
  try {
    ex = await extractFromThread(subject, combined)
  } catch (err) {
    console.error(`[invoice-requests] extraction failed for thread ${threadId}:`, err)
    return { threadId, subject, extraction: null as any, matchedGigId: null, invoiceId: null, gigBackfilled: false, skipped: 'extraction_error' }
  }

  // Always mark processed so we don't re-pay Claude for the same thread on every run.
  await markProcessed(latestId)

  if (!ex.is_invoice_request || ex.confidence < 0.6) {
    return { threadId, subject, extraction: ex, matchedGigId: null, invoiceId: null, gigBackfilled: false, skipped: 'low_confidence' }
  }

  // Deterministic CC cleanup: drop blanks, de-dupe, strip turbomgmt (auto-added on send).
  const ccEmails = Array.from(new Set((ex.cc_emails || []).map(e => e.trim()).filter(Boolean)))
    .filter(e => !/turbomgmt\.co\.uk/i.test(e))

  // Match to an existing gig when possible.
  const matched = await matchGig(userId, ex)

  // Backfill gig.promoter_email + billing notes when matched and missing.
  // Double-scope on (id, user_id) so we can't write to another tenant's gig.
  let gigBackfilled = false
  if (matched) {
    const updates: Record<string, string> = {}
    if (!matched.promoter_email && ex.recipient_email) {
      updates.promoter_email = ex.recipient_email
    }
    const billingBlock = [
      ex.billing_entity ? `Billing: ${ex.billing_entity}` : '',
      ex.billing_address || '',
      ex.vat_number ? `VAT: ${ex.vat_number}` : '',
    ].filter(Boolean).join('\n').trim()
    if (billingBlock && !(matched.notes || '').includes(billingBlock)) {
      updates.notes = [matched.notes, billingBlock].filter(Boolean).join('\n\n---\n')
    }
    if (Object.keys(updates).length) {
      const { error } = await supabase.from('gigs').update(updates).eq('id', matched.id).eq('user_id', userId)
      if (!error) gigBackfilled = true
    }
  }

  // Always create a draft invoice. Status='draft' keeps it off the active
  // invoicing flow until Anthony reviews. Links to gig when matched.
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + (ex.due_days ?? 30))

  const notesBlock = [
    ex.from_name ? `From: ${ex.from_name}.` : '',
    ex.notes || '',
    ex.billing_entity ? `\nBilling: ${ex.billing_entity}` : '',
    ex.billing_address || '',
    ex.vat_number ? `VAT: ${ex.vat_number}` : '',
    ccEmails.length ? `\nCC: ${ccEmails.join(', ')}` : '',
  ].filter(Boolean).join(' ').trim()

  const { data: inv } = await supabase
    .from('invoices')
    .insert([{
      gig_id: matched?.id || null,
      user_id: userId,
      gig_title: ex.gig_title || subject.slice(0, 60),
      amount: ex.amount ?? 0,
      currency: ex.currency || 'GBP',
      type: 'invoice_request',
      status: 'draft',
      due_date: dueDate.toISOString().slice(0, 10),
      gig_date: ex.gig_date || null,
      sent_to_promoter_email: ex.recipient_email || matched?.promoter_email || null,
      notes: notesBlock || null,
      created_at: new Date().toISOString(),
    }])
    .select()
    .single()

  if (inv) {
    await createNotification({
      user_id: userId,
      type: 'invoice_request',
      title: `Invoice request — ${inv.gig_title}`,
      message: matched
        ? `Matched to ${matched.title || matched.venue} · ${ex.currency} ${ex.amount ?? '?'} · review in Finances`
        : `${ex.from_name || 'unknown'} · ${ex.currency} ${ex.amount ?? '?'} · no gig match — review in Finances`,
      href: '/business/finances',
      gig_id: matched?.id || undefined,
    })
  }

  return {
    threadId,
    subject,
    extraction: ex,
    matchedGigId: matched?.id || null,
    invoiceId: inv?.id || null,
    gigBackfilled,
  }
}

async function markProcessed(messageId: string) {
  try {
    await supabase.from('processed_invoice_gmail_ids').insert([{
      message_id: messageId,
      processed_at: new Date().toISOString(),
    }])
  } catch {
    // Duplicate primary key — already processed.
  }
}

// ── Entry points ────────────────────────────────────────────────────────────

async function runScanForUser(userId: string) {
  const clients = await getGmailClients(userId)

  // TODO(multi-tenant): processed_invoice_gmail_ids has no user_id column yet.
  // Cross-tenant collision impossible in practice (Google message IDs are unique,
  // and each tenant's OAuth only returns their own IDs), but worth migrating
  // in the same batch as processed_gmail_ids.
  const { data: processed } = await supabase
    .from('processed_invoice_gmail_ids')
    .select('message_id')
  const processedLatestIds = new Set((processed || []).map((r: any) => r.message_id))

  const query = 'newer_than:60d (invoice OR settlement OR "balance due" OR "please invoice" OR "can you invoice" OR "send an invoice" OR "invoice us" OR "send us the invoice" OR "invoice for" OR "payment request" OR "please bill" OR fee OR "payment advice" OR advancing)'

  const results: ProcessedThread[] = []
  const debug: any[] = []

  for (const { gmail, email } of clients) {
    try {
      const { data: list } = await gmail.users.messages.list({ userId: 'me', maxResults: 50, q: query })
      const msgs: any[] = list?.messages || []
      // Dedupe to one entry per thread — threads hold the correlated context.
      const threadIds = Array.from(new Set(msgs.map(m => m.threadId).filter(Boolean)))
      debug.push({ account: email, hits: msgs.length, threads: threadIds.length })

      for (const tid of threadIds) {
        try {
          const r = await processThread(userId, gmail, tid, processedLatestIds)
          if (r) results.push(r)
        } catch (err) {
          console.error(`[invoice-requests] thread ${tid} failed:`, err)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      debug.push({ account: email, error: msg })
    }
  }

  return {
    userId,
    accounts: clients.length,
    processed: results.length,
    invoicesCreated: results.filter(r => r.invoiceId).length,
    gigsBackfilled: results.filter(r => r.gigBackfilled).length,
    results,
    debug,
  }
}

// Accepts EITHER a cron bearer token OR a logged-in Supabase session.
// This lets the external daily cron fire it AND the dashboard "Scan inbox now"
// button call it without exposing CRON_SECRET to the browser.
// Returns { userId: string } to process one tenant, or { userId: null } to
// iterate all connected tenants (cron path).
async function authGate(req: NextRequest): Promise<{ userId: string | null } | NextResponse> {
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader.startsWith('Bearer ') && process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return { userId: null }
  }
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) {
    // Dev fallback — requireCronAuth allows the request when CRON_SECRET is unset.
    const cronResult = requireCronAuth(req, 'invoice-requests')
    if (cronResult) return cronResult
    return { userId: null }
  }
  return { userId: gate.user.id }
}

async function runScan(auth: { userId: string | null }) {
  if (auth.userId) {
    return runScanForUser(auth.userId)
  }
  // Cron: iterate every connected tenant.
  const { data: rows } = await supabase
    .from('connected_email_accounts')
    .select('user_id')
  const userIds = Array.from(new Set((rows || []).map(r => r.user_id).filter(Boolean))) as string[]

  const perUser: any[] = []
  for (const uid of userIds) {
    try {
      const r = await runScanForUser(uid)
      perUser.push(r)
    } catch (err) {
      perUser.push({ userId: uid, error: err instanceof Error ? err.message : 'failed' })
    }
  }
  return {
    ok: true,
    tenants: userIds.length,
    invoicesCreated: perUser.reduce((n, u) => n + (u.invoicesCreated || 0), 0),
    gigsBackfilled: perUser.reduce((n, u) => n + (u.gigsBackfilled || 0), 0),
    perUser,
  }
}

export async function GET(req: NextRequest) {
  const auth = await authGate(req)
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json(await runScan(auth))
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'scan failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await authGate(req)
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json(await runScan(auth))
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'scan failed' }, { status: 500 })
  }
}
