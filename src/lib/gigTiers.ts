import { createClient } from '@supabase/supabase-js'
import { getUserTier } from '@/lib/tier'
import type { Tier } from '@/lib/stripe'

// ── Gig tier caps ───────────────────────────────────────────────────────────
// Headline value lever for the pricing page. Cost-per-gig at cap is the anchor
// (Creator £29 → 1 lifetime ≈ try-it; Artist £59 / 2 mo = £29.50/gig; Pro
// £99 / 5 mo = £19.80/gig; Road £199 / unlimited = effectively £0/gig past 11).
//
// Creator is intentionally *lifetime* not monthly — it's a try-it tier so a
// new artist can run one real gig through Tour Lab before deciding. Every
// other tier resets monthly on the 1st (calendar-month, matches scan tiers).

export interface GigCap {
  /** lifetime cap — counted across all gigs ever created on this account */
  lifetime?: number
  /** monthly cap — counted from gig.created_at within the current calendar month */
  monthly?: number
}

export const GIG_CAPS: Record<Exclude<Tier, 'free' | 'management'>, GigCap> = {
  creator: { lifetime: 1 },
  artist:  { monthly: 2 },
  pro:     { monthly: 5 },
  road:    { monthly: Number.POSITIVE_INFINITY },
}

// 'free' = read-only / pre-checkout state. No gig creation allowed.
// 'management' = bespoke contract; treat as unlimited like road.
export function capForTier(tier: Tier): GigCap | null {
  if (tier === 'free') return { monthly: 0 }
  if (tier === 'management') return { monthly: Number.POSITIVE_INFINITY }
  return GIG_CAPS[tier as Exclude<Tier, 'free' | 'management'>] || { monthly: 0 }
}

export interface GigGate {
  allowed: boolean
  tier: Tier
  cap: GigCap
  used: number
  /** human label for the cap, e.g. "1 gig (lifetime)" or "2 gigs / month" */
  capLabel: string
  /** suggested upgrade target if blocked */
  upgradeTo?: Exclude<Tier, 'free'>
  upgradeMessage?: string
}

const FALLBACK_TIER_ORDER: Exclude<Tier, 'free'>[] = ['creator', 'artist', 'pro', 'road', 'management']

function nextTier(current: Tier): Exclude<Tier, 'free'> | undefined {
  const idx = FALLBACK_TIER_ORDER.indexOf(current as any)
  return idx >= 0 ? FALLBACK_TIER_ORDER[idx + 1] : 'creator'
}

function capLabelFor(cap: GigCap): string {
  if (cap.lifetime != null) return `${cap.lifetime} gig${cap.lifetime === 1 ? '' : 's'} (lifetime)`
  if (cap.monthly === Number.POSITIVE_INFINITY) return 'unlimited gigs'
  return `${cap.monthly} gigs / month`
}

/**
 * Write-time guard — call before INSERT into gigs.
 * Counts the user's current usage against their tier cap.
 */
export async function canAddGig(userId: string): Promise<GigGate> {
  const tier = await getUserTier(userId)
  const cap = capForTier(tier) || { monthly: 0 }
  const capLabel = capLabelFor(cap)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let used = 0
  if (cap.lifetime != null) {
    // Lifetime cap = total gigs ever created on this account. Onboarding
    // bulk-import bypasses this via /api/onboarding/save-gigs.
    const { count } = await supabase
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    used = count || 0
  } else if (cap.monthly != null && cap.monthly !== Number.POSITIVE_INFINITY) {
    // Monthly cap = gigs created in the current calendar month (UTC).
    // Resets on the 1st.
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString())
    used = count || 0
  }

  const limit = cap.lifetime ?? cap.monthly ?? 0
  const allowed = limit === Number.POSITIVE_INFINITY || used < limit

  if (allowed) {
    return { allowed: true, tier, cap, used, capLabel }
  }

  const upgradeTo = nextTier(tier)
  return {
    allowed: false,
    tier,
    cap,
    used,
    capLabel,
    upgradeTo,
    upgradeMessage: upgradeTo
      ? `You've hit your ${capLabel} on the ${tier} plan. Upgrade to ${upgradeTo} for more headroom.`
      : `You've hit your ${capLabel}.`,
  }
}
