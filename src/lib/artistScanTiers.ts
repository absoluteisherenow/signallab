// ── Artist Scan tier limits ─────────────────────────────────────────────────
// Artist Scan = Sonnet run on a COMPETITOR / peer Instagram account. Cheaper
// than Deep Dive, useful at higher volume because each scanned artist returns
// genuinely new data. This is the volume lever.
//
// Cost per scan: ~£0.05-0.12 (Sonnet, recent posts + insights)
// Always enforce server-side BEFORE the model call.

import { PlanTier, DEFAULT_TIER, getUserTier } from './scanTiers'

export const ARTIST_SCAN_TIERS: Record<PlanTier, { monthlyLimit: number }> = {
  creator:    { monthlyLimit: 5   },
  artist:     { monthlyLimit: 15  },
  pro:        { monthlyLimit: 40  },
  management: { monthlyLimit: 100 },
}

export interface ArtistScanCheckResult {
  allowed: boolean
  used: number
  limit: number
  upgradeMessage?: string
}

export async function canRunArtistScan(userId: string): Promise<ArtistScanCheckResult> {
  const tier   = await getUserTier(userId)
  const limit  = (ARTIST_SCAN_TIERS[tier] ?? ARTIST_SCAN_TIERS[DEFAULT_TIER]).monthlyLimit

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now         = new Date()
  const windowStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const { count, error } = await supabase
    .from('artist_scan_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('ran_at', windowStart.toISOString())

  if (error) {
    console.error('[artistScanTiers] ledger query failed', error)
    return { allowed: true, used: 0, limit }
  }

  const used    = count ?? 0
  const allowed = used < limit

  return {
    allowed,
    used,
    limit,
    upgradeMessage: allowed ? undefined : upgradeCopy(tier, used, limit),
  }
}

export async function recordArtistScanRun(
  userId: string,
  targetHandle: string,
  tierAtRun: PlanTier
): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await supabase
    .from('artist_scan_runs')
    .insert([{
      user_id: userId,
      target_handle: targetHandle,
      tier_at_run: tierAtRun,
      ran_at: new Date().toISOString(),
    }])
  if (error) console.error('[artistScanTiers] failed to record run', error)
}

function upgradeCopy(tier: PlanTier, used: number, limit: number): string {
  if (tier === 'creator') {
    return `Creator tier includes 5 Artist Scans a month. You have used ${used} of ${limit}. Upgrade to Artist (£59/mo) for 15 a month.`
  }
  if (tier === 'artist') {
    return `Artist tier includes 15 Artist Scans a month. You have used ${used} of ${limit}. Upgrade to Pro (£99/mo) for 40 a month.`
  }
  if (tier === 'pro') {
    return `Pro tier includes 40 Artist Scans a month. You have used ${used} of ${limit}. Talk to us about Management for higher limits.`
  }
  return `You have used ${used} of ${limit} Artist Scans this month.`
}
