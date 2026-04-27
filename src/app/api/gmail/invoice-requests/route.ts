import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients, listAccountsNeedingReauth } from '@/lib/gmail-accounts'
import {
  extractEmailBody,
  collectPdfAttachments,
  fetchPdfsForClaude,
  collectImageAttachments,
  fetchImagesForClaude,
  type ImageAttachmentRef,
} from '@/lib/gmail-utils'
import { createNotification } from '@/lib/notifications'
import { requireCronAuth } from '@/lib/cron-auth'
import { requireUser } from '@/lib/api-auth'
import { callClaude } from '@/lib/callClaude'
import { buildApprovalPath } from '@/lib/invoice-approval'
import { SCANNER_CADENCE_MIN, getUserTier } from '@/lib/scanTiers'

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

type ThreadKind =
  | 'new_invoice'
  | 'invoice_amendment'
  | 'advancing'
  | 'hotel'
  | 'contract'
  | 'set_time_change'
  | 'payment_confirmation'
  | 'cancellation'
  | 'other'

interface Extraction {
  // Legacy flag — kept for backwards compat with existing dedup logic.
  is_invoice_request: boolean
  // New: every actionable thread is classified into one of ThreadKind. `other`
  // means we saw a keyword hit but nothing actionable (small talk, ack only).
  kind: ThreadKind
  confidence: number
  gig_title: string
  gig_date: string | null
  venue: string | null
  city: string | null
  amount: number | null
  currency: string
  due_days: number
  recipient_email: string | null
  cc_emails: string[]
  billing_entity: string | null
  billing_address: string | null
  vat_number: string | null
  from_name: string
  notes: string
  // Per-kind structured fields — all optional, filled when kind matches.
  amendment?: {
    field: string          // e.g. "billing_address", "amount", "vat_number"
    new_value: string      // the corrected value as stated in the email
    summary: string        // one-line human summary of the change
  } | null
  advancing?: {
    set_time: string | null     // e.g. "23:00-01:00"
    load_in: string | null
    hotel: string | null
    contact_name: string | null
    contact_phone: string | null
  } | null
  hotel_details?: {
    name: string | null
    address: string | null
    check_in: string | null
    check_out: string | null
    confirmation_number: string | null
  } | null
  set_time_change?: {
    new_time: string        // e.g. "23:30"
    reason: string | null
  } | null
  payment?: {
    invoice_reference: string | null   // invoice # or title snippet
    amount_paid: number | null
  } | null
}

async function extractFromThread(
  subject: string,
  combinedBody: string,
  pdfs: Array<{ filename: string; base64: string }>,
  images: Array<{ filename: string; base64: string; mediaType: ImageAttachmentRef['mediaType'] }>,
  userId?: string
): Promise<Extraction> {
  const res = await callClaude({
    userId,
    feature: 'gmail_scanner',
    model: 'claude-sonnet-4-6',
    max_tokens: 1100,
    system: `You classify email threads addressed to a DJ / electronic music artist or their management. Threads come from booking agents, promoters, festivals, venues, travel coordinators.

Classify into one ThreadKind:
- "new_invoice": thread signals the artist needs to submit/send an invoice (NEW ask — "please invoice", "send us the invoice", settlement / final fee / balance due / hold fee confirmation / advance threads where fee is confirmed).
- "invoice_amendment": existing invoice needs a correction — different billing address, different VAT, different amount, different entity, reissue requested. Keywords: "please update invoice", "can you change the address", "reissue", "correct".
- "advancing": logistics thread — set time / stage time, load-in, production contact, rider confirmation, travel logistics being firmed up. NOT a fee ask.
- "hotel": hotel booked / confirmation sent / check-in details.
- "contract": contract / booking agreement sent, signed, or requested.
- "set_time_change": set time has CHANGED from what was previously agreed. URGENT.
- "payment_confirmation": invoice has been paid / payment remittance / "funds sent".
- "cancellation": gig cancelled or postponed.
- "other": keyword hit but not actionable (small talk, acknowledgement, newsletter).

Do NOT flag newsletters, mass marketing, bills FROM suppliers TO the artist, or early-stage bookings still being negotiated with no fee confirmed (those = "other").

You will receive the WHOLE thread concatenated in chronological order. Details often span multiple replies — correlate them. The LATEST message usually dictates the kind.

Return ONLY valid JSON, no prose, no markdown. Only include per-kind fields for the kind you picked; others = null:
{
  "kind": "new_invoice"|"invoice_amendment"|"advancing"|"hotel"|"contract"|"set_time_change"|"payment_confirmation"|"cancellation"|"other",
  "is_invoice_request": true|false,
  "confidence": 0.0-1.0,
  "gig_title": "short event/show description, max 60 chars",
  "gig_date": "YYYY-MM-DD" | null,
  "venue": "venue name" | null,
  "city": "city" | null,
  "amount": <number> | null,
  "currency": "GBP"|"EUR"|"USD"|"AUD"|...,
  "due_days": <integer, default 30>,
  "recipient_email": "finance/production contact who would receive the invoice" | null,
  "cc_emails": ["other addresses worth CCing, excluding turbomgmt.co.uk which is auto-added"],
  "billing_entity": "exact legal company name" | null,
  "billing_address": "full address with postcode + country" | null,
  "vat_number": "VAT/Tax reg number as written" | null,
  "from_name": "lead contact name or company",
  "notes": "140-char human summary",
  "amendment": { "field": "billing_address|amount|vat_number|billing_entity|other", "new_value": "...", "summary": "one-line change description" } | null,
  "advancing": { "set_time": "HH:MM-HH:MM" | null, "load_in": "..." | null, "hotel": "..." | null, "contact_name": "..." | null, "contact_phone": "..." | null } | null,
  "hotel_details": { "name": "..." | null, "address": "..." | null, "check_in": "YYYY-MM-DD" | null, "check_out": "YYYY-MM-DD" | null, "confirmation_number": "..." | null } | null,
  "set_time_change": { "new_time": "HH:MM", "reason": "..." | null } | null,
  "payment": { "invoice_reference": "..." | null, "amount_paid": <number> | null } | null
}`,
    messages: [{
      role: 'user',
      content: (pdfs.length + images.length) > 0
        ? [
            {
              type: 'text' as const,
              text: `Thread subject: ${subject}\n\nFull thread (chronological):\n${combinedBody.slice(0, 12000)}\n\n(${pdfs.length} PDF + ${images.length} image attachment${pdfs.length + images.length > 1 ? 's' : ''} included — extract billing address / VAT / amounts from them. Amendments often live only inside the attachment, especially screenshots of updated invoices or billing details.)`,
            },
            ...pdfs.map(pdf => ({
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: pdf.base64,
              },
            })),
            ...images.map(img => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType,
                data: img.base64,
              },
            })),
          ]
        : `Thread subject: ${subject}\n\nFull thread (chronological):\n${combinedBody.slice(0, 12000)}`,
    }],
  })

  const text = res.text || '{}'
  const cleaned = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned) as Extraction
  // Back-compat: older extractor didn't return kind — infer from is_invoice_request.
  if (!parsed.kind) {
    parsed.kind = parsed.is_invoice_request ? 'new_invoice' : 'other'
  }
  // Keep legacy flag in sync for dedup path that still reads it.
  if (parsed.kind === 'new_invoice') parsed.is_invoice_request = true
  return parsed
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
  kind?: ThreadKind
  action?: string      // short human-readable action taken, for scan report
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
  // Collect PDF attachments across the whole thread — billing-address and VAT
  // amendments often live only inside the attached PDF, not the body. Cap at
  // 3 PDFs per thread total so a long reply chain doesn't blow the token budget.
  const parts: string[] = []
  const pdfRefsByMessage: Array<{ messageId: string; refs: ReturnType<typeof collectPdfAttachments> }> = []
  const imgRefsByMessage: Array<{ messageId: string; refs: ReturnType<typeof collectImageAttachments> }> = []
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
    const pdfRefs = collectPdfAttachments(m.payload)
    if (pdfRefs.length) pdfRefsByMessage.push({ messageId: m.id, refs: pdfRefs })
    const imgRefs = collectImageAttachments(m.payload)
    if (imgRefs.length) imgRefsByMessage.push({ messageId: m.id, refs: imgRefs })
  }
  const combined = parts.join('\n\n')

  // Fetch attachment bytes — walk newest → oldest so an amendment in the
  // latest reply wins if we hit the 3-each cap.
  const pdfs: Array<{ filename: string; base64: string }> = []
  for (const { messageId, refs } of [...pdfRefsByMessage].reverse()) {
    if (pdfs.length >= 3) break
    const fetched = await fetchPdfsForClaude(gmail, messageId, refs, { maxPdfs: 3 - pdfs.length })
    pdfs.push(...fetched)
  }
  const images: Array<{ filename: string; base64: string; mediaType: ImageAttachmentRef['mediaType'] }> = []
  for (const { messageId, refs } of [...imgRefsByMessage].reverse()) {
    if (images.length >= 3) break
    const fetched = await fetchImagesForClaude(gmail, messageId, refs, { maxImages: 3 - images.length })
    images.push(...fetched)
  }

  let ex: Extraction
  try {
    ex = await extractFromThread(subject, combined, pdfs, images, userId)
  } catch (err) {
    console.error(`[invoice-requests] extraction failed for thread ${threadId}:`, err)
    return { threadId, subject, extraction: null as any, matchedGigId: null, invoiceId: null, gigBackfilled: false, skipped: 'extraction_error' }
  }

  // Always mark processed so we don't re-pay Claude for the same thread on every run.
  await markProcessed(latestId)

  // Subject-signal override: if the SUBJECT itself declares an action (invoice
  // update/change/amend, address change, reissue, payment received, cancellation,
  // set-time change) we NEVER silently drop — even if the body is empty (e.g.
  // a screenshot-only email). Raise a review bell so the user can open it.
  const subjHit = detectSubjectSignal(subject)
  if (subjHit && (ex.kind === 'other' || ex.confidence < 0.6)) {
    await createNotification({
      user_id: userId,
      type: 'invoice_request',
      title: `Review needed — ${subject.slice(0, 80)}`,
      message: `Subject signals ${subjHit.replace('_', ' ')} but body was empty or unclear. Open in Gmail to review.`,
      href: '/business/finances',
      sendSms: false,
    })
    return {
      threadId, subject, extraction: ex,
      matchedGigId: null, invoiceId: null, gigBackfilled: false,
      kind: subjHit as ThreadKind,
      action: `Flagged for review (subject-only) — ${subject.slice(0, 60)}`,
    }
  }

  if (ex.kind === 'other' || ex.confidence < 0.6) {
    return { threadId, subject, extraction: ex, matchedGigId: null, invoiceId: null, gigBackfilled: false, skipped: 'low_confidence', kind: ex.kind }
  }

  // Deterministic CC cleanup: drop blanks, de-dupe, strip turbomgmt (auto-added on send).
  const ccEmails = Array.from(new Set((ex.cc_emails || []).map(e => e.trim()).filter(Boolean)))
    .filter(e => !/turbomgmt\.co\.uk/i.test(e))

  // Match to an existing gig when possible.
  const matched = await matchGig(userId, ex)

  // ── Non-invoice kinds: route into advancing / hotel / contract / etc. ──────
  // Each of these writes the actionable info onto gigs.notes (or gig column),
  // fires an in-app bell, and — only for set-time changes and cancellations —
  // fires an SMS. Nothing outbound is ever sent automatically.
  if (ex.kind !== 'new_invoice' && ex.kind !== 'invoice_amendment' && ex.kind !== 'payment_confirmation') {
    return await handleNonInvoiceKind(userId, ex, matched, subject, threadId)
  }

  // Invoice amendment: find the existing invoice for this gig and flag it for
  // reissue. Append the requested change to notes on both gig + invoice. Bell
  // only — no SMS (non-urgent ops task).
  if (ex.kind === 'invoice_amendment') {
    return await handleInvoiceAmendment(userId, ex, matched, subject, threadId)
  }

  // Payment confirmation: mark matched invoice paid if we can identify it.
  if (ex.kind === 'payment_confirmation') {
    return await handlePaymentConfirmation(userId, ex, matched, subject, threadId)
  }

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

  // Title/gig-first dedup doctrine:
  //   1. Matched gig has ANY paid/overdue invoice OR an invoice already sent
  //      to promoter → HARD DEDUP (no insert, no notification). This is the
  //      "back-dated invoice" protection — the fee is already handled.
  //   2. Matched gig has ANY invoice → dedup (we know about this booking).
  //   3. Distinctive title/venue token overlap → dedup.
  //   4. Last-resort: same amount+currency+recipient domain in last 120d → dedup.
  // Amount alone is NEVER a dedup signal — many bookings share £360 / €250 / $200.
  {
    const { data: allRecent } = await supabase
      .from('invoices')
      .select('id,gig_id,gig_title,amount,currency,sent_to_promoter_email,sent_to_promoter_at,status,created_at')
      .gte('created_at', new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString())
      .eq(userId ? 'user_id' : 'id', userId || '00000000-0000-0000-0000-000000000000')

    // Rule 1: hard dedup if matched gig already has a paid/sent invoice.
    if (matched?.id) {
      const gigHasSettled = (allRecent || []).find((r: any) =>
        r.gig_id === matched.id &&
        (r.status === 'paid' || r.status === 'overdue' || r.sent_to_promoter_at)
      )
      if (gigHasSettled) {
        return {
          threadId,
          subject,
          extraction: ex,
          matchedGigId: matched.id,
          invoiceId: gigHasSettled.id,
          gigBackfilled,
          skipped: 'already_settled',
        }
      }
    }

    const incomingTitle = (ex.gig_title || '').toLowerCase()
    const incomingVenue = (ex.venue || '').toLowerCase()
    const STOPWORDS = new Set(['the','a','an','at','for','with','and','or','of','to','in','on','by','night','manoeuvres','absolute','feature','tour','festival'])
    const distinctiveTokens = new Set(
      [incomingTitle, incomingVenue]
        .flatMap(s => s.split(/\s+/))
        .map(w => w.replace(/[^\w]/g, '').toLowerCase())
        .filter(w => w.length >= 4 && !STOPWORDS.has(w))
    )
    const recipientDomain = (ex.recipient_email || '').split('@')[1]?.toLowerCase() || ''

    const dupe = (allRecent || []).find((r: any) => {
      if (matched?.id && r.gig_id === matched.id) return true
      const existingTitle = (r.gig_title || '').toLowerCase()
      for (const t of distinctiveTokens) {
        if (existingTitle.includes(t)) return true
      }
      if (
        ex.amount && ex.currency &&
        r.amount === ex.amount && r.currency === ex.currency &&
        recipientDomain && (r.sent_to_promoter_email || '').toLowerCase().includes(recipientDomain)
      ) return true
      return false
    })

    if (dupe) {
      return {
        threadId,
        subject,
        extraction: ex,
        matchedGigId: matched?.id || null,
        invoiceId: dupe.id,
        gigBackfilled,
        skipped: 'duplicate_invoice',
      }
    }
  }

  // Create a draft invoice. Status='draft' keeps it off the active
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
    // SMS only when confidence ≥ 0.75 AND we're creating a real new invoice
    // row. Lower-confidence extractions still get a bell (so nothing is lost)
    // but no phone buzz — Anthony reviews in Finances at his own pace.
    const highConfidence = (ex.confidence ?? 0) >= 0.75
    // HMAC-signed deeplink → /invoices/{id}/approve?t=... works without login
    // so tapping the SMS from phone doesn't bounce through auth wall.
    let approvalHref: string = '/business/finances'
    try { approvalHref = buildApprovalPath(inv.id) } catch { /* missing secret = fall back to finances */ }
    await createNotification({
      user_id: userId,
      type: 'invoice_request',
      title: `Invoice request — ${inv.gig_title}`,
      message: matched
        ? `Matched to ${matched.title || matched.venue} · ${ex.currency} ${ex.amount ?? '?'} · tap to review`
        : `${ex.from_name || 'unknown'} · ${ex.currency} ${ex.amount ?? '?'} · no gig match — tap to review`,
      href: approvalHref,
      gig_id: matched?.id || undefined,
      sendSms: highConfidence,
    })
  }

  return {
    threadId,
    subject,
    extraction: ex,
    matchedGigId: matched?.id || null,
    invoiceId: inv?.id || null,
    gigBackfilled,
    kind: 'new_invoice' as ThreadKind,
    action: inv ? `Draft invoice created — ${inv.gig_title}` : undefined,
  }
}

// ── Non-invoice kind handlers ───────────────────────────────────────────────

function appendToNotes(existing: string | null, block: string): string {
  if (!existing) return block
  if (existing.includes(block)) return existing
  return `${existing}\n\n---\n${block}`
}

async function handleNonInvoiceKind(
  userId: string,
  ex: Extraction,
  matched: GigRow | null,
  subject: string,
  threadId: string,
): Promise<ProcessedThread> {
  // Build a kind-specific note block to append to the gig.
  let noteBlock = ''
  let title = ''
  let message = ''
  let critical = false
  let gigColumnUpdates: Record<string, any> = {}

  switch (ex.kind) {
    case 'advancing': {
      const a = ex.advancing || ({} as any)
      const lines = [
        `[Advancing — ${new Date().toISOString().slice(0, 10)}]`,
        a.set_time ? `Set time: ${a.set_time}` : '',
        a.load_in ? `Load-in: ${a.load_in}` : '',
        a.hotel ? `Hotel: ${a.hotel}` : '',
        a.contact_name ? `Contact: ${a.contact_name}${a.contact_phone ? ` · ${a.contact_phone}` : ''}` : '',
        ex.notes || '',
      ].filter(Boolean)
      noteBlock = lines.join('\n')
      if (a.set_time) gigColumnUpdates.set_time = a.set_time
      title = `Advancing details — ${ex.gig_title || matched?.title || subject.slice(0, 40)}`
      message = [a.set_time && `set ${a.set_time}`, a.load_in && `load-in ${a.load_in}`, a.hotel && `hotel: ${a.hotel.slice(0, 30)}`].filter(Boolean).join(' · ') || 'Logistics update'
      break
    }
    case 'hotel': {
      const h = ex.hotel_details || ({} as any)
      const lines = [
        `[Hotel — ${new Date().toISOString().slice(0, 10)}]`,
        h.name ? `Hotel: ${h.name}` : '',
        h.address ? h.address : '',
        h.check_in ? `Check-in: ${h.check_in}${h.check_out ? ` → ${h.check_out}` : ''}` : '',
        h.confirmation_number ? `Confirmation #: ${h.confirmation_number}` : '',
        ex.notes || '',
      ].filter(Boolean)
      noteBlock = lines.join('\n')
      title = `Hotel booked — ${ex.gig_title || matched?.title || subject.slice(0, 40)}`
      message = h.name || ex.notes || 'Hotel details received'
      break
    }
    case 'contract': {
      noteBlock = `[Contract — ${new Date().toISOString().slice(0, 10)}]\n${ex.notes || 'Contract received, review required'}`
      title = `Contract — ${ex.gig_title || matched?.title || subject.slice(0, 40)}`
      message = ex.notes || 'Contract received, review required'
      break
    }
    case 'set_time_change': {
      const s = ex.set_time_change || ({} as any)
      noteBlock = `[Set time CHANGED — ${new Date().toISOString().slice(0, 10)}]\nNew time: ${s.new_time || '?'}${s.reason ? `\nReason: ${s.reason}` : ''}`
      if (s.new_time) gigColumnUpdates.set_time = s.new_time
      title = `Set time changed — ${ex.gig_title || matched?.title || subject.slice(0, 40)}`
      message = `New: ${s.new_time || '?'}${s.reason ? ` — ${s.reason}` : ''}`
      critical = true
      break
    }
    case 'cancellation': {
      noteBlock = `[CANCELLED — ${new Date().toISOString().slice(0, 10)}]\n${ex.notes || 'Gig cancelled'}`
      if (matched) gigColumnUpdates.status = 'cancelled'
      title = `Gig cancelled — ${ex.gig_title || matched?.title || subject.slice(0, 40)}`
      message = ex.notes || 'Cancellation notice received — review in Gigs'
      critical = true
      break
    }
    default:
      return { threadId, subject, extraction: ex, matchedGigId: matched?.id || null, invoiceId: null, gigBackfilled: false, skipped: 'unhandled_kind', kind: ex.kind }
  }

  // Write to matched gig. If no gig matched, still fire a bell so user can
  // triage manually — don't silently drop actionable info.
  let gigUpdated = false
  if (matched) {
    const updates: Record<string, any> = { ...gigColumnUpdates }
    updates.notes = appendToNotes(matched.notes, noteBlock)
    const { error } = await supabase.from('gigs').update(updates).eq('id', matched.id).eq('user_id', userId)
    if (!error) gigUpdated = true
  }

  await createNotification({
    user_id: userId,
    type: critical ? 'gig_cancelled' : 'system',
    title,
    message: matched ? `${matched.title || matched.venue || ''} · ${message}` : `No gig match · ${message}`,
    href: matched ? `/gigs/${matched.id}` : '/business/finances',
    gig_id: matched?.id || undefined,
    sendSms: critical,
  })

  return {
    threadId,
    subject,
    extraction: ex,
    matchedGigId: matched?.id || null,
    invoiceId: null,
    gigBackfilled: gigUpdated,
    kind: ex.kind,
    action: title,
  }
}

async function handleInvoiceAmendment(
  userId: string,
  ex: Extraction,
  matched: GigRow | null,
  subject: string,
  threadId: string,
): Promise<ProcessedThread> {
  // Find the most recent invoice to amend. Priority:
  //   1. Exact gig match (when Claude gave us a gig_date + matchGig succeeded)
  //   2. Title-token fallback — billing-card images often lack a date, so the
  //      gig matcher returns null and we'd previously drop the amendment onto
  //      nothing. Match on distinctive title/venue/city tokens against recent
  //      invoices (last 180d) so "Invoice details update for Soho house" still
  //      lands on the existing overdue Soho House invoice.
  let invoice: any = null
  if (matched?.id) {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .eq('gig_id', matched.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    invoice = data
  }
  if (!invoice) {
    const tokens = [ex.venue, ex.city, ex.gig_title, subject]
      .map(s => norm(s).split(' ').filter(t => t.length >= 4))
      .flat()
    const uniq = Array.from(new Set(tokens))
    if (uniq.length) {
      const since = new Date(Date.now() - 180 * 86400000).toISOString()
      const { data: cands } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', since)
        .in('status', ['draft', 'pending', 'overdue', 'sent'])
        .order('created_at', { ascending: false })
      let best: { inv: any; score: number } | null = null
      for (const c of (cands || [])) {
        const hay = norm(`${c.gig_title || ''} ${c.notes || ''}`)
        const hits = uniq.filter(t => hay.includes(t)).length
        if (hits >= 1 && (!best || hits > best.score)) best = { inv: c, score: hits }
      }
      if (best && best.score >= 1) invoice = best.inv
    }
  }

  const a = ex.amendment || ({} as any)
  const summary = a.summary || `${a.field || 'field'} → ${a.new_value || 'update'}`
  const block = `[Amendment requested — ${new Date().toISOString().slice(0, 10)}]\n${summary}`

  if (invoice) {
    // Write structured billing fields so the PDF template renders the new
    // entity/address on re-send. These columns were added specifically to
    // support auto-amendment — without them we'd only be appending to notes.
    const updates: Record<string, any> = {
      notes: appendToNotes(invoice.notes, block),
      status: 'draft',
    }
    if (ex.billing_entity) updates.billing_entity = ex.billing_entity
    if (ex.billing_address) updates.billing_address = ex.billing_address
    if (ex.vat_number) updates.vat_number = ex.vat_number
    if (ex.recipient_email && !invoice.sent_to_promoter_email) {
      updates.sent_to_promoter_email = ex.recipient_email
    }
    await supabase.from('invoices').update(updates).eq('id', invoice.id).eq('user_id', userId)
  }
  if (matched) {
    await supabase.from('gigs').update({
      notes: appendToNotes(matched.notes, block),
    }).eq('id', matched.id).eq('user_id', userId)
  }

  let amendHref: string = '/business/finances'
  if (invoice) {
    try { amendHref = buildApprovalPath(invoice.id) } catch { amendHref = `/business/finances?invoice=${invoice.id}` }
  }
  await createNotification({
    user_id: userId,
    type: 'invoice_request',
    title: `Invoice amendment — ${ex.gig_title || matched?.title || subject.slice(0, 40)}`,
    message: `${summary} — review & re-send`,
    href: amendHref,
    gig_id: matched?.id || undefined,
    sendSms: false,
  })

  return {
    threadId,
    subject,
    extraction: ex,
    matchedGigId: matched?.id || null,
    invoiceId: invoice?.id || null,
    gigBackfilled: false,
    kind: 'invoice_amendment',
    action: `Amendment flagged — ${summary}`,
  }
}

async function handlePaymentConfirmation(
  userId: string,
  ex: Extraction,
  matched: GigRow | null,
  subject: string,
  threadId: string,
): Promise<ProcessedThread> {
  // DETECT-ONLY. Per feedback_never_bypass_guards + feedback_approve_before_send:
  // we never auto-flip paid_at / status='paid'. We write to the dedicated
  // payment_detected_* columns and surface a notification asking Anthony to
  // confirm. Confirmation flips paid_at via the regular /api/invoices/[id] PATCH.
  let invoice: any = null
  if (matched?.id) {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .eq('gig_id', matched.id)
      .neq('status', 'paid')
      .is('payment_detected_at', null) // skip if we've already detected on this invoice
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    invoice = data
  }

  if (invoice) {
    await supabase.from('invoices').update({
      payment_detected_at: new Date().toISOString(),
      payment_detected_amount: ex.payment?.amount_paid ?? null,
      payment_detected_currency: ex.currency || invoice.currency || null,
      payment_detected_thread_id: threadId,
    }).eq('id', invoice.id).eq('user_id', userId)
  }

  await createNotification({
    user_id: userId,
    type: 'payment_received',
    title: invoice
      ? `Looks paid — ${invoice.gig_title || ex.gig_title || subject.slice(0, 40)}`
      : `Payment email — no invoice match`,
    message: invoice
      ? `${invoice.currency} ${invoice.amount} looks paid (${ex.payment?.invoice_reference || 'remittance match'}). Tap to confirm.`
      : `No invoice match found — review manually`,
    href: invoice ? `/business/finances?detected=${invoice.id}` : '/business/finances',
    gig_id: matched?.id || undefined,
    sendSms: !!invoice,
  })

  return {
    threadId,
    subject,
    extraction: ex,
    matchedGigId: matched?.id || null,
    invoiceId: invoice?.id || null,
    gigBackfilled: false,
    kind: 'payment_confirmation',
    action: invoice ? `Detected payment — ${invoice.gig_title} (awaiting confirm)` : 'Payment email, no invoice matched',
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
  // Returns accounts minus any flagged needs_reauth — those are surfaced
  // separately so the user knows to reconnect instead of scanning silently failing.
  const clients = await getGmailClients(userId).catch(() => [])
  const needsReauth = await listAccountsNeedingReauth(userId)

  const { data: processed } = await supabase
    .from('processed_invoice_gmail_ids')
    .select('message_id')
  const processedLatestIds = new Set((processed || []).map((r: any) => r.message_id))

  const results: ProcessedThread[] = []
  const errors: Array<{ account: string; query?: string; error: string }> = []
  const seenThreads = new Set<string>()
  let gapsExamined = 0

  // ── Pass 1 (primary): gig-driven targeted scan ────────────────────────────
  // For every gig with missing promoter_email + every unsent invoice, build a
  // targeted `subject:<distinctive-token>` query. Deterministic: we know what
  // we're looking for and whether we found it.
  const { data: gigsWithGaps } = await supabase
    .from('gigs')
    .select('id,title,venue,date,promoter_email,user_id')
    .eq('user_id', userId)
    .is('promoter_email', null)
  const { data: invoicesWithGaps } = await supabase
    .from('invoices')
    .select('id,gig_title,gig_date,sent_to_promoter_email,user_id,gig_id')
    .eq('user_id', userId)
    .is('sent_to_promoter_email', null)
    .in('status', ['draft', 'pending', 'overdue'])

  const gigSearchTerms = new Set<string>()
  for (const g of (gigsWithGaps || [])) {
    if (g.venue) gigSearchTerms.add(firstMeaningfulWord(g.venue))
    if (g.title) gigSearchTerms.add(firstMeaningfulWord(g.title))
  }
  for (const iv of (invoicesWithGaps || [])) {
    if (iv.gig_title) gigSearchTerms.add(firstMeaningfulWord(iv.gig_title))
  }
  gapsExamined = (gigsWithGaps?.length || 0) + (invoicesWithGaps?.length || 0)

  for (const { gmail, email } of clients) {
    for (const term of gigSearchTerms) {
      if (!term || term.length < 4) continue
      try {
        const q = `newer_than:120d subject:${term}`
        const { data: list } = await gmail.users.messages.list({ userId: 'me', maxResults: 50, q })
        const msgs: any[] = list?.messages || []
        const threadIds = Array.from(new Set(msgs.map(m => m.threadId).filter(Boolean)))

        for (const tid of threadIds) {
          if (seenThreads.has(tid as string)) continue
          seenThreads.add(tid as string)
          try {
            const r = await processThread(userId, gmail, tid as string, processedLatestIds)
            if (r) results.push(r)
          } catch (err) {
            console.error(`[invoice-requests] gig-scan thread ${tid} failed:`, err)
          }
        }
      } catch (err) {
        errors.push({ account: email, query: `gap:${term}`, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  // ── Pass 2 (secondary): keyword catch-all ──────────────────────────────────
  // Focused queries for net-new bookings Anthony hasn't yet added a gig row for.
  // Trigger-keyword queries: any thread with these words deserves a full Claude
  // read, because they signal actionable booking/logistics info. Keep each query
  // focused — Gmail drops matches on 10+ OR terms with quoted phrases.
  const queries = [
    'newer_than:90d (invoice OR settlement OR fee OR "balance due" OR remittance)',
    'newer_than:90d (contract OR advancing OR rider OR "set time" OR "stage time" OR "load in")',
    'newer_than:90d (hotel OR flight OR "check in" OR accommodation OR travel)',
    'newer_than:90d (cancel OR cancelled OR postpon OR reschedule)',
    'newer_than:90d (address OR VAT OR "billing entity" OR reissue)',
    'newer_than:90d from:(turbomgmt.co.uk OR plisskenfestival OR sohohouse OR poofdoof OR percolate)',
    'newer_than:90d subject:(advancing OR invoice OR booking OR settlement OR fee OR contract OR hotel OR "set time")',
  ]

  for (const { gmail, email } of clients) {
    for (const q of queries) {
      try {
        const { data: list } = await gmail.users.messages.list({ userId: 'me', maxResults: 200, q })
        const msgs: any[] = list?.messages || []
        const threadIds = Array.from(new Set(msgs.map(m => m.threadId).filter(Boolean)))

        for (const tid of threadIds) {
          if (seenThreads.has(tid as string)) continue
          seenThreads.add(tid as string)
          try {
            const r = await processThread(userId, gmail, tid as string, processedLatestIds)
            if (r) results.push(r)
          } catch (err) {
            console.error(`[invoice-requests] thread ${tid} failed:`, err)
          }
        }
      } catch (err) {
        errors.push({ account: email, query: q.slice(0, 60), error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  // Bucket skipped threads by reason for the scan-report UI.
  const skipped = results
    .filter(r => r.skipped)
    .map(r => ({ threadId: r.threadId, subject: r.subject, reason: r.skipped!, gigTitle: r.extraction?.gig_title || null }))

  // Count by kind — any action that ISN'T a skip counts toward its kind total.
  const actedOn = results.filter(r => !r.skipped)
  const byKind = actedOn.reduce((acc, r) => {
    const k = r.kind || 'other'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Actions taken — short human-readable list for the report.
  const actions = actedOn
    .filter(r => r.action)
    .map(r => ({ kind: r.kind || 'other', action: r.action!, gigTitle: r.extraction?.gig_title || null }))

  return {
    userId,
    accounts: clients.length,
    gapsExamined,
    threadsExamined: seenThreads.size,
    processed: results.length,
    invoicesCreated: results.filter(r => r.invoiceId && !r.skipped && r.kind === 'new_invoice').length,
    gigsBackfilled: results.filter(r => r.gigBackfilled).length,
    byKind,
    actions,
    skipped,
    errors,
    needsReauth,
    results,
  }
}

// Subject-signal override: map strong subject patterns to a ThreadKind so we
// NEVER silently drop an obviously-actionable thread just because the body is
// empty (screenshot-only email, "see attached" replies, etc.).
function detectSubjectSignal(subject: string): ThreadKind | null {
  const s = subject.toLowerCase()
  if (/invoice.*(update|change|amend|correct|detail|reissue|address|vat)/.test(s)) return 'invoice_amendment'
  if (/(update|change|amend|correct).*invoice/.test(s)) return 'invoice_amendment'
  if (/(cancelled|cancellation|postponed|rescheduled)/.test(s)) return 'cancellation'
  if (/set\s*time.*(change|update|moved|new)/.test(s)) return 'set_time_change'
  if (/(payment.*(received|confirmed|sent)|remittance)/.test(s)) return 'payment_confirmation'
  if (/^advancing[:\s]/.test(s)) return 'advancing'
  if (/hotel\s*(booked|confirmation)/.test(s)) return 'hotel'
  return null
}

// Pick the first meaningful word from a string for Gmail subject search.
// Skips common stopwords that would match too broadly.
function firstMeaningfulWord(s: string): string {
  const stop = /^(the|a|an|at|for|with|and|or|of|to|in|on|by|night|manoeuvres)$/i
  const words = s.split(/\s+/).map(w => w.replace(/[^\w]/g, '')).filter(Boolean)
  for (const w of words) {
    if (w.length >= 4 && !stop.test(w)) return w
  }
  return words[0] || ''
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

// Returns true if this user is due for a scan based on their tier cadence.
// Dashboard-triggered scans (manual "Scan inbox now") bypass this — only the
// cron path gates, so the button always works on-demand.
async function isDueForScan(userId: string): Promise<boolean> {
  const tier = await getUserTier(userId)
  const cadenceMin = SCANNER_CADENCE_MIN[tier] ?? 120
  const { data } = await supabase
    .from('artist_settings')
    .select('last_invoice_scan_at')
    .eq('user_id', userId)
    .maybeSingle()
  const last = data?.last_invoice_scan_at ? new Date(data.last_invoice_scan_at).getTime() : 0
  return (Date.now() - last) >= cadenceMin * 60 * 1000
}

async function stampScanRun(userId: string) {
  try {
    await supabase
      .from('artist_settings')
      .update({ last_invoice_scan_at: new Date().toISOString() })
      .eq('user_id', userId)
  } catch { /* non-critical */ }
}

async function runScan(auth: { userId: string | null }) {
  if (auth.userId) {
    // Dashboard path — always run, no cadence gate. User explicitly tapped.
    const r = await runScanForUser(auth.userId)
    await stampScanRun(auth.userId)
    return r
  }
  // Cron: iterate every connected tenant, gated by tier cadence.
  const { data: rows } = await supabase
    .from('connected_email_accounts')
    .select('user_id')
  const userIds = Array.from(new Set((rows || []).map(r => r.user_id).filter(Boolean))) as string[]

  const perUser: any[] = []
  const skippedByCadence: string[] = []
  for (const uid of userIds) {
    try {
      if (!(await isDueForScan(uid))) {
        skippedByCadence.push(uid)
        continue
      }
      const r = await runScanForUser(uid)
      await stampScanRun(uid)
      perUser.push(r)
    } catch (err) {
      perUser.push({ userId: uid, error: err instanceof Error ? err.message : 'failed' })
    }
  }
  return {
    ok: true,
    tenants: userIds.length,
    scanned: perUser.length,
    skippedByCadence: skippedByCadence.length,
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
