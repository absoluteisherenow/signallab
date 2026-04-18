import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'
import { META_CONFIG } from '@/lib/ads/meta-launch'

/**
 * GET /api/crons/ads-snapshot
 *
 * Daily (09:00 UTC via signal-lab-crons Worker). Two jobs:
 *   1. For each campaign with status in ('active','paused'), fetch insights
 *      from Meta and upsert into campaign_metrics_snapshots.
 *   2. Fetch follower count for NM's IG account via business_discovery and
 *      upsert into follower_snapshots.
 *
 * Idempotent — unique (campaign_id, captured_for_date) and (handle, platform,
 * captured_for_date) mean re-running the same day is a no-op.
 *
 * Never-fabricate: if insights/follower fetch fails, we skip the row with a
 * failure counter — we do NOT write placeholder/zero rows.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NM_HANDLE = '@nightmanoeuvres'

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'ads-snapshot')
  if (unauth) return unauth

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'meta_token_not_configured' }, { status: 500 })
  }

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const summary = {
    campaigns_processed: 0,
    campaigns_snapshot_ok: 0,
    campaigns_snapshot_failed: 0,
    follower_snapshot_ok: false,
    errors: [] as string[],
  }

  // ─── 1. Campaign metrics snapshots ────────────────────────────────────────
  const { data: campaigns, error: campaignsErr } = await supabase
    .from('campaigns')
    .select('id, meta_campaign_id, status, name')
    .in('status', ['active', 'paused'])
    .not('meta_campaign_id', 'is', null)

  if (campaignsErr) {
    summary.errors.push(`campaigns_query: ${campaignsErr.message}`)
  } else if (campaigns) {
    summary.campaigns_processed = campaigns.length

    // Fetch followers for delta computation (today vs yesterday)
    const yesterdayStr = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10)
    const { data: priorFollowers } = await supabase
      .from('follower_snapshots')
      .select('followers_count, captured_for_date')
      .eq('handle', NM_HANDLE)
      .in('captured_for_date', [today, yesterdayStr])
      .order('captured_for_date', { ascending: false })
      .limit(2)

    const todayFollowers = priorFollowers?.find(r => r.captured_for_date === today)?.followers_count
    const yesterdayFollowers = priorFollowers?.find(r => r.captured_for_date === yesterdayStr)?.followers_count
    const totalFollowerDelta =
      todayFollowers != null && yesterdayFollowers != null ? todayFollowers - yesterdayFollowers : null

    for (const c of campaigns) {
      try {
        const insightsUrl =
          `https://graph.facebook.com/${META_CONFIG.API_VERSION}/${c.meta_campaign_id}/insights` +
          `?fields=spend,impressions,reach,clicks,cpc,cpm,ctr,frequency,actions,video_p75_watched_actions,quality_ranking,engagement_ranking,conversion_ranking` +
          `&date_preset=yesterday` +
          `&access_token=${token}`

        const res = await fetch(insightsUrl, { signal: AbortSignal.timeout(12000) })
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          summary.errors.push(`campaign ${c.id}: meta ${res.status} ${(errBody as { error?: { message?: string } })?.error?.message || ''}`)
          summary.campaigns_snapshot_failed++
          continue
        }

        const data = await res.json()
        const insights = data.data?.[0]
        if (!insights) {
          // No data = campaign has no spend yet, not an error. Skip silently.
          summary.campaigns_snapshot_failed++
          continue
        }

        // Extract action breakdown
        const actions = (insights.actions || []) as Array<{ action_type: string; value: string }>
        const getAction = (type: string) => {
          const hit = actions.find(a => a.action_type === type)
          return hit ? parseInt(hit.value, 10) : null
        }

        // Video 75%+ from video_p75_watched_actions (retargeting pool signal)
        const vp75 = (insights.video_p75_watched_actions || []) as Array<{ value: string }>
        const video_views_75pct = vp75[0]?.value ? parseInt(vp75[0].value, 10) : null

        const { error: upsertErr } = await supabase.from('campaign_metrics_snapshots').upsert(
          {
            campaign_id: c.id,
            captured_for_date: today,
            spend: insights.spend ? parseFloat(insights.spend) : null,
            reach: insights.reach ? parseInt(insights.reach, 10) : null,
            impressions: insights.impressions ? parseInt(insights.impressions, 10) : null,
            clicks: insights.clicks ? parseInt(insights.clicks, 10) : null,
            cpc: insights.cpc ? parseFloat(insights.cpc) : null,
            cpm: insights.cpm ? parseFloat(insights.cpm) : null,
            ctr: insights.ctr ? parseFloat(insights.ctr) : null,
            frequency: insights.frequency ? parseFloat(insights.frequency) : null,
            link_clicks: getAction('link_click'),
            saves: getAction('onsite_conversion.post_save'),
            shares: getAction('post') ?? getAction('share'),
            profile_visits: getAction('profile_visit') ?? getAction('page_engagement'),
            video_views: getAction('video_view'),
            video_views_75pct,
            followers_delta: totalFollowerDelta, // account-level proxy; scoring engine will weight accordingly
            quality_ranking: insights.quality_ranking ?? null,
            engagement_ranking: insights.engagement_ranking ?? null,
            conversion_ranking: insights.conversion_ranking ?? null,
            actions_jsonb: actions,
            raw_insights_jsonb: insights,
          },
          { onConflict: 'campaign_id,captured_for_date' }
        )

        if (upsertErr) {
          summary.errors.push(`campaign ${c.id} upsert: ${upsertErr.message}`)
          summary.campaigns_snapshot_failed++
        } else {
          summary.campaigns_snapshot_ok++
        }
      } catch (err) {
        summary.errors.push(`campaign ${c.id}: ${err instanceof Error ? err.message : String(err)}`)
        summary.campaigns_snapshot_failed++
      }
    }
  }

  // ─── 2. Follower snapshot via business_discovery ──────────────────────────
  try {
    const bdUrl =
      `https://graph.facebook.com/${META_CONFIG.API_VERSION}/${META_CONFIG.IG_ACTOR_ID}` +
      `?fields=business_discovery.username(nightmanoeuvres){followers_count,follows_count,media_count}` +
      `&access_token=${token}`

    const bdRes = await fetch(bdUrl, { signal: AbortSignal.timeout(10000) })
    if (!bdRes.ok) {
      const errBody = await bdRes.json().catch(() => ({}))
      summary.errors.push(`follower_bd: meta ${bdRes.status} ${(errBody as { error?: { message?: string } })?.error?.message || ''}`)
    } else {
      const bdData = await bdRes.json()
      const bd = bdData.business_discovery
      if (bd?.followers_count != null) {
        const { error: fsErr } = await supabase.from('follower_snapshots').upsert(
          {
            user_id: '00000000-0000-0000-0000-000000000000', // system user for cron-written rows
            handle: NM_HANDLE,
            platform: 'instagram',
            followers_count: bd.followers_count,
            following_count: bd.follows_count ?? null,
            posts_count: bd.media_count ?? null,
            captured_for_date: today,
            source: 'business_discovery',
            raw_jsonb: bdData,
          },
          { onConflict: 'handle,platform,captured_for_date' }
        )

        if (fsErr) {
          summary.errors.push(`follower_upsert: ${fsErr.message}`)
        } else {
          summary.follower_snapshot_ok = true
        }
      } else {
        summary.errors.push('follower_bd: no followers_count in response')
      }
    }
  } catch (err) {
    summary.errors.push(`follower_bd: ${err instanceof Error ? err.message : String(err)}`)
  }

  return NextResponse.json(summary)
}
