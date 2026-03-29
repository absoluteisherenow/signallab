// ── Scan tier limits ──────────────────────────────────────────────────────
// Per-batch: max files in a single scan session
// Monthly: total scans allowed per calendar month (+ credits stack on top)
// Cost per scan: ~£0.004 (Haiku API)
// Update these when pricing is finalised

export type PlanTier = 'creator' | 'artist' | 'pro' | 'management'

export const SCAN_TIERS: Record<PlanTier, { batchLimit: number; monthlyLimit: number }> = {
  creator:    { batchLimit: 3,  monthlyLimit: 20  },
  artist:     { batchLimit: 10, monthlyLimit: 60  },
  pro:        { batchLimit: 25, monthlyLimit: 150 },
  management: { batchLimit: 50, monthlyLimit: 400 },
}

// Credit top-up packs (stacked on top of monthly allowance, roll over)
export const CREDIT_PACKS = [
  { scans: 10,  price: '£5'  },
  { scans: 50,  price: '£20' },
  { scans: 200, price: '£60' },
]

// TODO: replace with real tier lookup from Supabase user profile before launch
export const DEFAULT_TIER: PlanTier = 'artist'
