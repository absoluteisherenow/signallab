// ── Scan tier limits ──────────────────────────────────────────────────────
// Per-batch: max files in a single scan session
// Monthly: total scans allowed per calendar month (+ credits stack on top)
// Cost per scan: ~£0.004 (Haiku API)
// Update these when pricing is finalised

export type PlanTier = 'creator' | 'artist' | 'pro' | 'management' | 'road'

// Inbox-scanner cadence in minutes. Cron fires every 5min at the CF layer,
// but each user's scan is gated against this floor — "worst-case latency"
// from a new email arriving to the scanner picking it up.
// Dedup via processed_invoice_gmail_ids means cadence doesn't drive cost;
// it only sets how stale a user's inbox is allowed to get.
export const SCANNER_CADENCE_MIN: Record<PlanTier, number> = {
  creator: 120,
  artist: 60,
  pro: 30,
  road: 5,
  management: 5,
}

export const SCAN_TIERS: Record<PlanTier, { batchLimit: number; monthlyLimit: number }> = {
  creator:    { batchLimit: 3,  monthlyLimit: 20  },
  artist:     { batchLimit: 10, monthlyLimit: 60  },
  pro:        { batchLimit: 25, monthlyLimit: 150 },
  road:       { batchLimit: 50, monthlyLimit: 400 },
  management: { batchLimit: 50, monthlyLimit: 400 },
}

// Credit top-up packs (stacked on top of monthly allowance, roll over)
export const CREDIT_PACKS = [
  { scans: 10,  price: '£5'  },
  { scans: 50,  price: '£20' },
  { scans: 200, price: '£60' },
]

// Default tier for unauthenticated or new users — intentionally the lowest paid tier
export const DEFAULT_TIER: PlanTier = 'creator'

// Fetch the real tier for a user from Supabase artist_settings
export async function getUserTier(userId: string): Promise<PlanTier> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await supabase
      .from('artist_settings')
      .select('tier')
      .eq('user_id', userId)
      .single()
    const tier = data?.tier as PlanTier
    return SCAN_TIERS[tier] ? tier : DEFAULT_TIER
  } catch {
    return DEFAULT_TIER
  }
}
