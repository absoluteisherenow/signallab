import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Fetch with timeout
async function fetchIG(url: string, timeoutMs = 8000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}

export async function POST() {
  try {
    // Get connected Instagram account
    const { data: accounts, error: accErr } = await supabase
      .from('connected_social_accounts')
      .select('access_token, platform_user_id, handle, token_expiry')
      .eq('platform', 'instagram')
      .limit(1)

    if (accErr || !accounts?.length) {
      return NextResponse.json({ success: false, error: 'No Instagram account connected' }, { status: 400 })
    }

    const { access_token, platform_user_id, handle, token_expiry } = accounts[0]

    if (!access_token || !platform_user_id) {
      return NextResponse.json({ success: false, error: 'Missing Instagram credentials' }, { status: 400 })
    }

    // Check token expiry
    if (token_expiry && Date.now() > Number(token_expiry)) {
      return NextResponse.json({ success: false, error: 'Instagram token expired — please reconnect your Instagram account in Settings' }, { status: 401 })
    }

    // Fetch recent media
    const mediaUrl = `https://graph.instagram.com/v25.0/${platform_user_id}/media?fields=id,caption,media_type,timestamp,permalink,like_count,comments_count&limit=50&access_token=${access_token}`
    const mediaRes = await fetchIG(mediaUrl)
    if (!mediaRes.ok) {
      const err = await mediaRes.json().catch(() => ({}))
      return NextResponse.json({ success: false, error: `Instagram API error: ${err?.error?.message || mediaRes.status}` }, { status: 502 })
    }
    const mediaData = await mediaRes.json()
    const posts: any[] = mediaData.data || []

    if (posts.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: 'No posts found on this account' })
    }

    // Fetch insights for each post (impressions, reach, saved)
    const insightMetrics: Record<string, string[]> = {
      IMAGE: ['impressions', 'reach', 'saved'],
      VIDEO: ['impressions', 'reach', 'saved', 'video_views'],
      CAROUSEL_ALBUM: ['impressions', 'reach', 'saved'],
      REELS: ['impressions', 'reach', 'saved', 'video_views'],
    }

    // Batch insight requests — 10 at a time to avoid rate limits
    const enriched: PromiseSettledResult<any>[] = []
    for (let i = 0; i < posts.length; i += 10) {
      const batch = posts.slice(i, i + 10)
      const batchResults = await Promise.allSettled(
        batch.map(async (post) => {
          const metrics = insightMetrics[post.media_type] || ['impressions', 'reach', 'saved']
          try {
            const insightUrl = `https://graph.instagram.com/v25.0/${post.id}/insights?metric=${metrics.join(',')}&access_token=${access_token}`
            let insightRes = await fetchIG(insightUrl, 5000)
            // Retry once on transient failure
            if (!insightRes.ok && (insightRes.status === 429 || insightRes.status >= 500)) {
              await new Promise(r => setTimeout(r, 2000))
              insightRes = await fetchIG(insightUrl, 5000)
            }
            if (!insightRes.ok) return { ...post, impressions: null, reach: null, saved: null }
            const insightData = await insightRes.json()
            const byName: Record<string, number> = {}
            ;(insightData.data || []).forEach((m: any) => { byName[m.name] = m.values?.[0]?.value ?? m.value ?? null })
            return {
              ...post,
              impressions: byName.impressions ?? null,
              reach: byName.reach ?? null,
              saved: byName.saved ?? null,
              video_views: byName.video_views ?? null,
            }
          } catch {
            return { ...post, impressions: null, reach: null, saved: null }
          }
        })
      )
      enriched.push(...batchResults)
      // Small delay between batches
      if (i + 10 < posts.length) await new Promise(r => setTimeout(r, 500))
    }

    const toUpsert = enriched
      .filter(r => r.status === 'fulfilled')
      .map((r: any) => {
        const p = r.value
        const likes = p.like_count ?? 0
        const comments = p.comments_count ?? 0
        const saves = p.saved ?? 0
        const reach = p.reach ?? 0
        const engagementRate = reach > 0 ? Math.round(((likes + comments + saves) / reach) * 100 * 10) / 10 : null
        return {
          instagram_post_id: p.id,
          handle: handle || null,
          caption: p.caption || null,
          media_type: p.media_type || null,
          posted_at: p.timestamp || null,
          permalink: p.permalink || null,
          likes,
          comments,
          saves,
          reach: reach || null,
          impressions: p.impressions ?? null,
          video_views: p.video_views ?? null,
          engagement_rate: engagementRate,
          synced_at: new Date().toISOString(),
        }
      })

    const { error: upsertErr } = await supabase
      .from('instagram_posts')
      .upsert(toUpsert, { onConflict: 'instagram_post_id' })

    if (upsertErr) throw upsertErr

    return NextResponse.json({
      success: true,
      synced: toUpsert.length,
      handle,
      summary: {
        total: toUpsert.length,
        avgLikes: Math.round(toUpsert.reduce((s, p) => s + p.likes, 0) / toUpsert.length),
        avgSaves: Math.round(toUpsert.reduce((s, p) => s + p.saves, 0) / toUpsert.length),
        avgEngagementRate: toUpsert.filter(p => p.engagement_rate).length > 0
          ? Math.round(toUpsert.reduce((s, p) => s + (p.engagement_rate || 0), 0) / toUpsert.filter(p => p.engagement_rate).length * 10) / 10
          : null,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
