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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients } from '@/lib/gmail-accounts'
import { createNotification } from '@/lib/notifications'
import { requireCronAuth } from '@/lib/cron-auth'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

// Service role — needed to:
//  (a) read tokens from connected_email_accounts (bypass RLS)
//  (b) iterate every tenant in the cron path
//  (c) write scoped rows via manual user_id filters
// NEVER let this client auto-scope by session — every query below must filter
// on user_id manually when reading per-tenant data.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Accepts EITHER a Bearer CRON_SECRET (external cron) OR a signed-in user
// session (dashboard "scan now"). Returns the userId to process, or null
// if this is a cron run that should iterate ALL tenants.
async function authGate(req: NextRequest): Promise<{ userId: string | null } | NextResponse> {
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader.startsWith('Bearer ') && process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return { userId: null } // cron — iterate all users
  }
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) {
    // Dev fallback — requireCronAuth allows the request when CRON_SECRET is unset.
    const cronResult = requireCronAuth(req, 'gmail-process')
    if (cronResult) return cronResult
    return { userId: null } // dev cron — iterate all users
  }
  return { userId: gate.user.id }
}

// ── Gmail auth: delegated to @/lib/gmail-accounts ─────────────────────────

// ── Email body extraction ───────────────────────────────────────────────────

function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

// Walks the MIME tree and collects PDF attachments as {attachmentId, filename, size}.
// Does NOT download — that happens lazily only for messages we want to classify.
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

// Fetch PDF attachment bytes from Gmail and convert base64url → base64 for Claude.
// Caps: max 3 PDFs per email, max 5MB per PDF (anything larger is dropped with a note).
async function fetchPdfsForClaude(
  gmail: any,
  messageId: string,
  refs: PdfAttachmentRef[]
): Promise<Array<{ filename: string; base64: string }>> {
  const MAX_PDFS = 3
  const MAX_BYTES = 5 * 1024 * 1024
  const picked = refs
    .filter(r => r.size > 0 && r.size <= MAX_BYTES)
    .slice(0, MAX_PDFS)

  const out: Array<{ filename: string; base64: string }> = []
  for (const ref of picked) {
    try {
      const { data } = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: ref.attachmentId,
      })
      if (data?.data) {
        // Gmail returns base64url; Anthropic PDF blocks need standard base64.
        const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/')
        out.push({ filename: ref.filename, base64 })
      }
    } catch {
      // Non-fatal — skip this attachment
    }
  }
  return out
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
  userId: string,
  from: string,
  subject: string,
  body: string,
  existingGigs: any[],
  pdfs: Array<{ filename: string; base64: string }> = []
): Promise<any> {
  const gigsContext = existingGigs.length
    ? `Existing gigs in the OS:\n${existingGigs.map(g =>
        `- ID: ${g.id} | ${g.title} @ ${g.venue}, ${g.location} on ${g.date}`
      ).join('\n')}`
    : 'No gigs in the OS yet.'

  const taskInstruction = `You are an email classifier for a DJ/electronic music artist. Classify incoming emails and extract relevant info. Return ONLY valid JSON.

${gigsContext}

Email types to detect:
- "new_gig": booking confirmation or contract with venue/date/fee details
- "hotel": hotel booking confirmation → extract hotel name, check-in/out dates, cost, booking ref
- "flight": flight confirmation → extract airline, flight number, route, departure/arrival times, cost, booking ref
- "train": train booking confirmation → extract operator, route, departure/arrival times, cost, booking ref
- "tech_spec": technical specification confirmed for a show
- "rider": hospitality or technical rider confirmed
- "invoice": invoice received, payment request, or payment receipt (deposit paid, balance due, payment confirmed)
- "invoice_request": someone asking Anthony to send an invoice, or telling him where/whom to bill. Keywords: "please invoice", "send the invoice to", "bill us at", "our accounts email is", "finance contact". Usually from agent/promoter. Extract the billing email.
- "billing_info": company billing / VAT / finance details for an existing gig (VAT number, company name, PO number, billing address). Extract all fields.
- "remittance": payment received / remittance advice / bank transfer confirmation / wire transfer notification. Keywords: remittance, payment advice, "payment has been made", "funds transferred", BACS, SWIFT, "paid into your account".
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

    // For invoice_request:
    "billing_email": "email to send invoice to",
    "billing_name": "person name or null",
    "billing_company": "company/venue name or null",
    "notes": "any extra context from the email",

    // For billing_info:
    "company_name": "legal company name",
    "billing_address": "full billing address or null",
    "vat_number": "VAT/tax number or null",
    "po_number": "PO number or null",
    "billing_email": "accounts/finance email or null",

    // For remittance:
    "amount": <number>,
    "currency": "EUR/GBP/USD",
    "sender_name": "who paid",
    "reference": "payment reference",
    "gig_title": "show it relates to, or null",
    "payment_date": "YYYY-MM-DD",
    "description": "one-line summary",

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
}`

  const userContent = pdfs.length > 0
    ? [
        {
          type: 'text' as const,
          text: `From: ${from}\nSubject: ${subject}\n\nBody:\n${body.slice(0, 3000)}\n\n(${pdfs.length} PDF attachment${pdfs.length > 1 ? 's' : ''} included — extract fields from them too.)`,
        },
        ...pdfs.map(pdf => ({
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: pdf.base64,
          },
        })),
      ]
    : `From: ${from}\nSubject: ${subject}\n\nBody:\n${body.slice(0, 3000)}`

  const result = await callClaudeWithBrain({
    userId,
    task: 'gmail.scan',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    taskInstruction,
    messagesOverride: [{ role: 'user', content: userContent }],
    runPostCheck: false,
  })

  const text = result.text || '{}'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// ── Action handlers ────────────────────────────────────────────────────────

async function handleNewGig(userId: string, extracted: any, emailFrom: string, classifiedGigId: string | null) {
  if (!extracted.title && !extracted.venue) return null

  // If classifier matched an existing gig, update it instead of creating a duplicate.
  // Double-scope on (id, user_id) so we can't update another tenant's gig via a
  // classifier misfire.
  if (classifiedGigId) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (extracted.fee) updates.fee = extracted.fee
    if (extracted.currency) updates.currency = extracted.currency
    if (extracted.time) updates.time = extracted.time
    if (extracted.promoter_email) updates.promoter_email = extracted.promoter_email
    // promoter_name folded into notes — no such column on gigs
    const promoterNameNote = extracted.promoter_name
      ? `Promoter contact: ${extracted.promoter_name}${extracted.promoter_email ? ` <${extracted.promoter_email}>` : ''}`
      : null
    if (extracted.notes || promoterNameNote) {
      updates.notes = [promoterNameNote, extracted.notes].filter(Boolean).join('\n')
    }

    await supabase.from('gigs').update(updates).eq('id', classifiedGigId).eq('user_id', userId)

    // Still create invoice if fee arrived and none exists yet
    if (extracted.fee && extracted.fee > 0) {
      const { data: existingInv } = await supabase
        .from('invoices').select('id').eq('gig_id', classifiedGigId).eq('user_id', userId).limit(1)

      if (!existingInv?.length) {
        const { data: gig } = await supabase.from('gigs').select('title, date, currency').eq('id', classifiedGigId).eq('user_id', userId).single()
        const gigDate = gig?.date ? new Date(gig.date) : new Date()
        const dueDate = new Date(gigDate.getTime() + 30 * 86400000)
        const { data: newInvoice } = await supabase.from('invoices').insert([{
          gig_id: classifiedGigId,
          user_id: userId,
          gig_title: gig?.title || extracted.title,
          amount: extracted.fee,
          currency: extracted.currency || gig?.currency || 'EUR',
          type: 'full',
          status: 'pending',
          due_date: dueDate.toISOString().split('T')[0],
        }]).select()

        if (newInvoice?.[0]) {
          await createNotification({
            user_id: userId,
            type: 'invoice_created',
            title: `Invoice created — ${gig?.title || extracted.title}`,
            message: `Due ${dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
            href: `/api/invoices/${newInvoice[0].id}`,
            gig_id: classifiedGigId,
          })
        }
      }
    }

    return { id: classifiedGigId, updated: true }
  }

  // Duplicate guard: check venue + date match before creating — scoped to user
  // so user A's venue+date match doesn't suppress user B's gig creation.
  if (extracted.venue && extracted.date) {
    const { data: existing } = await supabase
      .from('gigs')
      .select('id, title')
      .eq('user_id', userId)
      .ilike('venue', `%${extracted.venue}%`)
      .eq('date', extracted.date)
      .limit(1)

    if (existing?.length) {
      // Gig already exists — treat as update instead
      return handleNewGig(userId, extracted, emailFrom, existing[0].id)
    }
  }

  const { data, error } = await supabase.from('gigs').insert([{
    user_id: userId,
    title: extracted.title || `Show @ ${extracted.venue}`,
    venue: extracted.venue || '',
    location: extracted.location || '',
    date: extracted.date || null,
    time: extracted.time || '22:00',
    fee: extracted.fee || 0,
    currency: extracted.currency || 'EUR',
    status: 'confirmed',
    promoter_email: extracted.promoter_email || emailFrom,
    notes: [
      extracted.promoter_name
        ? `Promoter contact: ${extracted.promoter_name}${extracted.promoter_email ? ` <${extracted.promoter_email}>` : ''}`
        : null,
      extracted.notes || null,
    ].filter(Boolean).join('\n'),
    created_at: new Date().toISOString(),
  }]).select()

  if (error) throw error
  const gig = data?.[0]

  if (gig) {
    await createNotification({
      user_id: userId,
      type: 'gig_added',
      title: `New gig from email — ${gig.title}`,
      message: `${gig.venue}${gig.date ? ' · ' + new Date(gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`,
      href: `/gigs/${gig.id}`,
      gig_id: gig.id,
    })

    // Auto-create invoice if fee is set
    if (gig.fee && gig.fee > 0) {
      const gigDate = gig.date ? new Date(gig.date) : new Date()
      const dueDate = new Date(gigDate.getTime() + 30 * 86400000)
      const { data: newInvoice } = await supabase.from('invoices').insert([{
        gig_id: gig.id,
        user_id: userId,
        gig_title: gig.title,
        amount: gig.fee,
        currency: gig.currency || 'EUR',
        type: 'full',
        status: 'pending',
        due_date: dueDate.toISOString().split('T')[0],
      }]).select()

      if (newInvoice?.[0]) {
        await createNotification({
          user_id: userId,
          type: 'invoice_created',
          title: `Invoice created — ${gig.title}`,
          message: `Due ${dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
          href: `/api/invoices/${newInvoice[0].id}`,
          gig_id: gig.id,
        })
      }
    }
  }

  return gig
}

async function handleTravel(userId: string, type: string, gigId: string | null, extracted: any) {
  const categoryMap: Record<string, string> = {
    hotel: 'Accommodation',
    flight: 'Travel',
    train: 'Travel',
  }

  // Build travel_bookings record.
  // TODO(multi-tenant): travel_bookings has no user_id column yet. For now
  // tenant isolation relies on gig_id → gigs.user_id join. When the batch-2
  // migration adds user_id, stamp it here directly.
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

  // Also create expense record.
  // TODO(multi-tenant): expenses has no user_id column yet. Current scoping
  // is implicit via the creating user's session. Fix when migration lands.
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

async function handleRiderOrTechSpec(userId: string, type: string, gigId: string | null, extracted: any) {
  if (!gigId) return

  const field = type === 'rider' ? 'rider_notes' : 'tech_notes'
  await supabase.from('gigs').update({
    [field]: extracted.details || '',
    updated_at: new Date().toISOString(),
  }).eq('id', gigId).eq('user_id', userId)
}

async function handleGigUpdate(userId: string, gigId: string | null, extracted: any) {
  if (!gigId) return
  const { data: gig } = await supabase.from('gigs').select('notes').eq('id', gigId).eq('user_id', userId).single()
  const existingNotes = gig?.notes || ''
  await supabase.from('gigs').update({
    notes: existingNotes ? `${existingNotes}\n\n${extracted.update}` : extracted.update,
    updated_at: new Date().toISOString(),
  }).eq('id', gigId).eq('user_id', userId)
}

async function handleInvoice(userId: string, gigId: string | null, extracted: any) {
  const { data: gig } = gigId
    ? await supabase.from('gigs').select('title').eq('id', gigId).eq('user_id', userId).single()
    : { data: null }

  const invoiceTitle = gig?.title || extracted.gig_title || extracted.description || 'Email import'

  // Duplicate guard: skip if gig already has an invoice with same amount
  if (gigId) {
    const { data: existingInv } = await supabase
      .from('invoices')
      .select('id, amount')
      .eq('gig_id', gigId)
      .eq('user_id', userId)
      .limit(5)

    if (existingInv?.length) {
      const sameAmount = existingInv.some(inv => Number(inv.amount) === Number(extracted.amount || 0))
      if (sameAmount) return // exact duplicate — skip silently
    }
  }

  const { data: newInvoice } = await supabase.from('invoices').insert([{
    gig_id: gigId || null,
    user_id: userId,
    gig_title: invoiceTitle,
    amount: extracted.amount || 0,
    currency: extracted.currency || 'EUR',
    type: extracted.type || 'full',
    status: 'pending',
    due_date: extracted.due_date || null,
  }]).select()

  if (newInvoice?.[0]) {
    await createNotification({
      user_id: userId,
      type: 'invoice_created',
      title: `Invoice from email — ${invoiceTitle}`,
      message: extracted.due_date
        ? `Due ${new Date(extracted.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : `${extracted.currency || 'EUR'} amount pending`,
      href: `/api/invoices/${newInvoice[0].id}`,
      gig_id: gigId || undefined,
    })
  }
}

async function handleInvoiceRequest(userId: string, gigId: string | null, extracted: any, emailFrom: string) {
  // "Please invoice X" — update the gig's promoter_email and record the billing contact.
  if (!gigId) {
    // No matched gig — still notify so Anthony can link manually
    await createNotification({
      user_id: userId,
      type: 'invoice_request',
      title: `Billing contact received — no gig match`,
      message: `${extracted.billing_name || extracted.billing_email || 'Unknown'} — from ${emailFrom}. Link manually.`,
      href: `/gigs`,
    })
    return
  }

  const { data: gig } = await supabase.from('gigs').select('notes, promoter_email, title').eq('id', gigId).eq('user_id', userId).single()
  const existingNotes = gig?.notes || ''
  const billingLine = [
    'Billing routing:',
    extracted.billing_name && `- Contact: ${extracted.billing_name}`,
    extracted.billing_company && `- Company: ${extracted.billing_company}`,
    extracted.billing_email && `- Email: ${extracted.billing_email}`,
    extracted.notes && `- Note: ${extracted.notes}`,
  ].filter(Boolean).join('\n')

  const updates: Record<string, unknown> = {
    notes: existingNotes ? `${existingNotes}\n\n${billingLine}` : billingLine,
    updated_at: new Date().toISOString(),
  }
  // Only overwrite promoter_email if the gig doesn't have one yet
  if (extracted.billing_email && !gig?.promoter_email) {
    updates.promoter_email = extracted.billing_email
  }
  await supabase.from('gigs').update(updates).eq('id', gigId).eq('user_id', userId)

  await createNotification({
    user_id: userId,
    type: 'invoice_request',
    title: `Billing contact for ${gig?.title || 'gig'}`,
    message: extracted.billing_email || extracted.billing_name || 'Billing info updated',
    href: `/gigs/${gigId}`,
    gig_id: gigId,
  })
}

async function handleBillingInfo(userId: string, gigId: string | null, extracted: any) {
  // Company billing / VAT / PO details — append to gig notes.
  if (!gigId) return
  const { data: gig } = await supabase.from('gigs').select('notes, title').eq('id', gigId).eq('user_id', userId).single()
  const existingNotes = gig?.notes || ''
  const billingBlock = [
    'Invoice/billing details:',
    extracted.company_name && `- Company: ${extracted.company_name}`,
    extracted.billing_address && `- Address: ${extracted.billing_address}`,
    extracted.vat_number && `- VAT: ${extracted.vat_number}`,
    extracted.po_number && `- PO: ${extracted.po_number}`,
    extracted.billing_email && `- Accounts email: ${extracted.billing_email}`,
  ].filter(Boolean).join('\n')

  await supabase.from('gigs').update({
    notes: existingNotes ? `${existingNotes}\n\n${billingBlock}` : billingBlock,
    updated_at: new Date().toISOString(),
  }).eq('id', gigId).eq('user_id', userId)

  await createNotification({
    user_id: userId,
    type: 'invoice_request',
    title: `Billing details added — ${gig?.title || 'gig'}`,
    message: extracted.company_name || extracted.vat_number || 'Billing info updated',
    href: `/gigs/${gigId}`,
    gig_id: gigId,
  })
}

async function handleRemittance(userId: string, gigId: string | null, extracted: any) {
  // Payment received — try to match an outstanding invoice by gig + amount.
  // If matched, mark paid and notify. Otherwise notify for manual reconciliation.
  let matchedInvoice: any = null

  if (gigId && extracted.amount) {
    const { data: invs } = await supabase
      .from('invoices')
      .select('id, amount, status, gig_title, type')
      .eq('gig_id', gigId)
      .eq('user_id', userId)
      .neq('status', 'paid')
      .limit(5)

    if (invs?.length) {
      // Prefer exact amount match, else closest smaller-or-equal
      matchedInvoice = invs.find(i => Number(i.amount) === Number(extracted.amount)) || null
    }
  }

  if (matchedInvoice) {
    await supabase.from('invoices').update({
      status: 'paid',
      updated_at: new Date().toISOString(),
    }).eq('id', matchedInvoice.id).eq('user_id', userId)

    await createNotification({
      user_id: userId,
      type: 'payment_received',
      title: `Payment received — ${matchedInvoice.gig_title}`,
      message: `${extracted.currency || ''} ${extracted.amount} · ${extracted.sender_name || 'sender unknown'}${extracted.reference ? ` · ref ${extracted.reference}` : ''}`,
      href: `/api/invoices/${matchedInvoice.id}`,
      gig_id: gigId || undefined,
    })
  } else {
    // No auto-match — notify for manual reconciliation
    await createNotification({
      user_id: userId,
      type: 'payment_received',
      title: `Remittance received — needs linking`,
      message: `${extracted.currency || ''} ${extracted.amount || '?'} from ${extracted.sender_name || 'unknown'}${extracted.gig_title ? ` · re: ${extracted.gig_title}` : ''}${extracted.reference ? ` · ref ${extracted.reference}` : ''}`,
      href: `/invoices`,
      gig_id: gigId || undefined,
    })
  }
}

async function handleRelease(userId: string, extracted: any) {
  if (!extracted.title) return
  // TODO(multi-tenant): releases has no user_id column yet — stamp when migrated.
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

// ── Thread contact extraction ──────────────────────────────────────────────

// Parse an RFC-2822 address list into {name, email} pairs.
// Handles: `Archie <archie@turbomgmt.co.uk>`, `"Last, First" <a@b>`, `plain@b`, multiple comma-separated.
function parseAddressList(raw: string): Array<{ name: string | null; email: string }> {
  if (!raw) return []
  const out: Array<{ name: string | null; email: string }> = []
  // Split on commas NOT inside quotes
  const parts: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes
    if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = '' }
    else current += ch
  }
  if (current.trim()) parts.push(current.trim())

  for (const part of parts) {
    const angleMatch = part.match(/^(.*?)\s*<([^>]+)>\s*$/)
    if (angleMatch) {
      const name = angleMatch[1].replace(/^["']|["']$/g, '').trim() || null
      const email = angleMatch[2].trim().toLowerCase()
      if (email.includes('@')) out.push({ name, email })
    } else if (part.includes('@')) {
      out.push({ name: null, email: part.trim().toLowerCase() })
    }
  }
  return out
}

// Infer a coarse role from email address + domain.
function inferContactRole(email: string, promoterEmailOnGig: string | null): string | null {
  const local = email.split('@')[0] || ''
  const domain = email.split('@')[1] || ''

  if (/turbomgmt\.co\.uk$/i.test(domain)) return 'agent'
  if (/^(accounts?|finance|billing|invoices?|ap|accountspayable)\b/i.test(local)) return 'finance'
  if (/^(prod|production|tech|lighting|sound)\b/i.test(local)) return 'production'
  if (promoterEmailOnGig && email === promoterEmailOnGig.toLowerCase()) return 'promoter'
  if (/^(hello|info|bookings|team|contact|enquiries)\b/i.test(local)) return 'venue'
  return 'promoter'
}

async function captureThreadContacts(
  gigId: string,
  headers: Array<{ name?: string; value?: string }>,
  ownEmails: Set<string>,
  promoterEmailOnGig: string | null,
) {
  const getHeader = (n: string) => headers.find(h => (h.name || '').toLowerCase() === n.toLowerCase())?.value || ''
  const all = [
    ...parseAddressList(getHeader('From')),
    ...parseAddressList(getHeader('To')),
    ...parseAddressList(getHeader('Cc')),
    ...parseAddressList(getHeader('Reply-To')),
  ]

  // Dedup by email, prefer rows that include a name
  const byEmail = new Map<string, { name: string | null; email: string }>()
  for (const c of all) {
    if (ownEmails.has(c.email)) continue
    const existing = byEmail.get(c.email)
    if (!existing || (!existing.name && c.name)) byEmail.set(c.email, c)
  }
  if (byEmail.size === 0) return

  const now = new Date().toISOString()
  const rows = Array.from(byEmail.values()).map(c => ({
    gig_id: gigId,
    email: c.email,
    name: c.name,
    role: inferContactRole(c.email, promoterEmailOnGig),
    source: 'gmail',
    first_seen_at: now,
    last_seen_at: now,
  }))

  // Upsert on (gig_id, email) — if it exists, bump last_seen_at + fill in name/role if we now know them
  for (const row of rows) {
    const { data: existing } = await supabase
      .from('gig_contacts')
      .select('id, name, role')
      .eq('gig_id', row.gig_id)
      .eq('email', row.email)
      .maybeSingle()

    if (existing) {
      await supabase.from('gig_contacts').update({
        last_seen_at: now,
        name: existing.name || row.name,
        role: existing.role || row.role,
      }).eq('id', existing.id)
    } else {
      await supabase.from('gig_contacts').insert([row])
    }
  }
}

// ── Mark email as processed ────────────────────────────────────────────────

async function markProcessed(_gmail: any, messageId: string) {
  try {
    // Track in Supabase to avoid reprocessing.
    // We no longer remove UNREAD — Anthony reads emails on his phone; processed state
    // belongs in our DB, not in his Gmail read-state. Dedup happens via processed_gmail_ids.
    await supabase.from('processed_gmail_ids').insert([{
      message_id: messageId,
      processed_at: new Date().toISOString(),
    }])
  } catch {
    // Non-fatal
  }
}

// ── Process emails for one account ────────────────────────────────────────

async function processAccount(userId: string, gmail: any, accountEmail: string, processedIds: Set<string>, gigs: any[], afterQuery: string, ownEmails: Set<string>): Promise<any[]> {
  const results: any[] = []

  // Paginate through the inbox — safety cap at 200 messages per account per run
  // so we never blow out the cron budget if the watermark slipped badly.
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
    const from    = headers.find((h: any) => h.name === 'From')?.value || ''
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''
    const body    = extractEmailBody(full.payload)

    if (!body && !subject) { await markProcessed(gmail, msg.id); continue }

    // Collect + fetch PDF attachments so Claude can read contracts / tickets / invoices directly.
    const pdfRefs = collectPdfAttachments(full.payload)
    const pdfs = pdfRefs.length > 0
      ? await fetchPdfsForClaude(gmail, msg.id, pdfRefs)
      : []

    let classification: any
    try {
      classification = await classifyEmail(userId, from, subject, body, gigs, pdfs)
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
        actionResult = await handleNewGig(userId, classification.extracted, from, classification.gig_id)
        break
      case 'hotel':
      case 'flight':
      case 'train':
        await handleTravel(userId, classification.type, classification.gig_id, classification.extracted)
        actionResult = { created: 'travel_booking', type: classification.type }
        break
      case 'rider':
      case 'tech_spec':
        await handleRiderOrTechSpec(userId, classification.type, classification.gig_id, classification.extracted)
        actionResult = { updated: classification.gig_id }
        break
      case 'invoice':
        await handleInvoice(userId, classification.gig_id, classification.extracted)
        actionResult = { created: 'invoice' }
        break
      case 'invoice_request':
        await handleInvoiceRequest(userId, classification.gig_id, classification.extracted, from)
        actionResult = { updated: classification.gig_id, kind: 'invoice_request' }
        break
      case 'billing_info':
        await handleBillingInfo(userId, classification.gig_id, classification.extracted)
        actionResult = { updated: classification.gig_id, kind: 'billing_info' }
        break
      case 'remittance':
        await handleRemittance(userId, classification.gig_id, classification.extracted)
        actionResult = { kind: 'remittance' }
        break
      case 'release':
        await handleRelease(userId, classification.extracted)
        actionResult = { created: 'release' }
        break
      case 'gig_update':
        await handleGigUpdate(userId, classification.gig_id, classification.extracted)
        actionResult = { updated: classification.gig_id }
        break
    }

    // Capture every CC/To address on the thread against the matched gig.
    // If the classifier created a gig (new_gig action), use the returned id.
    // gig_contacts inherits tenant scope via gig_id → gigs.user_id. The explicit
    // user_id filter below ensures we only dereference gigs owned by this user.
    const resolvedGigId: string | null = classification.gig_id
      || (actionResult && typeof actionResult === 'object' && 'id' in actionResult ? (actionResult as any).id : null)

    if (resolvedGigId) {
      try {
        const { data: matchedGig } = await supabase
          .from('gigs').select('promoter_email').eq('id', resolvedGigId).eq('user_id', userId).single()
        if (matchedGig) {
          await captureThreadContacts(resolvedGigId, headers, ownEmails, matchedGig?.promoter_email || null)
        }
      } catch {
        // Non-fatal — contact capture shouldn't block message processing
      }
    }

    await markProcessed(gmail, msg.id)
    processedIds.add(msg.id)

    results.push({
      account: accountEmail,
      messageId: msg.id,
      subject,
      type: classification.type,
      gig_id: resolvedGigId,
      action: actionResult,
    })
  }

  return results
}

// ── Per-user scan orchestrator ────────────────────────────────────────────
// Scans one tenant's connected Gmail accounts. Called either once (user
// session) or once per connected user (cron path).
async function processForUser(userId: string): Promise<{ userId: string; accounts: number; processed: number; results: any[] }> {
  let clients: Awaited<ReturnType<typeof getGmailClients>>
  try {
    clients = await getGmailClients(userId)
  } catch {
    return { userId, accounts: 0, processed: 0, results: [] }
  }

  // TODO(multi-tenant): processed_gmail_ids has no user_id column yet. Dedup
  // is safe across tenants because Google message IDs are unique and one
  // tenant's OAuth only returns their own message IDs. Using a fixed 30-day
  // lookback (instead of a derived-from-global watermark) avoids user B
  // missing emails older than user A's last scan.
  const { data: processed } = await supabase
    .from('processed_gmail_ids')
    .select('message_id')
    .limit(5000)
  const processedIds = new Set((processed || []).map((r: any) => r.message_id))

  const watermark = new Date(Date.now() - 30 * 86400000)
  const afterQuery = `after:${watermark.getUTCFullYear()}/${String(watermark.getUTCMonth() + 1).padStart(2, '0')}/${String(watermark.getUTCDate()).padStart(2, '0')}`

  // Existing gigs for context matching — tenant-scoped.
  const { data: gigs } = await supabase
    .from('gigs')
    .select('id, title, venue, location, date')
    .eq('user_id', userId)
    .order('date', { ascending: true })

  const ownEmails = new Set<string>(
    clients.map(c => (c.email || '').toLowerCase()).filter(Boolean)
  )

  const allResults: any[] = []
  for (const { gmail, email } of clients) {
    try {
      const results = await processAccount(userId, gmail, email, processedIds, gigs || [], afterQuery, ownEmails)
      allResults.push(...results)
    } catch (err) {
      allResults.push({ account: email, error: err instanceof Error ? err.message : 'Failed' })
    }
  }

  return {
    userId,
    accounts: clients.length,
    processed: allResults.filter(r => !r.error).length,
    results: allResults,
  }
}

// ── Main route ─────────────────────────────────────────────────────────────

// POST /api/gmail/process
//  - Bearer CRON_SECRET (external cron) → iterates every tenant that has a
//    row in connected_email_accounts and processes each inbox separately.
//  - Signed-in user → processes only the caller's own inboxes.
export async function POST(req: NextRequest) {
  const auth = await authGate(req)
  if (auth instanceof NextResponse) return auth

  try {
    // User-triggered: scope to just this user.
    if (auth.userId) {
      const r = await processForUser(auth.userId)
      return NextResponse.json({ ok: true, ...r })
    }

    // Cron path: iterate every connected tenant.
    const { data: rows } = await supabase
      .from('connected_email_accounts')
      .select('user_id')
    const userIds = Array.from(new Set((rows || []).map(r => r.user_id).filter(Boolean))) as string[]

    const perUser: any[] = []
    for (const uid of userIds) {
      try {
        const r = await processForUser(uid)
        perUser.push(r)
      } catch (err) {
        perUser.push({ userId: uid, error: err instanceof Error ? err.message : 'failed' })
      }
    }

    return NextResponse.json({
      ok: true,
      tenants: userIds.length,
      processed: perUser.reduce((n, u) => n + (u.processed || 0), 0),
      perUser,
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
    description: 'Reads unread Gmail per connected tenant, classifies with Claude, writes scoped records',
  })
}
