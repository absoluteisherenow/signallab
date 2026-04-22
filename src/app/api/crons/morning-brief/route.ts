import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Daily morning-brief seeder. Fires once per morning (07:00 BST / 06:00 UTC).
// Walks every tenant's live state and upserts `brain_todos` with source=auto_*
// so the /brief page reflects today's reality without the user adding anything.
//
// Dedup: `brain_todos_auto_unique` index on (user_id, source, source_ref)
// WHERE source_ref IS NOT NULL AND done_at IS NULL — so re-running doesn't
// duplicate, but a marked-done todo can be re-seeded tomorrow if the condition
// still holds (e.g. invoice still overdue).
//
// Never auto-sends anything — this is read-only synth. `feedback_approve_before_send`.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type TodoSeed = {
  user_id: string
  title: string
  context?: string | null
  source: 'auto_gig' | 'auto_invoice' | 'auto_post' | 'auto_ad' | 'auto_other'
  source_ref: string
  priority: 1 | 2 | 3
  due_date?: string | null
}

async function upsertSeeds(seeds: TodoSeed[]) {
  if (!seeds.length) return 0
  // One-at-a-time so a single conflict doesn't abort the batch.
  let n = 0
  for (const s of seeds) {
    const { error } = await supabase
      .from('brain_todos')
      .upsert(
        { ...s, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,source,source_ref', ignoreDuplicates: false },
      )
    if (!error) n++
  }
  return n
}

function addDays(d: Date, n: number) {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

function daysBetween(a: string, b: string) {
  const ms = new Date(a).getTime() - new Date(b).getTime()
  return Math.round(ms / 86_400_000)
}

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'morning-brief')
  if (unauth) return unauth

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const in7Str = addDays(today, 7).toISOString().slice(0, 10)

  const counts = { gigs: 0, invoices: 0, posts: 0, total_users: 0 }

  // ── Gigs within 7d ────────────────────────────────────────────────────────
  const { data: gigs } = await supabase
    .from('gigs')
    .select('id, user_id, venue, city, date, status')
    .gte('date', todayStr)
    .lte('date', in7Str)
    .in('status', ['confirmed', 'pending'])

  const gigSeeds: TodoSeed[] = (gigs ?? []).map((g: any) => {
    const days = daysBetween(g.date, todayStr)
    const venue = g.venue || 'Gig'
    const where = [venue, g.city].filter(Boolean).join(', ')
    return {
      user_id: g.user_id,
      title:
        days === 0
          ? `Today — ${where}`
          : days === 1
          ? `Tomorrow — ${where}`
          : `${where} in ${days}d`,
      context: `Gig ${g.date}`,
      source: 'auto_gig',
      source_ref: g.id,
      priority: days <= 1 ? 1 : 2,
      due_date: g.date,
    }
  })

  // ── Invoices: overdue OR pending with due_date within 7d ──────────────────
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, user_id, gig_title, status, due_date')
    .in('status', ['pending', 'overdue'])

  const invSeeds: TodoSeed[] = (invoices ?? [])
    .filter((i: any) => {
      if (i.status === 'overdue') return true
      if (!i.due_date) return false
      return i.due_date >= todayStr && i.due_date <= in7Str
    })
    .map((i: any) => {
      const isOverdue = i.status === 'overdue' || (i.due_date && i.due_date < todayStr)
      return {
        user_id: i.user_id,
        title: isOverdue
          ? `Chase overdue invoice — ${i.gig_title ?? 'unknown gig'}`
          : `Invoice due ${i.due_date} — ${i.gig_title ?? 'unknown gig'}`,
        context: null,
        source: 'auto_invoice' as const,
        source_ref: i.id,
        priority: (isOverdue ? 1 : 2) as 1 | 2,
        due_date: i.due_date ?? null,
      }
    })

  // ── Posts awaiting approval (scheduled today, status = pending/draft) ─────
  const startOfDay = `${todayStr}T00:00:00.000Z`
  const endOfDay = `${todayStr}T23:59:59.999Z`
  const { data: posts } = await supabase
    .from('scheduled_posts')
    .select('id, user_id, platform, caption, scheduled_at, status')
    .gte('scheduled_at', startOfDay)
    .lte('scheduled_at', endOfDay)
    .in('status', ['pending', 'draft', 'awaiting_approval'])

  const postSeeds: TodoSeed[] = (posts ?? []).map((p: any) => {
    const t = new Date(p.scheduled_at).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London',
    })
    return {
      user_id: p.user_id,
      title: `Approve ${p.platform} post — ${t}`,
      context: (p.caption ?? '').slice(0, 100) || null,
      source: 'auto_post',
      source_ref: p.id,
      priority: 2,
      due_date: todayStr,
    }
  })

  counts.gigs = await upsertSeeds(gigSeeds)
  counts.invoices = await upsertSeeds(invSeeds)
  counts.posts = await upsertSeeds(postSeeds)
  counts.total_users = new Set(
    [...gigSeeds, ...invSeeds, ...postSeeds].map((s) => s.user_id),
  ).size

  return NextResponse.json({ ran: true, date: todayStr, counts })
}
