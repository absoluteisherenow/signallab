// ── Deep Dive tier limits ──────────────────────────────────────────────────
// Deep Dive = Opus run on the artist's OWN Instagram account. Expensive,
// high-context, low-volume. Patterns on your own account do not shift weekly,
// so we cap monthly runs aggressively. Volume lives in Artist Scan instead.
//
// Cost per run: ~£0.40-0.80 (Opus, full account history + posts)
// Always enforce server-side BEFORE the model call to avoid burning tokens.

import { PlanTier, DEFAULT_TIER, getUserTier } from './scanTiers'

export type DeepDiveTier =
  | { rollingDays: number; limit: number; monthlyLimit?: never }
  | { monthlyLimit: number; rollingDays?: never }

export const DEEP_DIVE_TIERS: Record<PlanTier, DeepDiveTier> = {
  creator:    { rollingDays: 90, limit: 1 },
  artist:     { monthlyLimit: 1 },
  pro:        { monthlyLimit: 2 },
  road:       { monthlyLimit: 8 },
  management: { monthlyLimit: 8 },  // 1 per tracked artist/month, ~8 artists
}

export interface DeepDiveCheckResult {
  allowed: boolean
  reason?: 'rolling_window' | 'monthly_limit' | 'no_tier'
  used: number
  limit: number
  windowLabel: string
  upgradeMessage?: string
}

/**
 * Check if a user can run a Deep Dive right now. Reads `deep_dive_runs` ledger.
 * Server-side only — uses service role.
 */
export async function canRunDeepDive(userId: string): Promise<DeepDiveCheckResult> {
  const tier = await getUserTier(userId)
  const limits = DEEP_DIVE_TIERS[tier] ?? DEEP_DIVE_TIERS[DEFAULT_TIER]

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Calculate window start
  const now = new Date()
  let windowStart: Date
  let limit: number
  let windowLabel: string

  if ('rollingDays' in limits && limits.rollingDays !== undefined) {
    windowStart = new Date(now.getTime() - limits.rollingDays * 24 * 60 * 60 * 1000)
    limit = limits.limit
    windowLabel = `${limits.rollingDays} days`
  } else {
    // Calendar month
    windowStart = new Date(now.getFullYear(), now.getMonth(), 1)
    limit = (limits as { monthlyLimit: number }).monthlyLimit
    windowLabel = 'this month'
  }

  const { count, error } = await supabase
    .from('deep_dive_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('ran_at', windowStart.toISOString())

  if (error) {
    // Fail open in dev, log loudly
    console.error('[deepDiveTiers] ledger query failed', error)
    return { allowed: true, used: 0, limit, windowLabel }
  }

  const used = count ?? 0
  const allowed = used < limit

  return {
    allowed,
    used,
    limit,
    windowLabel,
    reason: allowed ? undefined : ('rollingDays' in limits ? 'rolling_window' : 'monthly_limit'),
    upgradeMessage: allowed ? undefined : upgradeCopy(tier, used, limit, windowLabel),
  }
}

/**
 * Record a successful Deep Dive run. Call AFTER the model returns and we
 * have something to save — never on failure or partial response.
 */
export async function recordDeepDiveRun(userId: string, tierAtRun: PlanTier): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await supabase
    .from('deep_dive_runs')
    .insert([{ user_id: userId, tier_at_run: tierAtRun, ran_at: new Date().toISOString() }])
  if (error) console.error('[deepDiveTiers] failed to record run', error)
}

function upgradeCopy(tier: PlanTier, used: number, limit: number, windowLabel: string): string {
  if (tier === 'creator') {
    return `Creator tier includes 1 Deep Dive every 90 days. Upgrade to Artist (£59/mo) for monthly Deep Dives.`
  }
  if (tier === 'artist') {
    return `Artist tier includes 1 Deep Dive a month. Upgrade to Pro (£99/mo) for 2 Deep Dives a month.`
  }
  if (tier === 'pro') {
    return `Pro tier includes 2 Deep Dives a month. You have used ${used} of ${limit} ${windowLabel}. Talk to us about Management for higher limits.`
  }
  return `You have used ${used} of ${limit} Deep Dives ${windowLabel}.`
}
