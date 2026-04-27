import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'
import { createNotification } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Weekly money review — runs Mon 09:00 BST (08:00 UTC) via cron-job.org.
// One SMS + in-app notification summarising:
//   • looks_paid — invoices the remittance scraper flagged (status='looks_paid')
//   • overdue   — sent_to_promoter_at set, due_date < today, status not paid
//   • waiting   — sent, due in next 14d, not paid
//
// Tap notification → /invoices page (existing) where user confirms / chases.
// No state changes here — read-only summary. Approve-before-send rule preserved.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface InvoiceRow {
  id: string
  user_id: string | null
  gig_title: string | null
  amount: number | null
  currency: string | null
  status: string | null
  due_date: string | null
  sent_to_promoter_at: string | null
  paid_at: string | null
  payment_detected_at: string | null
}

function fmtMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return '?'
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : `${currency || ''} `
  return `${sym}${Math.round(amount).toLocaleString()}`
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / 86400000)
}

async function runForUser(userId: string) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, user_id, gig_title, amount, currency, status, due_date, sent_to_promoter_at, paid_at, payment_detected_at')
    .eq('user_id', userId)
    .returns<InvoiceRow[]>()

  if (!invoices || !invoices.length) return null

  // "Looks paid" = remittance scraper detected a payment but Anthony hasn't
  // confirmed yet (paid_at not set). These are the highest-priority taps.
  const looksPaid = invoices.filter(i => i.payment_detected_at && !i.paid_at && i.status !== 'paid')
  const looksPaidIds = new Set(looksPaid.map(i => i.id))
  const overdue = invoices.filter(i =>
    !looksPaidIds.has(i.id) &&
    i.status !== 'paid' &&
    i.sent_to_promoter_at &&
    i.due_date &&
    i.due_date < todayStr
  )
  const waiting = invoices.filter(i =>
    !looksPaidIds.has(i.id) &&
    i.status !== 'paid' &&
    i.sent_to_promoter_at &&
    i.due_date &&
    i.due_date >= todayStr &&
    i.due_date <= in14
  )

  if (!looksPaid.length && !overdue.length && !waiting.length) return null

  // Build a tight title + message pair. Title is the SMS-visible bit.
  const parts: string[] = []
  if (looksPaid.length) parts.push(`${looksPaid.length} looks paid`)
  if (overdue.length) parts.push(`${overdue.length} overdue`)
  if (waiting.length) parts.push(`${waiting.length} due ≤14d`)
  const title = `Money review — ${parts.join(' · ')}`

  // Detail lines for the in-app notification body. Top 3 of each bucket.
  const lines: string[] = []
  if (looksPaid.length) {
    lines.push('Looks paid (tap to confirm):')
    for (const i of looksPaid.slice(0, 3)) {
      lines.push(`• ${fmtMoney(i.amount, i.currency)} — ${i.gig_title ?? 'unknown'}`)
    }
  }
  if (overdue.length) {
    lines.push('Overdue (tap to chase):')
    for (const i of overdue.slice(0, 3)) {
      const d = daysSince(i.due_date)
      lines.push(`• ${fmtMoney(i.amount, i.currency)} — ${i.gig_title ?? 'unknown'} (${d != null ? d + 'd' : '—'})`)
    }
  }
  if (waiting.length) {
    lines.push('Waiting (≤14d):')
    for (const i of waiting.slice(0, 3)) {
      lines.push(`• ${fmtMoney(i.amount, i.currency)} — ${i.gig_title ?? 'unknown'} (due ${i.due_date})`)
    }
  }
  const message = lines.join('\n')

  await createNotification({
    user_id: userId,
    type: 'invoice_overdue', // existing critical type → auto SMS via notifications.ts
    title,
    message,
    href: '/invoices',
    metadata: {
      week_of: todayStr,
      counts: { looks_paid: looksPaid.length, overdue: overdue.length, waiting: waiting.length },
    },
    sendSms: true,
  })

  return { userId, looksPaid: looksPaid.length, overdue: overdue.length, waiting: waiting.length }
}

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'weekly-money')
  if (unauth) return unauth

  // Cron-worker fires this daily on the 05:00 UTC slot. Gate to Mondays only
  // here so the upstream worker stays simple. Override with ?force=1 for tests.
  const url = new URL(req.url)
  if (url.searchParams.get('force') !== '1') {
    const dow = new Date().getUTCDay() // 0=Sun, 1=Mon
    if (dow !== 1) return NextResponse.json({ ran: false, reason: 'not_monday', dow })
  }

  // All tenants with at least one invoice. user_id NULL legacy rows excluded.
  const { data: tenants } = await supabase
    .from('invoices')
    .select('user_id')
    .not('user_id', 'is', null)

  const userIds = Array.from(new Set((tenants || []).map((t: any) => t.user_id))).filter(Boolean) as string[]

  const results: Array<{ userId: string; looksPaid: number; overdue: number; waiting: number } | null> = []
  for (const uid of userIds) {
    try {
      results.push(await runForUser(uid))
    } catch (err: any) {
      console.error('[weekly-money]', uid, err?.message)
      results.push(null)
    }
  }

  return NextResponse.json({
    success: true,
    notified: results.filter(Boolean).length,
    skipped: results.filter(r => !r).length,
    results: results.filter(Boolean),
  })
}
