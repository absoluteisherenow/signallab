import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'
import { createNotification } from '@/lib/notifications'

/**
 * GET /api/crons/ads-reminders
 *
 * Daily nudges that keep the follower-growth loop running on its own:
 *
 *  1. Creative-queue low — any user with an active Stage 1 campaign and
 *     fewer than 2 approved+queued creatives gets a reminder. Without a
 *     queue, the rotate_creative action has nothing to swap to, so the
 *     fatigue rule just pauses instead of rotating. Aim to keep 3+ queued.
 *
 *  2. Stale verdicts — any open verdict that's been sitting >48h without
 *     apply or dismiss gets resurfaced. The first notification may have
 *     slipped; this is the follow-up ping.
 *
 * Dedup is handled inside createNotification (24h window on title) so this
 * cron is safe to re-run the same day.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MIN_APPROVED_QUEUE = 2
const STALE_HOURS = 48

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'ads-reminders')
  if (unauth) return unauth

  const summary = {
    users_checked: 0,
    queue_reminders: 0,
    stale_reminders: 0,
    errors: [] as string[],
  }

  // ─── 1. Queue-low reminders ──────────────────────────────────────────────
  try {
    const { data: activeStage1 } = await supabase
      .from('campaigns')
      .select('user_id, name')
      .eq('status', 'active')
      .eq('intent', 'growth_stage_1')

    const userIds = Array.from(new Set((activeStage1 ?? []).map(c => c.user_id)))
    summary.users_checked = userIds.length

    for (const userId of userIds) {
      const { count } = await supabase
        .from('ad_creative_queue')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('intent', 'growth_stage_1')
        .eq('status', 'queued')
        .not('approved_at', 'is', null)

      const approvedCount = count ?? 0
      if (approvedCount < MIN_APPROVED_QUEUE) {
        await createNotification({
          user_id: userId,
          type: 'ads_action',
          title: `Creative queue low — ${approvedCount} approved`,
          message: `Auto-rotate needs at least ${MIN_APPROVED_QUEUE} approved creatives queued. When fatigue fires with an empty queue, the ad just pauses instead of swapping. Queue up 2-3 more.`,
          href: '/grow/growth?queue=1',
        })
        summary.queue_reminders++
      }
    }
  } catch (err) {
    summary.errors.push(`queue: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ─── 2. Stale verdict reminders ──────────────────────────────────────────
  try {
    const threshold = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString()
    const { data: stale } = await supabase
      .from('ads_rule_verdicts')
      .select('id, user_id, campaign_id, rule_id, recommendation, created_at')
      .eq('verdict', 'action')
      .is('applied_at', null)
      .is('dismissed_at', null)
      .lt('created_at', threshold)
      .not('action_type', 'is', null)

    // Group by user so each artist gets one digest, not one ping per verdict.
    const byUser = new Map<string, typeof stale>()
    for (const row of stale ?? []) {
      const list = byUser.get(row.user_id) ?? []
      list.push(row)
      byUser.set(row.user_id, list)
    }

    for (const [userId, rows] of byUser.entries()) {
      const n = rows?.length ?? 0
      if (n === 0) continue
      const oldestHours = Math.floor(
        (Date.now() - new Date(rows![0].created_at).getTime()) / 3600_000
      )
      await createNotification({
        user_id: userId,
        type: 'ads_action',
        title: `${n} ad action${n === 1 ? '' : 's'} still waiting — oldest ${oldestHours}h`,
        message:
          rows!
            .slice(0, 3)
            .map(r => `• ${r.recommendation ?? r.rule_id}`)
            .join('\n') +
          (n > 3 ? `\n…and ${n - 3} more` : ''),
        href: '/grow/growth?verdicts=open',
      })
      summary.stale_reminders++
    }
  } catch (err) {
    summary.errors.push(`stale: ${err instanceof Error ? err.message : String(err)}`)
  }

  return NextResponse.json(summary)
}
