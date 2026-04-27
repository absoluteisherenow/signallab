import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'
import {
  evaluateScalingRules,
  RuleResult,
  ScalingInput,
  ctrScaleMultiplier,
  cheapFollowerScaleMultiplier,
} from '@/lib/growth/scaling-rules'
import { createNotification } from '@/lib/notifications'

/**
 * GET /api/crons/ads-evaluate
 *
 * Per active campaign: computes scaling-rule verdicts against the latest
 * snapshot, writes them to ads_rule_verdicts, and fires ONE digest notification
 * per campaign when any rule produces `action`. Approve-before-send compliant —
 * the notification links to the dashboard where the artist confirms one-click
 * apply. This cron never calls Meta write endpoints itself.
 *
 * Also evaluates the Stage 2 retargeting proposal once per user per day:
 * when the warm pool crosses 1000 and no active Stage 2 campaign exists,
 * writes a `stage_2_launch` verdict with a pre-filled launch config payload.
 *
 * Idempotent — unique (campaign_id, rule_id, evaluated_for_date).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAGE_2_POOL_THRESHOLD = 1000
// Placeholder campaign id used for user-scoped (non-campaign) verdicts like
// the Stage 2 proposal. ads_rule_verdicts.campaign_id is NOT NULL + FK, so
// user-scoped verdicts piggy-back on any active user campaign.
type Snapshot = {
  spend: number | null
  impressions: number | null
  clicks: number | null
  cpm: number | null
  ctr: number | null
  frequency: number | null
  video_views: number | null
  saves: number | null
  shares: number | null
  profile_visits: number | null
  followers_delta: number | null
}

type CampaignRow = {
  id: string
  user_id: string
  meta_campaign_id: string | null
  name: string
  intent: string | null
  launched_at: string | null
  status: string
}

/**
 * Trailing-7d account-level visit→follow rate, used to estimate per-campaign
 * follower delta from that campaign's profile_visits (Lever #4).
 * Returns null when there isn't enough signal to compute safely.
 */
async function computeProfileVisitFollowRate(userId: string): Promise<number | null> {
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10)
  const { data: cms } = await supabase
    .from('campaign_metrics_snapshots')
    .select('profile_visits, campaign_id, captured_for_date, campaigns!inner(user_id)')
    .eq('campaigns.user_id', userId)
    .gte('captured_for_date', since)
  const totalVisits = (cms ?? []).reduce(
    (sum, r) => sum + ((r as { profile_visits: number | null }).profile_visits ?? 0),
    0
  )
  if (totalVisits < 50) return null // too noisy to ratio-ise

  const { data: fs } = await supabase
    .from('follower_snapshots')
    .select('followers_count, captured_for_date')
    .eq('user_id', userId)
    .gte('captured_for_date', since)
    .order('captured_for_date', { ascending: true })
  if (!fs || fs.length < 2) return null
  const first = (fs[0] as { followers_count: number }).followers_count
  const last = (fs[fs.length - 1] as { followers_count: number }).followers_count
  const delta = last - first
  if (delta <= 0) return null
  const rate = delta / totalVisits
  // Sanity clamp — real rates sit between ~0.5% and ~15%.
  if (rate < 0.001 || rate > 0.5) return null
  return rate
}

function buildActionPayload(
  rule: RuleResult,
  campaign: { id: string; meta_campaign_id: string | null },
  input: ScalingInput
): { type: string; payload: Record<string, unknown> } | null {
  if (!campaign.meta_campaign_id) return null
  const base = { campaign_id: campaign.id, meta_campaign_id: campaign.meta_campaign_id }

  switch (rule.id) {
    case 'ctr_scale_up': {
      const multiplier = ctrScaleMultiplier(input)
      if (multiplier <= 1) return null
      return { type: 'scale_budget', payload: { ...base, multiplier } }
    }
    case 'cheap_follower_scale': {
      const multiplier = cheapFollowerScaleMultiplier(input)
      if (multiplier <= 1) return null
      return { type: 'scale_budget', payload: { ...base, multiplier } }
    }
    case 'vtr_kill':
      return { type: 'pause_campaign', payload: base }
    case 'freq_swap':
    case 'rotation_due':
      // Lever #1: attempt auto-rotate to next queued creative. apply-rule
      // falls back to an explicit error if the queue is empty — user can
      // then queue one or dismiss the verdict.
      return { type: 'swap_creative', payload: { ...base, reason: 'creative_fatigue' } }
    case 'cpm_audience_rotate':
      return { type: 'pause_campaign', payload: { ...base, reason: 'audience_saturated' } }
    case 'engagement_lookalike':
      // Lookalike expansion needs UI — surface as notification only, no one-click action
      return null
    default:
      return null
  }
}

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'ads-evaluate')
  if (unauth) return unauth

  const today = new Date().toISOString().slice(0, 10)
  const summary = {
    campaigns_evaluated: 0,
    verdicts_written: 0,
    action_notifications_fired: 0,
    stage_2_proposals_fired: 0,
    errors: [] as string[],
  }

  const { data: campaigns, error: campaignsErr } = await supabase
    .from('campaigns')
    .select('id, user_id, meta_campaign_id, name, intent, launched_at, status')
    .eq('status', 'active')
    .not('meta_campaign_id', 'is', null)

  if (campaignsErr) {
    return NextResponse.json({ error: campaignsErr.message }, { status: 500 })
  }

  const campaignRows = (campaigns ?? []) as CampaignRow[]

  // Cache follow-rate per user — used for per-campaign follower proxy.
  const followRateByUser = new Map<string, number | null>()

  for (const c of campaignRows) {
    try {
      summary.campaigns_evaluated++

      const { data: snaps } = await supabase
        .from('campaign_metrics_snapshots')
        .select(
          'captured_for_date, spend, impressions, clicks, cpm, ctr, frequency, video_views, saves, shares, profile_visits, followers_delta'
        )
        .eq('campaign_id', c.id)
        .order('captured_for_date', { ascending: false })
        .limit(1)

      const snap = (snaps?.[0] as Snapshot | undefined) ?? null

      const totalImpressions = snap?.impressions ?? 0
      const totalEngagement =
        (snap?.saves ?? 0) + (snap?.shares ?? 0) + (snap?.profile_visits ?? 0)

      const hoursSinceLaunch = c.launched_at
        ? (Date.now() - new Date(c.launched_at).getTime()) / 3600_000
        : null

      // Per-campaign follower proxy (Lever #4). followers_delta is account-wide,
      // so a single-campaign cheap_follower_scale rule never fires. Estimate a
      // per-campaign follower delta via profile_visits × trailing-7d account
      // visit→follow rate.
      let costPerFollower: number | null = null
      if (snap?.spend != null && snap.followers_delta != null && snap.followers_delta > 0) {
        costPerFollower = snap.spend / snap.followers_delta
      } else if (snap?.spend != null && (snap.profile_visits ?? 0) > 0) {
        if (!followRateByUser.has(c.user_id)) {
          followRateByUser.set(c.user_id, await computeProfileVisitFollowRate(c.user_id))
        }
        const rate = followRateByUser.get(c.user_id) ?? null
        if (rate && rate > 0) {
          const estFollowers = (snap.profile_visits ?? 0) * rate
          if (estFollowers > 0) costPerFollower = snap.spend / estFollowers
        }
      }

      const input: ScalingInput = {
        ctr: snap?.ctr ?? null,
        cpm: snap?.cpm ?? null,
        frequency: snap?.frequency ?? null,
        video_view_rate:
          totalImpressions > 0 && snap?.video_views != null
            ? snap.video_views / totalImpressions
            : null,
        engagement_rate: totalImpressions > 0 ? totalEngagement / totalImpressions : null,
        cost_per_follower_gbp: costPerFollower,
        hours_since_launch: hoursSinceLaunch,
        days_since_creative_swap: null,
        // Wire spend + follows for zero_follows_after_7d. follows_count uses
        // followers_delta (Meta-attributed) when available, else 0 — the rule
        // explicitly handles 0 + spend + 7d as the action condition.
        total_spend_gbp: snap?.spend ?? null,
        follows_count: snap?.followers_delta ?? 0,
        active_campaign_meta_ids: c.meta_campaign_id ? [c.meta_campaign_id] : [],
      }

      const rules = evaluateScalingRules(input)
      const actionRules: RuleResult[] = []

      for (const rule of rules) {
        const action = buildActionPayload(rule, c, input)
        const { error: upErr } = await supabase.from('ads_rule_verdicts').upsert(
          {
            user_id: c.user_id,
            campaign_id: c.id,
            meta_campaign_id: c.meta_campaign_id!,
            rule_id: rule.id,
            verdict: rule.verdict,
            current_value: rule.current_value,
            threshold: rule.threshold,
            recommendation: rule.recommendation,
            action_type: action?.type ?? null,
            action_payload: action?.payload ?? null,
            evaluated_for_date: today,
          },
          { onConflict: 'campaign_id,rule_id,evaluated_for_date' }
        )
        if (upErr) {
          summary.errors.push(`verdict ${c.id}/${rule.id}: ${upErr.message}`)
          continue
        }
        summary.verdicts_written++
        if (rule.verdict === 'action') actionRules.push(rule)
      }

      if (actionRules.length > 0) {
        const top = actionRules
          .map(r => `• ${r.label}: ${r.recommendation ?? 'review'}`)
          .slice(0, 3)
          .join('\n')
        // SMS triggered explicitly — ads_action isn't a critical type by
        // default (would over-SMS on every minor scale verdict), but a real
        // pivot/pause signal warrants a text. zero_follows_after_7d catches
        // the Awareness-objective failure that would otherwise burn budget
        // silently for weeks.
        const isCritical = actionRules.some(r =>
          r.id === 'zero_follows_after_7d' ||
          r.id === 'vtr_kill_rotate' ||
          r.id === 'cpm_audience_rotate'
        )
        await createNotification({
          user_id: c.user_id,
          type: 'ads_action',
          title: `Ad action needed — ${c.name}`,
          message: top,
          href: `/grow/growth?campaign=${c.id}`,
          metadata: {
            campaign_id: c.id,
            meta_campaign_id: c.meta_campaign_id,
            rule_ids: actionRules.map(r => r.id),
          },
          sendSms: isCritical,
        })
        summary.action_notifications_fired++
      }
    } catch (err) {
      summary.errors.push(`campaign ${c.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ─── Stage 2 retargeting proposal (Lever #2) ─────────────────────────────
  // Per-user: when warm-pool size ≥ STAGE_2_POOL_THRESHOLD and no active
  // growth_stage_2 campaign exists, propose a launch. Verdict is attached to
  // the user's oldest active Stage 1 campaign (schema needs a campaign_id).
  const userIds = Array.from(new Set(campaignRows.map(c => c.user_id)))
  for (const userId of userIds) {
    try {
      const stage2Active = campaignRows.some(
        c => c.user_id === userId && c.intent === 'growth_stage_2' && c.status === 'active'
      )
      if (stage2Active) continue

      const stage1 = campaignRows.find(c => c.user_id === userId && c.intent === 'growth_stage_1')
      if (!stage1 || !stage1.meta_campaign_id) continue

      // Warm pool proxy: unique reach across the user's Stage 1 campaigns over
      // their lifetime. The real Meta retargeting audience is bigger (anyone
      // who saw a 25%+ video view), but reach is a reasonable under-estimate
      // that doesn't require a Meta audience-size API call.
      const { data: poolRows } = await supabase
        .from('campaign_metrics_snapshots')
        .select('impressions, video_views_75pct, campaigns!inner(user_id, intent)')
        .eq('campaigns.user_id', userId)
        .eq('campaigns.intent', 'growth_stage_1')
      const pool = (poolRows ?? []).reduce(
        (sum, r) =>
          sum +
          ((r as { video_views_75pct: number | null }).video_views_75pct ??
            (r as { impressions: number | null }).impressions ??
            0),
        0
      )
      if (pool < STAGE_2_POOL_THRESHOLD) continue

      const { error: s2Err } = await supabase.from('ads_rule_verdicts').upsert(
        {
          user_id: userId,
          campaign_id: stage1.id,
          meta_campaign_id: stage1.meta_campaign_id,
          rule_id: 'stage_2_launch',
          verdict: 'action',
          current_value: pool,
          threshold: `warm pool ≥ ${STAGE_2_POOL_THRESHOLD}`,
          recommendation: `Warm pool is ${Math.round(pool).toLocaleString()} — launch Stage 2 retargeting.`,
          action_type: 'propose_stage_2',
          action_payload: {
            pool_size: pool,
            source_stage1_campaign_id: stage1.id,
            suggested_intent: 'growth_stage_2',
            suggested_daily_budget_gbp: 5,
            suggested_duration_days: 14,
            notes: 'Pre-filled config — review in the launch UI before Confirm.',
          },
          evaluated_for_date: today,
        },
        { onConflict: 'campaign_id,rule_id,evaluated_for_date' }
      )
      if (s2Err) {
        summary.errors.push(`stage2 ${userId}: ${s2Err.message}`)
        continue
      }

      await createNotification({
        user_id: userId,
        type: 'ads_action',
        title: 'Stage 2 retargeting ready to launch',
        message: `Warm pool is ${Math.round(pool).toLocaleString()}. Tap to review the pre-filled Stage 2 config.`,
        href: `/grow/growth?propose=stage2`,
        metadata: { pool_size: pool, source_stage1_campaign_id: stage1.id },
      })
      summary.stage_2_proposals_fired++
    } catch (err) {
      summary.errors.push(`stage2 ${userId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json(summary)
}
