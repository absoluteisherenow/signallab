import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') || '28' // days

  // Get connected Instagram account
  const { data: account } = await supabase
    .from('connected_social_accounts')
    .select('access_token, platform_user_id, token_expiry')
    .eq('platform', 'instagram')
    .single()

  if (!account?.access_token) {
    return NextResponse.json({ error: 'Instagram not connected' }, { status: 401 })
  }

  if (account.token_expiry && Date.now() > Number(account.token_expiry)) {
    return NextResponse.json({ error: 'Instagram token expired — reconnect in Settings' }, { status: 401 })
  }

  const token = account.access_token
  const igId = account.platform_user_id

  try {
    // 1. Account-level insights (last 28 days)
    const since = Math.floor((Date.now() - Number(period) * 86400000) / 1000)
    const until = Math.floor(Date.now() / 1000)

    const accountMetrics = [
      'reach', 'impressions', 'accounts_engaged',
      'profile_views', 'website_clicks', 'follows_and_unfollows',
    ].join(',')

    const insightsRes = await fetch(
      `https://graph.instagram.com/v25.0/${igId}/insights?metric=${accountMetrics}&period=day&since=${since}&until=${until}&access_token=${token}`
    )
    const insightsData = await insightsRes.json()

    // Parse account insights into totals
    const accountInsights: Record<string, number> = {}
    const dailyReach: { date: string; value: number }[] = []

    if (insightsData.data) {
      for (const metric of insightsData.data) {
        const total = (metric.values || []).reduce((sum: number, v: any) => sum + (v.value || 0), 0)
        accountInsights[metric.name] = total

        if (metric.name === 'reach') {
          for (const v of metric.values || []) {
            dailyReach.push({ date: v.end_time?.split('T')[0] || '', value: v.value || 0 })
          }
        }
      }
    }

    // 2. Recent media with insights
    const mediaRes = await fetch(
      `https://graph.instagram.com/v25.0/${igId}/media?fields=id,caption,media_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count&limit=25&access_token=${token}`
    )
    const mediaData = await mediaRes.json()
    const posts = mediaData.data || []

    // Fetch insights for each post (reach, impressions, engagement, saved)
    const mediaInsights = await Promise.allSettled(
      posts.map(async (post: any) => {
        const metrics = post.media_type === 'VIDEO' || post.media_type === 'REELS'
          ? 'reach,impressions,saved,shares,plays,total_interactions'
          : 'reach,impressions,saved,shares,total_interactions'
        const res = await fetch(
          `https://graph.instagram.com/v25.0/${post.id}/insights?metric=${metrics}&access_token=${token}`
        )
        if (!res.ok) return { id: post.id, insights: {} }
        const data = await res.json()
        const ins: Record<string, number> = {}
        for (const m of data.data || []) {
          ins[m.name] = m.values?.[0]?.value || 0
        }
        return { id: post.id, insights: ins }
      })
    )

    const insightsMap: Record<string, Record<string, number>> = {}
    for (const r of mediaInsights) {
      if (r.status === 'fulfilled' && r.value) {
        insightsMap[r.value.id] = r.value.insights
      }
    }

    // Combine posts with their insights
    const enrichedPosts = posts.map((p: any) => ({
      id: p.id,
      caption: (p.caption || '').slice(0, 120),
      media_type: p.media_type,
      timestamp: p.timestamp,
      permalink: p.permalink,
      thumbnail_url: p.thumbnail_url || p.media_url,
      like_count: p.like_count || 0,
      comments_count: p.comments_count || 0,
      ...(insightsMap[p.id] || {}),
    }))

    // Sort by reach to find top performers
    const sorted = [...enrichedPosts].sort((a, b) => (b.reach || 0) - (a.reach || 0))

    // Calculate averages
    const avgReach = enrichedPosts.length
      ? Math.round(enrichedPosts.reduce((s: number, p: any) => s + (p.reach || 0), 0) / enrichedPosts.length)
      : 0
    const avgEngagement = enrichedPosts.length
      ? Math.round(enrichedPosts.reduce((s: number, p: any) => s + (p.total_interactions || p.like_count + p.comments_count || 0), 0) / enrichedPosts.length)
      : 0

    return NextResponse.json({
      period: Number(period),
      account: accountInsights,
      dailyReach,
      posts: enrichedPosts,
      topPosts: sorted.slice(0, 5),
      averages: { reach: avgReach, engagement: avgEngagement },
      postCount: enrichedPosts.length,
    })
  } catch (err: any) {
    console.error('[instagram/insights] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
