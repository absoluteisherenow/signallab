// Nightly rule-learning cron. For each user with any invariant_log activity,
// joins invariant_log ↔ post_performance on caption-prefix and writes
// lift_vs_baseline + sample_size back onto rule_registry rows.
//
// Output is observational in v1 — we surface the numbers on /admin/invariants
// so Anthony can eyeball which rules are actually tracking quality vs just
// firing on good content. No auto-demotion yet.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'
import { runRuleLearning, type RuleLiftRow } from '@/lib/brain/ruleLearning'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'rule-learning')
  if (unauth) return unauth

  // Find all distinct users who have invariant_log rows in the last 60 days.
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const { data: users, error } = await supabase
    .from('invariant_log')
    .select('user_id')
    .gte('called_at', since)
    .limit(5000)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const userIds = Array.from(new Set((users || []).map((r) => r.user_id))).filter(Boolean) as string[]
  const report: Array<{ user_id: string; updated: number; top_rules: RuleLiftRow[] }> = []

  for (const uid of userIds) {
    const rows = await runRuleLearning(uid, 60)
    const sorted = [...rows].sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift)).slice(0, 5)
    report.push({ user_id: uid, updated: rows.length, top_rules: sorted })
  }

  return NextResponse.json({ ok: true, users_processed: userIds.length, report })
}
