// Central rules facade. Every feature consults this module before generating
// or sending — one source of truth, one prompt block, one post-check pipeline.
//
// The brain:
//   1. fetchActiveRules({ userId, task })     → pulls user's rule_registry rows
//   2. buildRulesPromptBlock(rules)            → assembles system-prompt section
//   3. runOutputChecks(output, rules, ctx)     → post-generation validation
//   4. runRequestChecks(request, rules, ctx)   → pre-send validation
//   5. logInvariants(userId, task, verdicts)   → writes invariant_log rows
//
// New rule = new row in rule_registry + (optional) new handler in checks/*.
// No code change needed to roll a rule out across features.

import { createClient } from '@supabase/supabase-js'
import type {
  Rule,
  TaskType,
  InvariantVerdict,
  CheckResult,
  RuleSeverity,
} from './types'
import type { OperatingContext } from '../operatingContext'
import { textCheckRegistry } from './checks/textChecks'
import { requestCheckRegistry } from './checks/requestChecks'

// Service role because invariant_log writes happen server-side for any user,
// and rule_registry reads bypass RLS in cron/system contexts. RLS still
// protects direct client reads.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { headers: { 'Accept-Encoding': 'identity' } } }
  )
}

/**
 * Fetch all active rules for this user + task.
 * Falls back to `default_rule_library` if the user has no registry rows yet
 * (e.g. first-time user before onboarding seed has run).
 */
export async function fetchActiveRules(params: {
  userId: string
  task: TaskType
}): Promise<Rule[]> {
  const sb = admin()
  const { data: userRules, error } = await sb
    .from('rule_registry')
    .select('id, user_id, slug, name, category, severity, applies_to, body, check_fn, version, source, source_ref')
    .eq('user_id', params.userId)
    .is('active_until', null)
    .contains('applies_to', [params.task])

  if (!error && userRules && userRules.length) {
    return userRules as Rule[]
  }

  // Fallback: user hasn't been seeded yet — read from shared library.
  const { data: libRules } = await sb
    .from('default_rule_library')
    .select('slug, name, category, severity, applies_to, body, check_fn, version, source_ref')
    .contains('applies_to', [params.task])

  return (libRules || []).map((r: any) => ({
    id: r.slug,
    user_id: params.userId,
    slug: r.slug,
    name: r.name,
    category: r.category,
    severity: r.severity,
    applies_to: r.applies_to,
    body: r.body,
    check_fn: r.check_fn || null,
    version: r.version || 1,
    source: 'default_library',
    source_ref: r.source_ref,
  })) as Rule[]
}

const SEVERITY_LABEL: Record<RuleSeverity, string> = {
  hard_block: 'HARD BLOCK',
  soft_flag: 'SOFT FLAG',
  advisory: 'ADVISORY',
  auto_fix: 'AUTO-FIX',
}

const SEVERITY_ORDER: RuleSeverity[] = ['hard_block', 'soft_flag', 'auto_fix', 'advisory']

/**
 * Build a deterministic system-prompt block from active rules, grouped by
 * severity so the model knows which to obey strictly vs consider.
 * Safe to cache — rules only change when the registry is updated.
 */
export function buildRulesPromptBlock(rules: Rule[]): string {
  if (!rules.length) return ''
  const grouped = new Map<RuleSeverity, Rule[]>()
  for (const r of rules) {
    const arr = grouped.get(r.severity) || []
    arr.push(r)
    grouped.set(r.severity, arr)
  }
  const sections: string[] = ['# Active rules (from central brain)']
  for (const sev of SEVERITY_ORDER) {
    const bucket = grouped.get(sev)
    if (!bucket || !bucket.length) continue
    sections.push(`\n## ${SEVERITY_LABEL[sev]}`)
    for (const r of bucket) {
      sections.push(`- **${r.name}** (${r.slug}): ${r.body}`)
    }
  }
  return sections.join('\n')
}

/**
 * Run every text-output check registered for rules that apply to this task.
 * Rules with no `check_fn` are informational (prompt-only) and skipped here.
 */
export function runOutputChecks(
  output: string,
  rules: Rule[],
  ctx: OperatingContext
): InvariantVerdict[] {
  const verdicts: InvariantVerdict[] = []
  for (const rule of rules) {
    if (!rule.check_fn) continue
    const fn = textCheckRegistry[rule.check_fn]
    if (!fn) continue
    const result = fn(output, ctx)
    verdicts.push({
      rule_slug: rule.slug,
      severity: rule.severity,
      passed: result.passed,
      detail: result.detail,
    })
  }
  return verdicts
}

/**
 * Run every request-shape check registered for rules that apply to this task.
 * Used by outbound routes (invoice send, IG post, ad launch) before side-effect.
 */
export function runRequestChecks(
  request: Record<string, unknown>,
  rules: Rule[],
  ctx: OperatingContext
): InvariantVerdict[] {
  const verdicts: InvariantVerdict[] = []
  for (const rule of rules) {
    if (!rule.check_fn) continue
    const fn = requestCheckRegistry[rule.check_fn]
    if (!fn) continue
    const result = fn(request, ctx)
    verdicts.push({
      rule_slug: rule.slug,
      severity: rule.severity,
      passed: result.passed,
      detail: result.detail,
    })
  }
  return verdicts
}

/**
 * Persist verdicts to invariant_log (fire-and-forget). Never throws — telemetry
 * must not break the primary call. output_sample is truncated to 400 chars.
 */
export async function logInvariants(params: {
  userId: string
  task: TaskType
  verdicts: InvariantVerdict[]
  outputSample?: string | null
}): Promise<void> {
  if (!params.verdicts.length) return
  try {
    const sb = admin()
    const sample = params.outputSample ? params.outputSample.slice(0, 400) : null
    const rows = params.verdicts.map((v) => ({
      user_id: params.userId,
      task: params.task,
      rule_slug: v.rule_slug,
      passed: v.passed,
      severity: v.severity,
      detail: v.detail || null,
      output_sample: sample,
    }))
    await sb.from('invariant_log').insert(rows)
  } catch {
    // Telemetry must never break the primary call.
  }
}

/** Surface any hard_block failures — caller should regenerate or abort. */
export function hardBlockFailures(verdicts: InvariantVerdict[]): InvariantVerdict[] {
  return verdicts.filter((v) => !v.passed && v.severity === 'hard_block')
}

export { textCheckRegistry, requestCheckRegistry }
export type { Rule, TaskType, InvariantVerdict, CheckResult } from './types'
