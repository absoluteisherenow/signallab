/**
 * Plain-English campaign health read for non-ads users.
 *
 * Translates Meta insights + rankings into a 4-tier grade with a human
 * headline and next-action. No fabricated benchmarks — thresholds reuse the
 * ones in `lib/growth/scaling-rules.ts` (sourced from paid-follower-growth-nm.md)
 * and Meta's own quality rankings (real, from Graph API).
 *
 * Per HARD RULE feedback_never_fabricate.md: every number surfaced is loaded
 * live from Graph API. No invented CPM benchmarks, no invented ROI bands.
 */

export type HealthGrade = 'strong' | 'working' | 'watch' | 'weak' | 'too_early'

export type HealthReason = {
  label: string
  value: string
  signal: 'good' | 'ok' | 'bad' | 'neutral'
  plain: string // plain-English explanation
}

export type CampaignHealth = {
  grade: HealthGrade
  score: number // 0-100
  headline: string
  reasons: HealthReason[]
  nextAction: string
}

export type HealthInput = {
  objective: string
  startTime: string
  insights: {
    spend: string
    impressions: string
    reach: string
    frequency?: string
    cpm: string
    cpc: string
    ctr: string
    actions?: { action_type: string; value: string }[]
  } | null
  dailyReach: { date: string; reach: number; spend: number; cpm: number }[]
  adRankings: Array<{
    quality_ranking?: string
    engagement_rate_ranking?: string
    conversion_rate_ranking?: string
  }>
}

const RANK_SCORE: Record<string, number> = {
  ABOVE_AVERAGE: 2,
  AVERAGE: 1,
  BELOW_AVERAGE_35: -1,
  BELOW_AVERAGE_20: -2,
  BELOW_AVERAGE_10: -3,
  UNKNOWN: 0,
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

function trend(daily: { reach: number }[]): 'rising' | 'flat' | 'falling' | 'insufficient' {
  if (daily.length < 4) return 'insufficient'
  const half = Math.floor(daily.length / 2)
  const early = daily.slice(0, half).reduce((s, d) => s + d.reach, 0) / half
  const late = daily.slice(half).reduce((s, d) => s + d.reach, 0) / (daily.length - half)
  if (early === 0) return late > 0 ? 'rising' : 'flat'
  const delta = (late - early) / early
  if (delta > 0.1) return 'rising'
  if (delta < -0.15) return 'falling'
  return 'flat'
}

export function assessCampaign(input: HealthInput): CampaignHealth {
  const { insights, objective, startTime, dailyReach, adRankings } = input
  const hrs = hoursSince(startTime)

  // Too-early gate — Meta needs ~72h to exit learning phase
  if (!insights || hrs < 72) {
    return {
      grade: 'too_early',
      score: 0,
      headline: hrs < 24
        ? 'Just launched — give it 24 hours before judging anything.'
        : `Running ${Math.round(hrs)}h. Meta's learning phase runs about 72h — wait for that to clear before reading the signals.`,
      reasons: [],
      nextAction: 'Check back after 72 hours from launch.',
    }
  }

  const reach = parseInt(insights.reach || '0')
  const impressions = parseInt(insights.impressions || '0')
  const frequency = parseFloat(insights.frequency || '0') || (reach > 0 ? impressions / reach : 0)
  const cpm = parseFloat(insights.cpm || '0')
  const ctr = parseFloat(insights.ctr || '0')
  const reachTrend = trend(dailyReach)

  const reasons: HealthReason[] = []
  let score = 50 // neutral baseline

  // ── Reach trend (is it still finding new people?) ─────────────────────
  if (reachTrend === 'rising') {
    score += 15
    reasons.push({
      label: 'Reach trend',
      value: 'Growing',
      signal: 'good',
      plain: `Still finding new people each day — ${reach.toLocaleString()} reached so far.`,
    })
  } else if (reachTrend === 'flat') {
    reasons.push({
      label: 'Reach trend',
      value: 'Flat',
      signal: 'ok',
      plain: 'Steady daily reach — not growing, not dropping.',
    })
  } else if (reachTrend === 'falling') {
    score -= 15
    reasons.push({
      label: 'Reach trend',
      value: 'Slowing',
      signal: 'bad',
      plain: 'Daily reach is dropping — audience is getting tapped out.',
    })
  } else {
    reasons.push({
      label: 'Reach trend',
      value: 'Need more days',
      signal: 'neutral',
      plain: 'Not enough days to judge direction yet.',
    })
  }

  // ── Frequency (fatigue check) ─────────────────────────────────────────
  // Thresholds from lib/growth/scaling-rules.ts (freqSwap rule)
  if (frequency > 0) {
    if (frequency < 1.2) {
      reasons.push({
        label: 'Frequency',
        value: frequency.toFixed(1) + 'x',
        signal: 'ok',
        plain: `People have seen the ad about ${frequency.toFixed(1)} times on average — still building exposure.`,
      })
    } else if (frequency <= 2.5) {
      score += 15
      reasons.push({
        label: 'Frequency',
        value: frequency.toFixed(1) + 'x',
        signal: 'good',
        plain: `Each person has seen the ad about ${frequency.toFixed(1)} times — the sweet spot (memorable, not annoying).`,
      })
    } else if (frequency <= 3.0) {
      score -= 5
      reasons.push({
        label: 'Frequency',
        value: frequency.toFixed(1) + 'x',
        signal: 'ok',
        plain: `Getting close to fatigue — people have seen it ${frequency.toFixed(1)} times.`,
      })
    } else {
      score -= 20
      reasons.push({
        label: 'Frequency',
        value: frequency.toFixed(1) + 'x',
        signal: 'bad',
        plain: `Creative fatigue — ${frequency.toFixed(1)}x average views is past the healthy band. Swap creative.`,
      })
    }
  }

  // ── CPM trend (cost moving in the right direction?) ───────────────────
  // Thresholds from scaling-rules.ts cpmAudienceRotate: >£15 saturated, >£12 warning
  if (cpm > 0) {
    if (cpm > 15) {
      score -= 15
      reasons.push({
        label: 'Cost to reach 1,000 people',
        value: `£${cpm.toFixed(2)}`,
        signal: 'bad',
        plain: `Audience saturating — £${cpm.toFixed(2)} per 1,000 views is high. Refresh the audience.`,
      })
    } else if (cpm > 12) {
      reasons.push({
        label: 'Cost to reach 1,000 people',
        value: `£${cpm.toFixed(2)}`,
        signal: 'ok',
        plain: `£${cpm.toFixed(2)} per 1,000 views — creeping up, watch for saturation.`,
      })
    } else {
      score += 10
      reasons.push({
        label: 'Cost to reach 1,000 people',
        value: `£${cpm.toFixed(2)}`,
        signal: 'good',
        plain: `£${cpm.toFixed(2)} per 1,000 views — efficient.`,
      })
    }
  }

  // ── Creative quality (Meta's own grade vs competing ads in auction) ───
  const rankSignals = adRankings
    .map(r => RANK_SCORE[r.quality_ranking ?? 'UNKNOWN'] ?? 0)
    .filter(v => v !== 0)

  if (rankSignals.length > 0) {
    const avg = rankSignals.reduce((s, v) => s + v, 0) / rankSignals.length
    if (avg >= 1.5) {
      score += 15
      reasons.push({
        label: 'Creative quality',
        value: 'Above average',
        signal: 'good',
        plain: "Meta rates this creative above average vs other ads competing for the same audience.",
      })
    } else if (avg >= 0.5) {
      score += 5
      reasons.push({
        label: 'Creative quality',
        value: 'Average',
        signal: 'ok',
        plain: 'Creative is performing at the average level vs the auction.',
      })
    } else {
      score -= 15
      reasons.push({
        label: 'Creative quality',
        value: 'Below average',
        signal: 'bad',
        plain: 'Meta rates this creative below average — swap to something fresher.',
      })
    }
  }

  // ── Objective-specific: CTR for traffic/engagement ────────────────────
  // Threshold from scaling-rules.ts ctrScaleUp: ≥2% = scale signal
  if (['OUTCOME_TRAFFIC', 'LINK_CLICKS', 'OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT'].includes(objective)) {
    if (ctr >= 2.0) {
      score += 15
      reasons.push({
        label: 'Click-through rate',
        value: ctr.toFixed(2) + '%',
        signal: 'good',
        plain: `${ctr.toFixed(2)}% of viewers tapped through — strong enough to scale budget.`,
      })
    } else if (ctr >= 1.0) {
      reasons.push({
        label: 'Click-through rate',
        value: ctr.toFixed(2) + '%',
        signal: 'ok',
        plain: `${ctr.toFixed(2)}% tap-through — OK, not scaling territory yet.`,
      })
    } else if (ctr > 0) {
      score -= 10
      reasons.push({
        label: 'Click-through rate',
        value: ctr.toFixed(2) + '%',
        signal: 'bad',
        plain: `Only ${ctr.toFixed(2)}% tap through — the creative isn't pulling people in.`,
      })
    }
  }

  // ── Grade ─────────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score))
  let grade: HealthGrade
  if (score >= 75) grade = 'strong'
  else if (score >= 55) grade = 'working'
  else if (score >= 35) grade = 'watch'
  else grade = 'weak'

  // ── Headline + next action ────────────────────────────────────────────
  const headline = buildHeadline(grade, objective, reach, reasons)
  const nextAction = buildNextAction(grade, reasons)

  return { grade, score, headline, reasons, nextAction }
}

function buildHeadline(grade: HealthGrade, objective: string, reach: number, reasons: HealthReason[]): string {
  const goodCount = reasons.filter(r => r.signal === 'good').length
  const badCount = reasons.filter(r => r.signal === 'bad').length
  const isAwareness = objective === 'OUTCOME_AWARENESS'

  if (grade === 'strong') {
    return isAwareness
      ? `Reaching ${reach.toLocaleString()} people efficiently — ${goodCount} strong signals, no red flags.`
      : `Performing well across the board — ${goodCount} strong signals.`
  }
  if (grade === 'working') {
    return isAwareness
      ? `Doing its job — ${reach.toLocaleString()} reached. A couple of things to keep an eye on.`
      : 'Working, but room to improve.'
  }
  if (grade === 'watch') {
    const bad = reasons.find(r => r.signal === 'bad')
    return bad
      ? `Needs attention — ${bad.plain}`
      : 'Mixed signals — worth reviewing before the next spend cycle.'
  }
  return badCount > 0
    ? `Underperforming — ${badCount} clear problems to fix before continuing.`
    : 'Underperforming — pause and review.'
}

function buildNextAction(grade: HealthGrade, reasons: HealthReason[]): string {
  const bad = reasons.find(r => r.signal === 'bad')
  if (bad) {
    if (bad.label === 'Frequency') return 'Swap to a new creative — the current one is being shown too often.'
    if (bad.label === 'Cost to reach 1,000 people') return 'Refresh the audience (new lookalike seed or wider targeting).'
    if (bad.label === 'Creative quality') return 'Queue up a new creative and pause the current one.'
    if (bad.label === 'Reach trend') return 'Broaden the audience or lift the budget to find new people.'
    if (bad.label === 'Click-through rate') return 'Rewrite the hook — the opening isn\'t pulling people in.'
  }
  if (grade === 'strong') return 'Let it run. Consider bumping the budget if it keeps performing.'
  if (grade === 'working') return 'Keep running. Prep a fresh creative for when frequency climbs.'
  return 'Review and decide whether to pause or rework.'
}
