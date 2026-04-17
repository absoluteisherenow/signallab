import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * GET /api/nm-plan/live-post
 * Returns the latest Instagram post with live metrics + baseline comparison.
 * Used by LivePostPanel which polls this every 60s.
 *
 * Response:
 *   { post: LivePost | null }
 *
 * LivePost shape matches LivePostPanel's type contract.
 * Graceful: returns { post: null } when there are no posts yet.
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { serviceClient } = gate

  try {
    // Latest post
    const { data: latestRows, error: latestErr } = await serviceClient
      .from('instagram_posts')
      .select('id, instagram_post_id, caption, media_type, posted_at, permalink, likes, comments, saves, reach, impressions, video_views, engagement_rate, synced_at')
      .order('posted_at', { ascending: false })
      .limit(1)

    if (latestErr) return NextResponse.json({ post: null, error: latestErr.message })
    const latest = latestRows?.[0]
    if (!latest) return NextResponse.json({ post: null })

    // Baseline reach: median reach of previous 20 posts (excluding the latest)
    const { data: prevRows } = await serviceClient
      .from('instagram_posts')
      .select('reach')
      .neq('id', latest.id)
      .order('posted_at', { ascending: false })
      .limit(20)

    const reaches = (prevRows || [])
      .map(r => Number(r.reach || 0))
      .filter(n => n > 0)
      .sort((a, b) => a - b)
    const avgReach = reaches.length ? Math.round(reaches.reduce((s, n) => s + n, 0) / reaches.length) : 0

    const latestReach = Number(latest.reach || 0)
    const vsBaselinePct = avgReach > 0 ? Math.round(((latestReach - avgReach) / avgReach) * 100) : 0

    // Minutes since posted
    const postedAtMs = latest.posted_at ? new Date(latest.posted_at).getTime() : null
    const minutesSincePosted = postedAtMs ? Math.max(0, Math.round((Date.now() - postedAtMs) / 60000)) : null

    // Collab detection — scan caption for @mentions
    const mentions = (latest.caption || '').match(/@[a-zA-Z0-9._]+/g) || []
    const uniqueMentions = Array.from(new Set(mentions.map((m: string) => m.toLowerCase())))
    // IG collab slots = up to 3 additional accounts (4 total) on a collab post
    const slotsTotal = 3
    const slotsUsed = Math.min(uniqueMentions.length, slotsTotal)
    const isThreeWay = uniqueMentions.length >= 2

    const post = {
      id: String(latest.id),
      permalink: latest.permalink || null,
      mediaType: latest.media_type || null,
      postedAt: latest.posted_at || null,
      minutesSincePosted,
      caption: latest.caption || null,
      metrics: {
        reach: latestReach,
        views: Number(latest.video_views || latest.impressions || 0),
        likes: Number(latest.likes || 0),
        comments: Number(latest.comments || 0),
        saves: Number(latest.saves || 0),
        engagementRate: Number(latest.engagement_rate || 0),
      },
      baseline: {
        avgReach,
        vsBaselinePct,
      },
      collab: {
        isThreeWay,
        accounts: uniqueMentions,
        slotsUsed,
        slotsTotal,
      },
      syncedAt: latest.synced_at || null,
    }

    return NextResponse.json({ post })
  } catch (err: any) {
    return NextResponse.json({ post: null, error: err.message || 'live-post failed' }, { status: 500 })
  }
}
