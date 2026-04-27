/**
 * Scaling rules engine for the NM follower growth plan.
 * Pure functions — takes snapshot data in, returns rule verdicts out.
 *
 * Source: paid-follower-growth-nm.md "Scaling Rules" section.
 * Each rule returns one of: 'safe' (within band), 'warning' (approaching threshold),
 * 'action' (rule fires — user should act).
 */

export type RuleVerdict = 'safe' | 'warning' | 'action' | 'insufficient_data'

export type RuleResult = {
  id: string
  label: string
  verdict: RuleVerdict
  current_value: number | null
  threshold: string // human-readable threshold
  recommendation: string | null
  expected_action?: {
    endpoint: string
    payload: Record<string, unknown>
    confirm_prompt: string
  }
}

export type ScalingInput = {
  // Latest snapshot metrics, aggregated across active campaigns
  ctr: number | null
  cpm: number | null
  frequency: number | null
  video_view_rate: number | null // 0-1, from video_views / impressions
  engagement_rate: number | null // 0-1
  cost_per_follower_gbp: number | null

  // Time context
  hours_since_launch: number | null
  days_since_creative_swap: number | null

  // Spend + follow attribution (used by zero_follows_after_7d rule)
  total_spend_gbp: number | null
  follows_count: number | null

  // Campaign context (for one-click actions)
  active_campaign_meta_ids: string[]
}

export function evaluateScalingRules(input: ScalingInput): RuleResult[] {
  const results: RuleResult[] = []

  // Rule 1 — CTR > 2% after 72h → suggest +20% daily budget
  results.push(ctrScaleUp(input))

  // Rule 2 — Engagement rate > 5% → suggest expand to lookalike
  results.push(engagementLookalikeExpand(input))

  // Rule 3 — Cost per follower < £0.50 → suggest aggressive scale
  results.push(cheapFollowerScale(input))

  // Rule 4 — Video view rate < 10% after 48h → kill + rotate
  results.push(vtrKillRotate(input))

  // Rule 5 — CPM > £15 → audience saturated, rotate lookalike
  results.push(cpmAudienceRotate(input))

  // Rule 6 — Frequency > 3.0 → creative fatigue, swap
  results.push(frequencyCreativeSwap(input))

  // Rule 7 — Days since creative swap > 10 → rotate creative
  results.push(creativeRotationDue(input))

  // Rule 8 — Zero follows after 7 days at meaningful spend → pause + rethink.
  // Catches the Awareness-objective failure mode that burned £11 on India bot
  // traffic before someone noticed. The objective is the wrong tool when the
  // goal is followers — flag it loud rather than silently keep running.
  results.push(zeroFollowsAfter7d(input))

  return results
}

function zeroFollowsAfter7d(i: ScalingInput): RuleResult {
  const MIN_SPEND_GBP = 5
  const HOURS_THRESHOLD = 168 // 7 days
  if (i.hours_since_launch == null || i.total_spend_gbp == null || i.follows_count == null) {
    return base('zero_follows_after_7d', '0 follows after 7d → pause', '0 follows + spend ≥ £5 + ≥ 168h running', 'insufficient_data', null, null)
  }
  if (i.hours_since_launch < HOURS_THRESHOLD) {
    return base('zero_follows_after_7d', '0 follows after 7d → pause', '0 follows + spend ≥ £5 + ≥ 168h running', 'safe', i.follows_count, `Too early (${Math.round(i.hours_since_launch)}h). Wait until 168h.`)
  }
  if (i.total_spend_gbp < MIN_SPEND_GBP) {
    return base('zero_follows_after_7d', '0 follows after 7d → pause', '0 follows + spend ≥ £5 + ≥ 168h running', 'safe', i.follows_count, `Spend (£${i.total_spend_gbp.toFixed(2)}) under £${MIN_SPEND_GBP} threshold — too little signal.`)
  }
  if (i.follows_count > 0) {
    return base('zero_follows_after_7d', '0 follows after 7d → pause', '0 follows + spend ≥ £5 + ≥ 168h running', 'safe', i.follows_count, `${i.follows_count} follows after ${Math.round(i.hours_since_launch / 24)}d — campaign is producing.`)
  }
  // 0 follows, ≥7d running, ≥£5 spent → action
  return base(
    'zero_follows_after_7d',
    '0 follows after 7d → pause',
    '0 follows + spend ≥ £5 + ≥ 168h running',
    'action',
    0,
    `Zero follows after ${Math.round(i.hours_since_launch / 24)}d at £${i.total_spend_gbp.toFixed(2)} spend. Objective is wrong tool for the goal — pause, switch to OUTCOME_ENGAGEMENT (POST_ENGAGEMENT optimisation), tighten geo to NM Tier-1 markets.`,
  )
}

/**
 * Computes the stacked scale multiplier when ctr_scale_up fires. Exported so
 * buildActionPayload in the evaluator cron can attach it to the verdict's
 * action_payload without re-deriving the logic.
 *
 * Tiers (Lever #3 "tighten the scale ladder"):
 *   • CTR≥2% + CPM<£10 + freq<2        → 1.5× (three-signal stack)
 *   • Plain CTR≥2%                     → 1.2× (original rule)
 * cheap_follower_scale uses its own 2.0× multiplier (see cheapFollowerScaleMultiplier).
 */
export function ctrScaleMultiplier(i: ScalingInput): number {
  if (i.ctr == null || i.ctr < 2.0) return 1
  const cpmHealthy = i.cpm != null && i.cpm < 10
  const freqHealthy = i.frequency != null && i.frequency < 2
  if (cpmHealthy && freqHealthy) return 1.5
  return 1.2
}

export function cheapFollowerScaleMultiplier(i: ScalingInput): number {
  return i.cost_per_follower_gbp != null && i.cost_per_follower_gbp < 0.5 ? 2.0 : 1
}

function ctrScaleUp(i: ScalingInput): RuleResult {
  if (i.ctr == null || i.hours_since_launch == null) {
    return base('ctr_scale_up', 'CTR > 2% after 72h → scale budget', 'CTR ≥ 2.0% after 72h', 'insufficient_data', null, null)
  }
  if (i.hours_since_launch < 72) {
    return base('ctr_scale_up', 'CTR > 2% after 72h → scale budget', 'CTR ≥ 2.0% after 72h', 'safe', i.ctr, `Too early (running ${Math.round(i.hours_since_launch)}h). Wait until 72h.`)
  }
  if (i.ctr >= 2.0) {
    const m = ctrScaleMultiplier(i)
    const pct = Math.round((m - 1) * 100)
    const rec =
      m >= 1.5
        ? `CTR strong AND CPM<£10 AND frequency<2 — stack signals, scale budget +${pct}%.`
        : `CTR strong — increase daily budget by +${pct}%.`
    return base('ctr_scale_up', 'CTR > 2% after 72h → scale budget', 'CTR ≥ 2.0% after 72h', 'action', i.ctr, rec)
  }
  if (i.ctr >= 1.5) {
    return base('ctr_scale_up', 'CTR > 2% after 72h → scale budget', 'CTR ≥ 2.0% after 72h', 'warning', i.ctr, 'Close to scale-up threshold. Hold.')
  }
  return base('ctr_scale_up', 'CTR > 2% after 72h → scale budget', 'CTR ≥ 2.0% after 72h', 'safe', i.ctr, null)
}

function engagementLookalikeExpand(i: ScalingInput): RuleResult {
  if (i.engagement_rate == null) {
    return base('engagement_lookalike', 'Engagement > 5% → expand to lookalike', 'engagement ≥ 5%', 'insufficient_data', null, null)
  }
  if (i.engagement_rate >= 0.05) {
    return base('engagement_lookalike', 'Engagement > 5% → expand to lookalike', 'engagement ≥ 5%', 'action', i.engagement_rate * 100, 'Engagement is strong — create a 1% lookalike seeded on engagers and duplicate the adset.')
  }
  return base('engagement_lookalike', 'Engagement > 5% → expand to lookalike', 'engagement ≥ 5%', 'safe', i.engagement_rate * 100, null)
}

function cheapFollowerScale(i: ScalingInput): RuleResult {
  if (i.cost_per_follower_gbp == null) {
    return base('cheap_follower_scale', 'Cost/follower < £0.50 → scale aggressively', 'cost/follower < £0.50', 'insufficient_data', null, 'Need UTM tracking or follower_delta to measure.')
  }
  if (i.cost_per_follower_gbp < 0.50) {
    return base('cheap_follower_scale', 'Cost/follower < £0.50 → scale 2×', 'cost/follower < £0.50', 'action', i.cost_per_follower_gbp, 'Unit economics are strong — double daily budget (2×).')
  }
  if (i.cost_per_follower_gbp < 0.75) {
    return base('cheap_follower_scale', 'Cost/follower < £0.50 → scale aggressively', 'cost/follower < £0.50', 'warning', i.cost_per_follower_gbp, 'Close to scale threshold. Hold 48h then re-evaluate.')
  }
  return base('cheap_follower_scale', 'Cost/follower < £0.50 → scale aggressively', 'cost/follower < £0.50', 'safe', i.cost_per_follower_gbp, null)
}

function vtrKillRotate(i: ScalingInput): RuleResult {
  if (i.video_view_rate == null || i.hours_since_launch == null) {
    return base('vtr_kill', 'VTR < 10% after 48h → kill + rotate', 'VTR ≥ 10% after 48h', 'insufficient_data', null, null)
  }
  if (i.hours_since_launch < 48) {
    return base('vtr_kill', 'VTR < 10% after 48h → kill + rotate', 'VTR ≥ 10% after 48h', 'safe', i.video_view_rate * 100, null)
  }
  if (i.video_view_rate < 0.10) {
    return base('vtr_kill', 'VTR < 10% after 48h → kill + rotate', 'VTR ≥ 10% after 48h', 'action', i.video_view_rate * 100, 'View-through rate is below threshold — pause this creative and rotate to next queued.')
  }
  if (i.video_view_rate < 0.15) {
    return base('vtr_kill', 'VTR < 10% after 48h → kill + rotate', 'VTR ≥ 10% after 48h', 'warning', i.video_view_rate * 100, 'Below healthy band — watch for decay.')
  }
  return base('vtr_kill', 'VTR < 10% after 48h → kill + rotate', 'VTR ≥ 10% after 48h', 'safe', i.video_view_rate * 100, null)
}

function cpmAudienceRotate(i: ScalingInput): RuleResult {
  if (i.cpm == null) {
    return base('cpm_audience_rotate', 'CPM > £15 → rotate lookalike seed', 'CPM ≤ £15', 'insufficient_data', null, null)
  }
  if (i.cpm > 15) {
    return base('cpm_audience_rotate', 'CPM > £15 → rotate lookalike seed', 'CPM ≤ £15', 'action', i.cpm, 'Audience is saturated — refresh the lookalike seed with newer engagers.')
  }
  if (i.cpm > 12) {
    return base('cpm_audience_rotate', 'CPM > £15 → rotate lookalike seed', 'CPM ≤ £15', 'warning', i.cpm, 'CPM creeping up — saturation starting.')
  }
  return base('cpm_audience_rotate', 'CPM > £15 → rotate lookalike seed', 'CPM ≤ £15', 'safe', i.cpm, null)
}

function frequencyCreativeSwap(i: ScalingInput): RuleResult {
  if (i.frequency == null) {
    return base('freq_swap', 'Frequency > 3.0 → swap creative', 'frequency ≤ 3.0', 'insufficient_data', null, null)
  }
  if (i.frequency > 3.0) {
    return base('freq_swap', 'Frequency > 3.0 → swap creative', 'frequency ≤ 3.0', 'action', i.frequency, 'Creative fatigue — swap to the next queued creative immediately.')
  }
  if (i.frequency > 2.5) {
    return base('freq_swap', 'Frequency > 3.0 → swap creative', 'frequency ≤ 3.0', 'warning', i.frequency, 'Approaching fatigue threshold — prep next creative.')
  }
  return base('freq_swap', 'Frequency > 3.0 → swap creative', 'frequency ≤ 3.0', 'safe', i.frequency, null)
}

function creativeRotationDue(i: ScalingInput): RuleResult {
  if (i.days_since_creative_swap == null) {
    return base('rotation_due', 'Rotate creative every 7-10 days', 'days since swap ≤ 10', 'insufficient_data', null, null)
  }
  if (i.days_since_creative_swap > 10) {
    return base('rotation_due', 'Rotate creative every 7-10 days', 'days since swap ≤ 10', 'action', i.days_since_creative_swap, `${Math.floor(i.days_since_creative_swap)} days since swap — rotate now.`)
  }
  if (i.days_since_creative_swap > 7) {
    return base('rotation_due', 'Rotate creative every 7-10 days', 'days since swap ≤ 10', 'warning', i.days_since_creative_swap, `${Math.floor(i.days_since_creative_swap)} days — prep next creative.`)
  }
  return base('rotation_due', 'Rotate creative every 7-10 days', 'days since swap ≤ 10', 'safe', i.days_since_creative_swap, null)
}

function base(
  id: string,
  label: string,
  threshold: string,
  verdict: RuleVerdict,
  value: number | null,
  recommendation: string | null
): RuleResult {
  return { id, label, threshold, verdict, current_value: value, recommendation }
}
