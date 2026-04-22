// Rule learning job — nightly cron reads `invariant_log` + `post_performance`
// and writes `lift_vs_baseline` + `sample_size` back onto each rule.
//
// Lift = (avg post score when THIS rule failed) - (avg post score when it did
// NOT fail), expressed as points (estimated_score is 0-100).
//
// Interpretation:
//   lift ≈ 0  → rule fires randomly vs quality — no signal, safe to keep
//   lift < -5 → captions that triggered this rule under-performed. Rule is
//               tracking a real problem. Keep it.
//   lift > +5 → captions that triggered this rule OVER-performed. The rule
//               may be suppressing good content. Flag for review.
//
// Matching strategy: invariant_log stores the first 400 chars of each
// generation in `output_sample`. post_performance stores the published
// `caption`. We join on the first 60 chars (prefix match) — captions tend to
// keep their opening even after human edits, and false matches at 60 chars
// are rare enough to not skew the averages meaningfully.
//
// Pure admin — runs server-side, writes to rule_registry. Safe to rerun.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface RuleLiftRow {
  rule_slug: string
  fail_count: number
  fail_avg_score: number
  pass_count: number
  pass_avg_score: number
  lift: number
  sample_size: number
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { headers: { 'Accept-Encoding': 'identity' } } }
  )
}

const PREFIX_LEN = 60

function normalizePrefix(text: string): string {
  return (text || '').slice(0, PREFIX_LEN).trim().toLowerCase()
}

/**
 * Compute per-rule lift for one user from the last `lookbackDays` of data.
 * Returns the rows; the writer persists them back to rule_registry.
 */
export async function computeRuleLift(
  userId: string,
  lookbackDays = 60
): Promise<RuleLiftRow[]> {
  const sb = admin()
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: invariants }, { data: perf }] = await Promise.all([
    sb
      .from('invariant_log')
      .select('rule_slug, passed, output_sample, called_at')
      .eq('user_id', userId)
      .gte('called_at', since),
    sb
      .from('post_performance')
      .select('caption, estimated_score, created_at')
      .not('estimated_score', 'is', null)
      .gte('created_at', since),
  ])

  if (!invariants?.length || !perf?.length) return []

  // Map prefix → estimated_score (first match wins — published captions are
  // usually unique in their opening).
  const scoreByPrefix = new Map<string, number>()
  for (const p of perf) {
    const pre = normalizePrefix(p.caption || '')
    if (!pre) continue
    if (!scoreByPrefix.has(pre)) scoreByPrefix.set(pre, p.estimated_score ?? 0)
  }

  // Bucket by rule_slug + passed/failed.
  const buckets = new Map<string, { fail: number[]; pass: number[] }>()
  for (const v of invariants) {
    const pre = normalizePrefix(v.output_sample || '')
    if (!pre) continue
    const score = scoreByPrefix.get(pre)
    if (score == null) continue
    const bucket = buckets.get(v.rule_slug) || { fail: [], pass: [] }
    if (v.passed) bucket.pass.push(score)
    else bucket.fail.push(score)
    buckets.set(v.rule_slug, bucket)
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const rows: RuleLiftRow[] = []
  for (const [slug, bucket] of buckets) {
    // Require minimum sample to avoid noise.
    if (bucket.fail.length + bucket.pass.length < 5) continue
    const fail = mean(bucket.fail)
    const pass = mean(bucket.pass)
    rows.push({
      rule_slug: slug,
      fail_count: bucket.fail.length,
      fail_avg_score: Math.round(fail * 10) / 10,
      pass_count: bucket.pass.length,
      pass_avg_score: Math.round(pass * 10) / 10,
      lift: Math.round((fail - pass) * 10) / 10,
      sample_size: bucket.fail.length + bucket.pass.length,
    })
  }
  return rows
}

/** Persist computed lift to rule_registry. */
export async function writeRuleLift(userId: string, rows: RuleLiftRow[]): Promise<number> {
  if (!rows.length) return 0
  const sb = admin()
  const now = new Date().toISOString()
  let updated = 0
  for (const r of rows) {
    const { error } = await sb
      .from('rule_registry')
      .update({
        lift_vs_baseline: r.lift,
        sample_size: r.sample_size,
        last_reviewed_at: now,
      })
      .eq('user_id', userId)
      .eq('slug', r.rule_slug)
      .is('active_until', null)
    if (!error) updated++
  }
  return updated
}

/** End-to-end: compute + persist. Returns the rows for logging. */
export async function runRuleLearning(userId: string, lookbackDays = 60): Promise<RuleLiftRow[]> {
  const rows = await computeRuleLift(userId, lookbackDays)
  await writeRuleLift(userId, rows)
  return rows
}
