import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Admin gate — same pattern as /api/admin/costs. Surfaces cron_runs rows so
// silent misses become visible. The cron-worker logs start/finish for every
// scheduled trigger; this endpoint summarises the last 24h + flags gaps.
function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const allow = new Set(
    (process.env.ADMIN_EMAILS || process.env.ARTIST_EMAIL || 'absoluteishere@gmail.com')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  )
  return allow.has(email.toLowerCase())
}

interface RunRow {
  id: string
  name: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  status: string
  error: string | null
}

// Expected cadence (minutes) — derived from cron-worker/wrangler.jsonc. Used
// to flag crons that haven't run recently enough. `night-before` and the
// daily-05:00 batch fire once per day — we give them a 36h grace window.
const EXPECTED_CADENCE_MIN: Record<string, number> = {
  'publish-scheduled': 5,
  'invoice-scan': 5,
  'check-comments': 30,
  'sync-performance': 24 * 60,
  'contact-gaps': 24 * 60,
  'ads-snapshot': 24 * 60,
  'invoice-backfill': 24 * 60,
  'ads-evaluate': 24 * 60,
  'ads-reminders': 24 * 60,
  'night-before': 24 * 60,
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  if (!isAdmin(gate.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { serviceClient: supabase } = gate

  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('cron_runs')
    .select('id, name, started_at, finished_at, duration_ms, status, error')
    .gte('started_at', since24h)
    .order('started_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []) as RunRow[]

  // Summary: per-name latest run + counts
  const byName: Record<string, { name: string; last: RunRow | null; success: number; error: number; running: number; avgMs: number }> = {}
  for (const r of rows) {
    const b = byName[r.name] || { name: r.name, last: null, success: 0, error: 0, running: 0, avgMs: 0 }
    if (!b.last || r.started_at > b.last.started_at) b.last = r
    if (r.status === 'success') b.success++
    else if (r.status === 'error') b.error++
    else if (r.status === 'running') b.running++
    byName[r.name] = b
  }
  // avg duration per name
  for (const name of Object.keys(byName)) {
    const durs = rows.filter(r => r.name === name && r.duration_ms != null).map(r => r.duration_ms!)
    byName[name].avgMs = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0
  }

  // Health: missing = expected cron has no run in the allowed window (2x cadence + buffer)
  const now = Date.now()
  const health = Object.entries(EXPECTED_CADENCE_MIN).map(([name, cadenceMin]) => {
    const b = byName[name]
    const graceMs = Math.max(cadenceMin * 2, cadenceMin + 30) * 60 * 1000
    const lastMs = b?.last ? new Date(b.last.started_at).getTime() : 0
    const stale = !b || !b.last || (now - lastMs) > graceMs
    return {
      name,
      cadence_min: cadenceMin,
      last_run: b?.last?.started_at || null,
      last_status: b?.last?.status || null,
      stale,
      success: b?.success || 0,
      error: b?.error || 0,
      running: b?.running || 0,
      avg_ms: b?.avgMs || 0,
    }
  }).sort((a, b) => Number(b.stale) - Number(a.stale) || a.name.localeCompare(b.name))

  return NextResponse.json({
    since: since24h,
    total_runs_24h: rows.length,
    error_runs_24h: rows.filter(r => r.status === 'error').length,
    recent: rows.slice(0, 50),
    health,
  })
}
