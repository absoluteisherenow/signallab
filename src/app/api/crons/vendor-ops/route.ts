import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'
import { getGmailClients } from '@/lib/gmail-accounts'
import {
  sendDatalessWebPush,
  type WebPushSubscription,
  type VapidKeys,
} from '@/lib/vapid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Vendor ops scanner — fires twice daily (07:00 + 17:00 UTC = 08:00 + 18:00
// BST, registered in cron-job.org) and surfaces action-required mail from a
// known list of operator/artist vendors into:
//   - vendor_ops_alerts        (audit row, primary dedup via unique constraint)
//   - notifications            (in-app bell, P0/P1 only)
//   - pending_push_messages    (web push payload, P0/P1 only)
//   - brain_todos              (auto_other — shows on /brief + /nm-morning)
//
// Dedup: unique (user_id, gmail_thread_id) on vendor_ops_alerts. Insert with
// ignoreDuplicates so re-running on the same thread is a no-op. We do NOT
// rely on Gmail labels — DB unique constraint is the source of truth.
//
// Isolation: each user wrapped in try/catch so one bad inbox can't kill the
// run. Per-thread errors are caught and the thread is skipped.
//
// Lookback: 14h. Matches a 12h cron with 2h overlap so a single missed run
// (e.g. cron-job.org outage) doesn't drop alerts. Idempotency makes overlap
// safe.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { headers: { 'Accept-Encoding': 'identity' } } },
)

type Severity = 'P0' | 'P1' | 'P2' | null

type VendorRule = {
  name: string
  domains: string[]
  skip: RegExp[]
  p0: RegExp[]
  p1: RegExp[]
  p2: RegExp[]
}

// Severity ladder: P0 > P1 > P2. First-match wins inside a tier. The `skip`
// list runs first so changelog/digest mail can't be misclassified.
const VENDORS: VendorRule[] = [
  {
    name: 'Sentry',
    domains: ['sentry.io', 'getsentry.com'],
    skip: [/changelog/i, /what.?s new/i, /tips/i, /digest/i],
    p0: [/new (alert|issue) detected/i, /spike/i, /surge/i, /critical/i],
    p1: [/quota/i, /usage.*limit/i, /transaction.*budget/i, /regression/i],
    p2: [/weekly/i, /report/i],
  },
  {
    name: 'Supabase',
    domains: ['supabase.io', 'supabase.com', 'supabase.help'],
    skip: [/newsletter/i, /announcing/i, /changelog/i, /what.?s new/i],
    p0: [/down/i, /outage/i, /incident/i, /unavailable/i, /payment.*fail/i, /security/i, /unauthorized/i, /paused/i],
    p1: [/disk io/i, /\bbudget\b/i, /quota/i, /approaching/i, /upgrade.*plan/i, /storage.*limit/i, /depleting/i, /high.*consumption/i],
    p2: [/scheduled/i, /maintenance/i, /upgrade.*available/i],
  },
  {
    name: 'Cloudflare',
    domains: ['cloudflare.com', 'cloudflareregistrar.com', 'mailchannels.net'],
    skip: [/blog/i, /webinar/i, /changelog/i, /developer week/i],
    p0: [/incident/i, /security alert/i, /payment.*fail/i, /declined/i, /unauthorized/i, /token.*compromis/i],
    p1: [/quota/i, /usage.*limit/i, /rate limit/i, /worker.*error/i, /\bbudget\b/i],
    p2: [/expir/i, /renew/i, /transfer/i, /scheduled/i],
  },
  {
    name: 'Resend',
    domains: ['resend.com', 'resend.dev'],
    skip: [/welcome/i, /tips/i, /newsletter/i],
    p0: [/bounce/i, /spam.*report/i, /complaint/i, /domain.*suspended/i, /sending.*disabled/i, /payment.*fail/i, /declined/i],
    p1: [/deliverability/i, /reputation/i, /quota/i, /rate limit/i],
    p2: [/dmarc/i, /\bspf\b/i, /\bdkim\b/i],
  },
  {
    name: 'Stripe',
    domains: ['stripe.com'],
    skip: [/newsletter/i, /announcement/i, /\batlas\b/i, /sessions/i],
    p0: [/payment.*fail/i, /declined/i, /chargeback/i, /dispute/i, /unauthorized/i, /suspicious/i],
    p1: [/payout.*delay/i, /verification.*required/i, /capability.*disabled/i, /requirement/i, /risk review/i],
    p2: [/payout/i, /receipt/i, /account.*update/i],
  },
  {
    name: 'GitHub',
    domains: ['github.com', 'noreply.github.com'],
    skip: [/digest/i, /newsletter/i, /trending/i],
    p0: [/security alert/i, /vulnerability/i, /dependabot.*critical/i, /secret.*detected/i, /unauthorized.*sign.in/i, /password.*changed/i, /two.factor/i, /payment.*fail/i],
    p1: [/billing/i, /quota/i, /spending limit/i, /actions.*minutes/i, /workflow.*fail/i],
    p2: [/dependabot/i, /pull request/i, /release/i],
  },
  {
    name: 'Apple Developer',
    domains: ['email.apple.com', 'developer.apple.com', 'apple.com'],
    skip: [/news/i, /wwdc/i, /announcement/i, /labs/i],
    p0: [/account.*suspended/i, /agreement.*required/i, /certificate.*expir/i, /provisioning.*expir/i],
    p1: [/expir/i, /renew/i, /tax.*form/i, /banking/i, /payment.*pending/i, /update.*required/i],
    p2: [/membership/i, /enroll/i],
  },
  {
    name: 'Meta Business',
    domains: ['facebook.com', 'facebookmail.com', 'business.facebook.com', 'instagram.com'],
    skip: [/inspiration/i, /tips/i, /case stud/i, /weekly/i, /newsletter/i, /trending/i],
    p0: [/payment.*fail/i, /declined/i, /policy.*violation/i, /account.*restrict/i, /disabled/i, /unauthorized/i, /security/i],
    p1: [/spend.*limit/i, /budget.*reach/i, /ad.*reject/i, /review.*required/i, /credential/i, /token.*expir/i],
    p2: [/pixel/i, /domain.*verif/i],
  },
  {
    name: 'Spotify',
    domains: ['spotify.com', 'spotifyforartists.com'],
    skip: [/wrapped/i, /digest/i, /weekly/i, /editorial/i],
    p0: [/account.*compromise/i, /unauthorized/i, /payment.*fail/i, /takedown/i],
    p1: [/upload.*fail/i, /content id/i, /royalt/i],
    p2: [/release/i, /pre.save/i],
  },
  {
    name: 'Resident Advisor',
    domains: ['ra.co', 'residentadvisor.net'],
    skip: [/digest/i, /weekly/i, /this week/i, /editorial/i],
    p0: [/payment.*fail/i, /listing.*reject/i, /account.*suspend/i],
    p1: [/event.*expir/i, /update.*required/i, /verification/i],
    p2: [/listing/i, /event.*publish/i],
  },
  {
    name: 'Discogs',
    domains: ['discogs.com'],
    skip: [/digest/i, /newsletter/i, /weekly/i],
    p0: [/payment.*fail/i, /account.*suspend/i],
    p1: [/listing.*reject/i, /update.*required/i],
    p2: [/order/i, /\bsale\b/i],
  },
  {
    name: 'Plausible',
    domains: ['plausible.io'],
    skip: [/newsletter/i, /digest/i],
    p0: [/payment.*fail/i, /declined/i],
    p1: [/quota/i, /pageviews.*limit/i, /usage.*limit/i],
    p2: [/invoice/i, /receipt/i],
  },
  {
    name: 'OpenAI',
    domains: ['openai.com'],
    skip: [/newsletter/i, /announcement/i, /research/i],
    p0: [/payment.*fail/i, /declined/i, /security/i, /unauthorized/i],
    p1: [/credit.*low/i, /usage.*limit/i, /quota/i, /balance/i, /threshold/i, /rate limit/i],
    p2: [/invoice/i, /receipt/i],
  },
  {
    name: 'Anthropic',
    domains: ['anthropic.com'],
    skip: [/newsletter/i, /announcement/i, /research/i, /tips/i],
    p0: [/payment.*fail/i, /declined/i, /security/i, /unauthorized/i],
    p1: [/credit.*low/i, /usage.*limit/i, /quota/i, /balance/i, /threshold/i, /rate limit/i],
    p2: [/invoice/i, /receipt/i],
  },
  {
    name: 'Domain Registrar',
    domains: ['namecheap.com', 'gandi.net', 'godaddy.com', 'porkbun.com'],
    skip: [/newsletter/i, /promo/i, /\bsale\b/i],
    p0: [/expir.*today/i, /domain.*suspend/i, /payment.*fail/i, /transfer.*fail/i],
    p1: [/expir.*\d+\s*day/i, /renew.*required/i, /verification.*required/i, /will expire/i],
    p2: [/renew/i, /expir/i, /transfer/i],
  },
  {
    name: 'Google Workspace',
    domains: ['google.com', 'accounts.google.com'],
    skip: [/digest/i, /tips/i, /security checkup completed/i],
    p0: [/security alert/i, /unauthorized.*sign.in/i, /suspicious.*activity/i, /password.*reset/i, /2.step.verif/i, /account.*compromise/i, /critical.*alert/i],
    p1: [/storage.*full/i, /quota/i, /update.*required/i, /less secure/i],
    p2: [/back.?up/i, /sync/i],
  },
]

function pickSeverity(rule: VendorRule, hay: string): Severity {
  if (rule.skip.some(r => r.test(hay))) return null
  if (rule.p0.some(r => r.test(hay))) return 'P0'
  if (rule.p1.some(r => r.test(hay))) return 'P1'
  if (rule.p2.some(r => r.test(hay))) return 'P2'
  return null
}

function senderDomain(from: string): string {
  // From header is "Display Name <user@domain.com>" — extract domain.
  const m = from.match(/<([^>]+)>/)
  const addr = (m ? m[1] : from).trim().toLowerCase()
  const at = addr.lastIndexOf('@')
  return at >= 0 ? addr.slice(at + 1) : ''
}

function pickVendor(domain: string): VendorRule | null {
  if (!domain) return null
  for (const v of VENDORS) {
    if (v.domains.some(d => domain === d || domain.endsWith('.' + d))) return v
  }
  return null
}

function extractLink(snippet: string): string | null {
  const m = snippet.match(/https?:\/\/[^\s<>"]+/)
  return m ? m[0] : null
}

function buildGmailQuery(): string {
  const allDomains = Array.from(new Set(VENDORS.flatMap(v => v.domains)))
  // newer_than:14h covers the lookback. -in:trash -in:spam keeps junk out.
  return `from:(${allDomains.join(' OR ')}) newer_than:14h -in:trash -in:spam`
}

interface Header { name: string; value: string }
interface MessagePayload { headers?: Header[] }
interface FullMessage {
  id?: string
  threadId?: string
  snippet?: string
  payload?: MessagePayload
}

function header(msg: FullMessage, name: string): string {
  const h = msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

async function distinctUserIdsWithGmail(): Promise<string[]> {
  const ids = new Set<string>()
  const { data: a } = await supabase
    .from('connected_email_accounts')
    .select('user_id')
    .or('needs_reauth.is.null,needs_reauth.eq.false')
  for (const r of a || []) if (r.user_id) ids.add(r.user_id)

  // Legacy single-account path — artist_settings.gmail_refresh_token IS NOT NULL
  const { data: b } = await supabase
    .from('artist_settings')
    .select('user_id')
    .not('gmail_refresh_token', 'is', null)
  for (const r of b || []) if (r.user_id) ids.add(r.user_id)
  return Array.from(ids)
}

async function sendPushToUser(userId: string, title: string, body: string, href: string) {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return // VAPID not configured — skip silently
  const keys: VapidKeys = { publicKey: pub, privateKey: priv, subject }

  await supabase.from('pending_push_messages').insert({
    user_id: userId, title, body, href,
  }).then(() => null, () => null)

  const { data: devices } = await supabase
    .from('user_devices')
    .select('id, token, web_push_keys')
    .eq('user_id', userId)
    .eq('platform', 'web')
  if (!devices?.length) return

  await Promise.all(devices.map(async (d: any) => {
    const sub: WebPushSubscription = { endpoint: d.token, keys: d.web_push_keys || undefined }
    try {
      const res = await sendDatalessWebPush(sub, keys)
      if (res.status === 410 || res.status === 404) {
        await supabase.from('user_devices').delete().eq('id', d.id)
      }
    } catch { /* swallow per-device — others may succeed */ }
  }))
}

interface ScanCounts { scanned: number; alerts_p0: number; alerts_p1: number; alerts_p2: number; skipped: number; new: number; errors: number }

async function scanUser(userId: string, dryRun: boolean): Promise<ScanCounts> {
  const counts: ScanCounts = { scanned: 0, alerts_p0: 0, alerts_p1: 0, alerts_p2: 0, skipped: 0, new: 0, errors: 0 }
  let clients
  try {
    clients = await getGmailClients(userId)
  } catch {
    return counts // no Gmail connected — skip silently
  }

  const q = buildGmailQuery()

  for (const { gmail, email: accEmail } of clients) {
    let listed
    try {
      listed = await gmail.users.messages.list({ userId: 'me', q, maxResults: 50 })
    } catch (err) {
      console.error(`[vendor-ops] list failed for ${accEmail}: ${err instanceof Error ? err.message : 'unknown'}`)
      counts.errors++
      continue
    }
    const messages: Array<{ id: string; threadId: string }> = listed.data?.messages || []

    for (const m of messages) {
      counts.scanned++
      try {
        const detail = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' })
        const msg: FullMessage = detail.data || {}
        const from = header(msg, 'From')
        const subject = header(msg, 'Subject')
        const snippet = msg.snippet || ''
        const domain = senderDomain(from)
        const vendor = pickVendor(domain)
        if (!vendor) { counts.skipped++; continue }
        const sev = pickSeverity(vendor, `${subject} ${snippet}`)
        if (!sev) { counts.skipped++; continue }

        const threadId = msg.threadId || m.threadId
        const link = extractLink(snippet)
        const summary = subject.slice(0, 200)

        if (dryRun) {
          console.log(`[vendor-ops dry] ${sev} ${vendor.name} ${threadId}: ${subject}`)
          if (sev === 'P0') counts.alerts_p0++
          if (sev === 'P1') counts.alerts_p1++
          if (sev === 'P2') counts.alerts_p2++
          continue
        }

        // Insert audit row. Unique (user_id, thread_id) — dupe = no-op.
        const { data: inserted, error: insErr } = await supabase
          .from('vendor_ops_alerts')
          .upsert({
            user_id: userId,
            vendor: vendor.name,
            severity: sev,
            subject,
            summary,
            sender: from.slice(0, 200),
            gmail_thread_id: threadId,
            gmail_message_id: msg.id,
            link,
          }, { onConflict: 'user_id,gmail_thread_id', ignoreDuplicates: true })
          .select('id')

        // Empty array = conflict (already alerted on this thread). Skip downstream.
        if (insErr || !inserted || inserted.length === 0) {
          counts.skipped++
          continue
        }
        counts.new++
        if (sev === 'P0') counts.alerts_p0++
        if (sev === 'P1') counts.alerts_p1++
        if (sev === 'P2') counts.alerts_p2++

        // brain_todos — surfaces in /brief + /nm-morning. Priority maps to severity.
        const priority: 1 | 2 | 3 = sev === 'P0' ? 1 : sev === 'P1' ? 2 : 3
        await supabase.from('brain_todos').upsert({
          user_id: userId,
          title: `[${sev}] ${vendor.name}: ${summary}`,
          context: link || null,
          source: 'auto_other',
          source_ref: `vendor_ops:${threadId}`,
          priority,
          due_date: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,source,source_ref', ignoreDuplicates: false })

        // P0/P1 only: bell badge + web push.
        if (sev === 'P0' || sev === 'P1') {
          const href = link || '/brief'
          await supabase.from('notifications').insert({
            user_id: userId,
            type: 'vendor_ops',
            title: `[${sev}] ${vendor.name}`,
            message: summary,
            href,
            metadata: { vendor: vendor.name, severity: sev, thread_id: threadId },
            read: false,
          }).then(() => null, () => null)

          await sendPushToUser(userId, `[${sev}] ${vendor.name}`, summary, href)
        }
      } catch (err) {
        counts.errors++
        console.error(`[vendor-ops] thread ${m.id} failed:`, err instanceof Error ? err.message : 'unknown')
      }
    }
  }
  return counts
}

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'vendor-ops')
  if (unauth) return unauth

  const { searchParams } = new URL(req.url)
  const dryRun = searchParams.get('dry_run') === '1'

  const userIds = await distinctUserIdsWithGmail()
  const perUser: Record<string, ScanCounts> = {}
  for (const uid of userIds) {
    try {
      perUser[uid] = await scanUser(uid, dryRun)
    } catch (err) {
      perUser[uid] = { scanned: 0, alerts_p0: 0, alerts_p1: 0, alerts_p2: 0, skipped: 0, new: 0, errors: 1 }
      console.error(`[vendor-ops] user ${uid} failed:`, err instanceof Error ? err.message : 'unknown')
    }
  }

  const totals = Object.values(perUser).reduce<ScanCounts>((acc, c) => ({
    scanned: acc.scanned + c.scanned,
    alerts_p0: acc.alerts_p0 + c.alerts_p0,
    alerts_p1: acc.alerts_p1 + c.alerts_p1,
    alerts_p2: acc.alerts_p2 + c.alerts_p2,
    skipped: acc.skipped + c.skipped,
    new: acc.new + c.new,
    errors: acc.errors + c.errors,
  }), { scanned: 0, alerts_p0: 0, alerts_p1: 0, alerts_p2: 0, skipped: 0, new: 0, errors: 0 })

  return NextResponse.json({
    ran: true,
    dry_run: dryRun,
    users: userIds.length,
    totals,
    per_user: perUser,
  })
}
