import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { assessCampaign } from '@/lib/ads/campaign-health'

/**
 * GET /api/ads/[campaignId]/details
 *
 * Lazy-loaded deep read for the expand panel on the Ads dashboard.
 * Pulls enrichment that's too heavy for the list endpoint:
 *   - daily time-series (reach/spend/cpm per day)
 *   - breakdown by age + gender
 *   - breakdown by publisher_platform + platform_position (Feed/Reels/Stories)
 *   - per-ad list with creative thumbnail + individual insights + rankings
 *   - frequency from campaign insights
 * Then runs campaign-health.ts to produce a plain-English grade + next action.
 *
 * All metrics are real from Graph API v25 — no fabricated benchmarks.
 * Per rule_meta_api_compliance: uses metric_type=total_value, no
 * deprecated fields.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'META_SYSTEM_USER_TOKEN not configured' }, { status: 500 })
  }

  const { campaignId } = await params
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
  }

  const base = `https://graph.facebook.com/v25.0`
  const timeout = (ms: number) => AbortSignal.timeout(ms)

  try {
    const [campaignRes, dailyRes, ageGenderRes, placementRes, countryRes, regionRes, videoRes, adsRes] = await Promise.all([
      // Campaign meta + lifetime insights (with frequency)
      fetch(
        `${base}/${campaignId}?fields=name,status,objective,start_time,stop_time,daily_budget,lifetime_budget,insights.metric_type(total_value){spend,impressions,reach,frequency,clicks,cpc,cpm,ctr,actions}&access_token=${token}`,
        { signal: timeout(8000) }
      ),
      // Daily time series
      fetch(
        `${base}/${campaignId}/insights?fields=spend,reach,impressions,cpm&time_increment=1&date_preset=maximum&metric_type=total_value&access_token=${token}`,
        { signal: timeout(8000) }
      ),
      // Age + gender breakdown
      fetch(
        `${base}/${campaignId}/insights?fields=spend,reach,impressions&breakdowns=age,gender&date_preset=maximum&metric_type=total_value&access_token=${token}`,
        { signal: timeout(8000) }
      ),
      // Placement breakdown
      fetch(
        `${base}/${campaignId}/insights?fields=spend,reach,impressions&breakdowns=publisher_platform,platform_position&date_preset=maximum&metric_type=total_value&access_token=${token}`,
        { signal: timeout(8000) }
      ),
      // Country breakdown
      fetch(
        `${base}/${campaignId}/insights?fields=spend,reach,impressions,actions&breakdowns=country&date_preset=maximum&metric_type=total_value&access_token=${token}`,
        { signal: timeout(8000) }
      ),
      // Region/city breakdown — Meta calls this "region" (state/county/city
      // depending on country). UK = cities, US = states. Use country+region
      // pair so the same region name across countries doesn't collide.
      fetch(
        `${base}/${campaignId}/insights?fields=spend,reach,impressions,actions&breakdowns=country,region&date_preset=maximum&metric_type=total_value&access_token=${token}`,
        { signal: timeout(8000) }
      ),
      // Video watch metrics — hook strength signals. p25/50/75/100 = % of viewers
      // who reached that point. avg_time_watched = ms. Lifetime totals.
      fetch(
        `${base}/${campaignId}/insights?fields=video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions,video_play_actions&date_preset=maximum&metric_type=total_value&access_token=${token}`,
        { signal: timeout(8000) }
      ),
      // Ads under campaign with creative + per-ad insights + rankings
      fetch(
        `${base}/${campaignId}/ads?fields=name,status,creative{thumbnail_url,image_url,body,title},insights.metric_type(total_value){spend,impressions,reach,clicks,ctr,cpc,cpm,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,actions}&limit=25&access_token=${token}`,
        { signal: timeout(10000) }
      ),
    ])

    if (!campaignRes.ok) {
      const err = await campaignRes.json().catch(() => ({}))
      return NextResponse.json({ error: err?.error?.message || `Meta API ${campaignRes.status}` }, { status: campaignRes.status })
    }

    const campaign = await campaignRes.json()
    const insights = campaign.insights?.data?.[0] ?? null

    const dailyJson = dailyRes.ok ? await dailyRes.json() : { data: [] }
    const daily = (dailyJson.data ?? []).map((d: any) => ({
      date: d.date_start,
      spend: parseFloat(d.spend || '0'),
      reach: parseInt(d.reach || '0'),
      impressions: parseInt(d.impressions || '0'),
      cpm: parseFloat(d.cpm || '0'),
    }))

    const ageGenderJson = ageGenderRes.ok ? await ageGenderRes.json() : { data: [] }
    const ageGender = (ageGenderJson.data ?? []).map((d: any) => ({
      age: d.age,
      gender: d.gender,
      spend: parseFloat(d.spend || '0'),
      reach: parseInt(d.reach || '0'),
      impressions: parseInt(d.impressions || '0'),
    }))

    const placementJson = placementRes.ok ? await placementRes.json() : { data: [] }
    const placements = (placementJson.data ?? []).map((d: any) => ({
      platform: d.publisher_platform,
      position: d.platform_position,
      spend: parseFloat(d.spend || '0'),
      reach: parseInt(d.reach || '0'),
      impressions: parseInt(d.impressions || '0'),
    }))

    // Country breakdown — pulls follows + profile visits per country so we
    // can see where new fans are coming from. action_types we care about:
    //   onsite_conversion.ig_account_follow → follows attributed to ad
    //   link_click                          → profile visits proxy
    const extractFollows = (d: any): number => {
      const actions = Array.isArray(d.actions) ? d.actions : []
      return parseInt(actions.find((a: any) => a.action_type === 'onsite_conversion.ig_account_follow')?.value || '0')
    }
    const extractVisits = (d: any): number => {
      const actions = Array.isArray(d.actions) ? d.actions : []
      return parseInt(actions.find((a: any) => a.action_type === 'link_click')?.value || '0')
    }

    const countryJson = countryRes.ok ? await countryRes.json() : { data: [] }
    const countries = (countryJson.data ?? []).map((d: any) => ({
      country: d.country,
      spend: parseFloat(d.spend || '0'),
      reach: parseInt(d.reach || '0'),
      impressions: parseInt(d.impressions || '0'),
      follows: extractFollows(d),
      visits: extractVisits(d),
    }))

    // Region/city breakdown — informs touring intel. Limit to top 25 by reach
    // so the response stays small.
    const regionJson = regionRes.ok ? await regionRes.json() : { data: [] }
    const regions = (regionJson.data ?? [])
      .map((d: any) => ({
        country: d.country,
        region: d.region || 'Unknown',
        spend: parseFloat(d.spend || '0'),
        reach: parseInt(d.reach || '0'),
        impressions: parseInt(d.impressions || '0'),
        follows: extractFollows(d),
        visits: extractVisits(d),
      }))
      .sort((a: any, b: any) => b.reach - a.reach)
      .slice(0, 25)

    // Video metrics — only meaningful when the creative is video. p25/50/75/100
    // are arrays keyed by action_type=video_view. Sum into single ints.
    const videoJson = videoRes.ok ? await videoRes.json() : { data: [] }
    const videoRow = videoJson.data?.[0]
    const sumActionArr = (arr: any[] | undefined): number =>
      Array.isArray(arr) ? arr.reduce((s, a) => s + (parseInt(a.value) || 0), 0) : 0
    const video = videoRow ? {
      plays: sumActionArr(videoRow.video_play_actions),
      p25: sumActionArr(videoRow.video_p25_watched_actions),
      p50: sumActionArr(videoRow.video_p50_watched_actions),
      p75: sumActionArr(videoRow.video_p75_watched_actions),
      p100: sumActionArr(videoRow.video_p100_watched_actions),
      avg_time_ms: sumActionArr(videoRow.video_avg_time_watched_actions),
    } : null

    const adsJson = adsRes.ok ? await adsRes.json() : { data: [] }
    const ads = (adsJson.data ?? []).map((a: any) => {
      const adInsights = a.insights?.data?.[0] ?? null
      return {
        id: a.id,
        name: a.name,
        status: a.status,
        thumbnail: a.creative?.thumbnail_url || a.creative?.image_url || null,
        body: a.creative?.body ?? null,
        title: a.creative?.title ?? null,
        insights: adInsights
          ? {
              spend: parseFloat(adInsights.spend || '0'),
              reach: parseInt(adInsights.reach || '0'),
              impressions: parseInt(adInsights.impressions || '0'),
              clicks: parseInt(adInsights.clicks || '0'),
              ctr: parseFloat(adInsights.ctr || '0'),
              cpc: parseFloat(adInsights.cpc || '0'),
              cpm: parseFloat(adInsights.cpm || '0'),
              quality_ranking: adInsights.quality_ranking,
              engagement_rate_ranking: adInsights.engagement_rate_ranking,
              conversion_rate_ranking: adInsights.conversion_rate_ranking,
            }
          : null,
      }
    })

    const health = assessCampaign({
      objective: campaign.objective,
      startTime: campaign.start_time,
      insights,
      dailyReach: daily.map((d: { date: string; reach: number; spend: number; cpm: number }) => ({
        date: d.date,
        reach: d.reach,
        spend: d.spend,
        cpm: d.cpm,
      })),
      adRankings: ads
        .map((a: any) => a.insights)
        .filter(Boolean)
        .map((i: any) => ({
          quality_ranking: i.quality_ranking,
          engagement_rate_ranking: i.engagement_rate_ranking,
          conversion_rate_ranking: i.conversion_rate_ranking,
        })),
    })

    return NextResponse.json({
      campaign: {
        id: campaignId,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective,
        start_time: campaign.start_time,
        stop_time: campaign.stop_time,
      },
      insights,
      daily,
      ageGender,
      placements,
      countries,
      regions,
      video,
      ads,
      health,
    })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
