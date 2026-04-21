// Shared types for the central-brain rules registry. The brain is the single
// module every feature consults before generating or sending — rules live in
// Supabase (`rule_registry` per-user, seeded from `default_rule_library`).

/** Every distinct thing a user-facing feature can do that needs a rule check. */
export type TaskType =
  | 'caption.instagram'
  | 'caption.tiktok'
  | 'caption.threads'
  | 'invoice.draft'
  | 'invoice.send'
  | 'invoice.reminder'
  | 'ad.creative'
  | 'ad.launch'
  | 'release.announce'
  | 'release.rollout'
  | 'gig.content'
  | 'gig.advance'
  | 'gig.recap'
  | 'assistant.chat'
  | 'brief.weekly'
  | 'trend.scan'
  | 'gmail.scan'

export type RuleCategory =
  | 'voice'
  | 'brand'
  | 'outbound'
  | 'data'
  | 'platform'
  | 'invoice'
  | 'ads'

export type RuleSeverity =
  | 'hard_block'   // generation rerolls once; outbound call hard-errors
  | 'soft_flag'    // logs, surfaces a warning, does not block
  | 'advisory'     // prompt guidance only; never post-check blocks
  | 'auto_fix'     // runs a scrub function in-place (e.g. em-dash → comma)

export interface Rule {
  id: string
  user_id: string
  slug: string
  name: string
  category: RuleCategory
  severity: RuleSeverity
  applies_to: TaskType[]
  body: string
  check_fn: string | null
  version: number
  source?: string
  source_ref?: string
}

/** Returned by every named check function. */
export interface CheckResult {
  passed: boolean
  detail?: string
}

/** Output-text checks (post-process AI output — em-dash, cliches, etc.). */
export type OutputCheckFn = (output: string, ctx: import('../operatingContext').OperatingContext) => CheckResult

/** Request-shape checks (pre-send — from-address, media URL shape, etc.). */
export type RequestCheckFn = (
  request: Record<string, unknown>,
  ctx: import('../operatingContext').OperatingContext
) => CheckResult

/** One verdict row — written to `invariant_log`, surfaced in UI. */
export interface InvariantVerdict {
  rule_slug: string
  severity: RuleSeverity
  passed: boolean
  detail?: string
}
