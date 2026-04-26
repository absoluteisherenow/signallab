import { createClient } from '@supabase/supabase-js'
import type { Tier } from '@/lib/stripe'

// ── Tier resolver ───────────────────────────────────────────────────────────
// Single source of truth for "what tier is this user on". Reads the
// subscriptions table via service-role (cron + server contexts use this).
// Returns 'free' for users with no subscription row, or with status not in
// (active, trialing).

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

export async function getUserTier(userId: string): Promise<Tier> {
  if (!userId) return 'free'
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data } = await supabase
    .from('subscriptions')
    .select('tier, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return 'free'
  if (!ACTIVE_STATUSES.has(data.status)) return 'free'
  return (data.tier as Tier) || 'free'
}

// Tier ranking — higher number = more access. Used for "user has at least X" checks.
// Road sits above Pro (heavy touring volume) but below Management (multi-artist
// bespoke). Use `tierAtLeast(actual, 'pro')` to gate Pro+ features — Road and
// Management both pass.
const RANK: Record<Tier, number> = {
  free: 0,
  creator: 1,
  artist: 2,
  pro: 3,
  road: 4,
  management: 5,
}

export function tierAtLeast(actual: Tier, required: Tier): boolean {
  return RANK[actual] >= RANK[required]
}
