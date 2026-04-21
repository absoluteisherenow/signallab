import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { evaluateScalingRules, ScalingInput } from '@/lib/growth/scaling-rules'

/**
 * GET /api/growth/overview
 *
 * Single endpoint for the Growth page — returns everything in one call:
 *   - trajectory: follower history + monthly projections
 *   - funnel: active Stage 1 / Stage 2 campaigns + retargeting pool size
 *   - monthly_budget: planned vs actual spend per month
 *   - scaling_rules: live rule evaluation across active campaigns
 *   - capture_moments: upcoming content capture dates
 *
 * One round-trip keeps the page snappy (core UX rule: show the intelligence,
 * keep it streamlined).
 *
 * Tenant scoping: all rows are filtered by the caller's user_id. The IG handle
 * is derived from artist_settings.profile.instagram — if the caller hasn't set
 * one yet, trajectory surfaces return empty (onboarding state, not an error).
 */

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const userId = gate.user.id
  const sb = gate.serviceClient

  // Derive the caller's IG handle from their profile. If missing, trajectory
  // and monthly-target queries skip the network round-trip and return empty.
  const { data: settingsRow } = await sb
    .from('artist_settings')
    .select('profile')
    .eq('user_id', userId)
    .maybeSingle()

  const profileIg = ((settingsRow?.profile ?? {}) as { instagram?: string | null }).instagram
  const rawHandle = (profileIg || '').trim().replace(/^@/, '')
  const igHandle = rawHandle ? `@${rawHandle}` : null

  // ─── Trajectory: follower history + monthly targets ─────────────────────
  const [{ data: followerHistory }, { data: monthlyTargets }] = await Promise.all([
    igHandle
      ? sb
          .from('follower_snapshots')
          .select('captured_for_date, followers_count')
          .eq('user_id', userId)
          .eq('handle', igHandle)
          .order('captured_for_date', { ascending: true })
      : Promise.resolve({ data: [] as Array<{ captured_for_date: string; followers_count: number | null }> }),
    igHandle
      ? sb
          .from('growth_monthly_targets')
          .select('month, planned_spend_gbp, projection_conservative, projection_realistic, projection_optimistic, notes')
          .eq('user_id', userId)
          .eq('handle', igHandle)
          .order('month', { ascending: true })
      : Promise.resolve({ data: [] as Array<{ month: string; planned_spend_gbp: number | null; projection_conservative: number | null; projection_realistic: number | null; projection_optimistic: number | null; notes: string | null }> }),
  ])

  const currentFollowers = followerHistory?.at(-1)?.followers_count ?? null
  const targetFollowers = 10000
  // Never-fabricate: if we have no history, baseline stays null. No NM-specific
  // fallback — that would bleed one tenant's figure into another's dashboard.
  const baselineFollowers = followerHistory?.[0]?.followers_count ?? currentFollowers ?? null

  // ─── Active campaigns (for funnel + scaling rules) ──────────────────────
  const { data: activeCampaigns } = await sb
    .from('campaigns')
    .select('id, meta_campaign_id, name, intent, objective, status, launched_at, phase_label')
    .eq('user_id', gate.user.id)
    .in('status', ['active', 'paused'])
    .order('launched_at', { ascending: false })

  const stage1Campaigns = (activeCampaigns ?? []).filter(c => c.intent === 'growth_stage_1')
  const stage2Campaigns = (activeCampaigns ?? []).filter(c => c.intent === 'growth_stage_2')

  // ─── Latest snapshot per active campaign (for aggregated metrics) ───────
  const activeIds = (activeCampaigns ?? []).map(c => c.id)
  let latestSnapshots: Array<{
    campaign_id: string
    captured_for_date: string
    spend: number | null
    reach: number | null
    impressions: number | null
    clicks: number | null
    cpm: number | null
    ctr: number | null
    frequency: number | null
    video_views: number | null
    video_views_75pct: number | null
    saves: number | null
    shares: number | null
    profile_visits: number | null
    followers_delta: number | null
  }> = []

  if (activeIds.length > 0) {
    const { data } = await sb
      .from('campaign_metrics_snapshots')
      .select(
        'campaign_id, captured_for_date, spend, reach, impressions, clicks, cpm, ctr, frequency, video_views, video_views_75pct, saves, shares, profile_visits, followers_delta'
      )
      .in('campaign_id', activeIds)
      .order('captured_for_date', { ascending: false })

    // Keep only most recent per campaign
    const seen = new Set<string>()
    for (const row of data ?? []) {
      if (!seen.has(row.campaign_id)) {
        latestSnapshots.push(row)
        seen.add(row.campaign_id)
      }
    }
  }

  // Retargeting pool size = sum of video_views_75pct across Stage 1 campaigns
  const retargetingPool = latestSnapshots
    .filter(s => stage1Campaigns.some(c => c.id === s.campaign_id))
    .reduce((sum, s) => sum + (s.video_views_75pct ?? 0), 0)

  // ─── Monthly spend actual (sum snapshots by month of captured_for_date) ──
  const monthlySpendMap = new Map<string, number>()
  if (activeIds.length > 0) {
    const { data: allSnaps } = await sb
      .from('campaign_metrics_snapshots')
      .select('captured_for_date, spend')
      .in('campaign_id', activeIds)

    for (const s of allSnaps ?? []) {
      if (!s.captured_for_date || s.spend == null) continue
      const ym = s.captured_for_date.slice(0, 7)
      monthlySpendMap.set(ym, (monthlySpendMap.get(ym) ?? 0) + Number(s.spend))
    }
  }

  const monthlyBudget = (monthlyTargets ?? []).map(t => ({
    month: t.month,
    planned_spend_gbp: Number(t.planned_spend_gbp ?? 0),
    actual_spend_gbp: Number((monthlySpendMap.get(t.month) ?? 0).toFixed(2)),
    projection_conservative: t.projection_conservative,
    projection_realistic: t.projection_realistic,
    projection_optimistic: t.projection_optimistic,
    notes: t.notes,
  }))

  // ─── Scaling rules: aggregate across active campaigns ───────────────────
  // Weight by spend so a £5 campaign doesn't dominate over a £20 one.
  let totalSpend = 0
  let weightedCTR = 0
  let weightedCPM = 0
  let weightedFreq = 0
  let totalImpressions = 0
  let totalVideoViews = 0
  let totalEngagement = 0
  let totalFollowersDelta = 0

  for (const s of latestSnapshots) {
    const spend = s.spend ?? 0
    if (spend > 0) {
      totalSpend += spend
      weightedCTR += (s.ctr ?? 0) * spend
      weightedCPM += (s.cpm ?? 0) * spend
      weightedFreq += (s.frequency ?? 0) * spend
    }
    totalImpressions += s.impressions ?? 0
    totalVideoViews += s.video_views ?? 0
    totalEngagement += (s.saves ?? 0) + (s.shares ?? 0) + (s.profile_visits ?? 0)
    totalFollowersDelta += s.followers_delta ?? 0
  }

  const hoursSinceLaunch =
    activeCampaigns?.[0]?.launched_at
      ? (Date.now() - new Date(activeCampaigns[0].launched_at).getTime()) / 3600_000
      : null

  const scalingInput: ScalingInput = {
    ctr: totalSpend > 0 ? weightedCTR / totalSpend : null,
    cpm: totalSpend > 0 ? weightedCPM / totalSpend : null,
    frequency: totalSpend > 0 ? weightedFreq / totalSpend : null,
    video_view_rate: totalImpressions > 0 ? totalVideoViews / totalImpressions : null,
    engagement_rate: totalImpressions > 0 ? totalEngagement / totalImpressions : null,
    cost_per_follower_gbp:
      totalFollowersDelta > 0 && totalSpend > 0 ? totalSpend / totalFollowersDelta : null,
    hours_since_launch: hoursSinceLaunch,
    days_since_creative_swap: null, // populated once we track creative swaps
    active_campaign_meta_ids: (activeCampaigns ?? [])
      .map(c => c.meta_campaign_id)
      .filter((x): x is string => x != null),
  }

  const scalingRules = evaluateScalingRules(scalingInput)

  // ─── Capture moments ────────────────────────────────────────────────────
  const { data: captureMoments } = await sb
    .from('growth_capture_moments')
    .select('id, moment_date, label, why, content_captured, gig_id')
    .eq('user_id', userId)
    .order('moment_date', { ascending: true })

  // ─── Verdict: on track vs projection ────────────────────────────────────
  const todayYm = new Date().toISOString().slice(0, 7)
  const thisMonthTarget = (monthlyTargets ?? []).find(t => t.month === todayYm)
  let trajectoryVerdict: 'on_track' | 'ahead' | 'behind' | 'unknown' = 'unknown'
  if (currentFollowers != null && thisMonthTarget?.projection_realistic != null) {
    const target = thisMonthTarget.projection_realistic
    const diff = currentFollowers - target
    const pct = target > 0 ? diff / target : 0
    if (pct >= 0.05) trajectoryVerdict = 'ahead'
    else if (pct <= -0.05) trajectoryVerdict = 'behind'
    else trajectoryVerdict = 'on_track'
  }

  return NextResponse.json({
    trajectory: {
      current_followers: currentFollowers,
      baseline_followers: baselineFollowers,
      target_followers: targetFollowers,
      verdict: trajectoryVerdict,
      history: followerHistory ?? [],
      monthly_targets: monthlyTargets ?? [],
    },
    funnel: {
      stage_1: {
        campaigns: stage1Campaigns,
        retargeting_pool: retargetingPool,
        pool_threshold: 1000,
        pool_ready: retargetingPool >= 1000,
      },
      stage_2: {
        campaigns: stage2Campaigns,
        active: stage2Campaigns.some(c => c.status === 'active'),
      },
    },
    monthly_budget: monthlyBudget,
    scaling_rules: scalingRules,
    capture_moments: captureMoments ?? [],
    aggregates: {
      total_spend_gbp: Number(totalSpend.toFixed(2)),
      total_impressions: totalImpressions,
      total_followers_delta: totalFollowersDelta,
      cost_per_follower_gbp: scalingInput.cost_per_follower_gbp,
    },
  })
}
