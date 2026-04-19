/**
 * POST /api/social/instagram/clear-stuck
 *
 * Resets any `scheduled_posts` row that's been in status='publishing' for
 * longer than STUCK_THRESHOLD_MIN back to status='scheduled' so the
 * publisher cron picks it up on its next run.
 *
 * Invoked by the AutoFixPrompt when the classifier detects a stuck state.
 * Safe to call speculatively — if nothing is stuck, returns { cleared: 0 }.
 *
 * Uses the service role key because `publishing` rows may have been
 * written by the cron under the service role and RLS will reject updates
 * via the anon key.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// How long before a `publishing` row is considered stuck. The publisher
// cron itself runs every 5 min and each individual attempt has an upper
// bound of a few minutes of IG API work; 10 min is a safe "nothing
// legitimate is still mid-publish" cutoff.
const STUCK_THRESHOLD_MIN = 10

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function POST(_req: NextRequest) {
  try {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MIN * 60 * 1000).toISOString()

    // Only touch rows that are actually stuck. `updated_at` on the
    // scheduled_posts table moves whenever status changes, so anything
    // older than cutoff with status='publishing' is definitely stalled.
    const { data, error } = await admin
      .from('scheduled_posts')
      .update({
        status: 'scheduled',
        publish_error: 'Auto-cleared: stuck in publishing state',
      })
      .eq('status', 'publishing')
      .lt('updated_at', cutoff)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      cleared: data?.length ?? 0,
      threshold_min: STUCK_THRESHOLD_MIN,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
