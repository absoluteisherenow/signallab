import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TIER_VALUES = ['creator', 'artist', 'pro', 'unsure'] as const
const ROLE_VALUES = ['dj_producer', 'producer', 'dj', 'manager_label'] as const
type TierIntent = typeof TIER_VALUES[number]
type Role       = typeof ROLE_VALUES[number]

const RATE_LIMIT_PER_DAY = 5

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32)
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { email, tier_intent, role, source } = body as {
      email?: string
      tier_intent?: string
      role?: string
      source?: string
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email required' },
        { status: 400 }
      )
    }

    const cleanTier: TierIntent | null =
      TIER_VALUES.includes(tier_intent as TierIntent) ? (tier_intent as TierIntent) : null
    const cleanRole: Role | null =
      ROLE_VALUES.includes(role as Role) ? (role as Role) : null

    const ip      = getClientIp(req)
    const ipHash  = hashIp(ip)

    // Rate limit: 5 per IP per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: recentCount } = await supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', oneDayAgo)

    if ((recentCount ?? 0) >= RATE_LIMIT_PER_DAY) {
      return NextResponse.json(
        { success: false, error: 'Too many signups from this network. Try again tomorrow.' },
        { status: 429 }
      )
    }

    // Idempotent on email
    const { data: existing } = await supabase
      .from('waitlist')
      .select('id')
      .eq('email', email)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: true, message: 'Already on waitlist', isNew: false },
        { status: 200 }
      )
    }

    const insertRow: Record<string, any> = { email }
    if (cleanTier)              insertRow.tier_intent = cleanTier
    if (cleanRole)              insertRow.role        = cleanRole
    if (source && typeof source === 'string') insertRow.source = source.slice(0, 500)
    insertRow.ip_hash = ipHash

    const { data, error } = await supabase
      .from('waitlist')
      .insert([insertRow])
      .select()

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Added to waitlist',
      isNew: true,
      id: data?.[0]?.id,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to join waitlist' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const { count, error } = await supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })

    if (error) throw error

    return NextResponse.json({ success: true, count: count ?? 0 })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
