import { NextRequest, NextResponse } from 'next/server'
import { SCAN_TIERS, DEFAULT_TIER, type PlanTier } from '@/lib/scanTiers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function getUsage(userId: string, month: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/scan_usage?user_id=eq.${encodeURIComponent(userId)}&month=eq.${month}&select=scan_count,credits`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  )
  const rows = await res.json()
  return rows[0] ?? { scan_count: 0, credits: 0 }
}

async function incrementUsage(userId: string, month: string, count: number) {
  // Upsert: increment scan_count by `count`
  await fetch(`${SUPABASE_URL}/rest/v1/scan_usage`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      month,
      scan_count: count,
      updated_at: new Date().toISOString(),
    }),
  })

  // If row already existed, increment separately
  await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/increment_scan_count`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: userId, p_month: month, p_count: count }),
    }
  )
}

// GET /api/scan-usage?userId=xxx  — check remaining scans
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') || 'anonymous'
  const tier = (req.nextUrl.searchParams.get('tier') || DEFAULT_TIER) as PlanTier
  const month = currentMonth()

  const limits = SCAN_TIERS[tier] ?? SCAN_TIERS[DEFAULT_TIER]
  const usage = await getUsage(userId, month)

  const totalAllowance = limits.monthlyLimit + (usage.credits ?? 0)
  const remaining = Math.max(0, totalAllowance - (usage.scan_count ?? 0))

  return NextResponse.json({
    tier,
    month,
    used: usage.scan_count ?? 0,
    credits: usage.credits ?? 0,
    monthlyLimit: limits.monthlyLimit,
    batchLimit: limits.batchLimit,
    remaining,
    canScan: remaining > 0,
  })
}

// POST /api/scan-usage  — record scans used
export async function POST(req: NextRequest) {
  const { userId = 'anonymous', count = 1, tier = DEFAULT_TIER } = await req.json()
  const month = currentMonth()
  const limits = SCAN_TIERS[tier as PlanTier] ?? SCAN_TIERS[DEFAULT_TIER]

  const usage = await getUsage(userId, month)
  const totalAllowance = limits.monthlyLimit + (usage.credits ?? 0)
  const newTotal = (usage.scan_count ?? 0) + count

  if (newTotal > totalAllowance) {
    return NextResponse.json({ error: 'Monthly scan limit reached', remaining: 0 }, { status: 429 })
  }

  // Direct upsert with new total
  await fetch(`${SUPABASE_URL}/rest/v1/scan_usage`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      month,
      scan_count: newTotal,
      updated_at: new Date().toISOString(),
    }),
  })

  return NextResponse.json({
    used: newTotal,
    remaining: Math.max(0, totalAllowance - newTotal),
  })
}
