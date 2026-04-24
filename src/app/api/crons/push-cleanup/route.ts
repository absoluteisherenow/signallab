import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

// Daily TTL cleanup for the Web Push queue. The SW normally fetches
// /api/notifications/next on wake and deletes the row — but if the user's
// browser is closed/offline for days, pending messages accumulate. Age them
// out so the table doesn't grow unbounded.
//
// TTL = 7 days. If a push hasn't been delivered in a week, the content is
// stale anyway (gig tomorrow → gig last week).

const TTL_DAYS = 7

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'push-cleanup')
  if (unauth) return unauth

  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error, count } = await sb
    .from('pending_push_messages')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ran: true, purged: count || 0, cutoff })
}
