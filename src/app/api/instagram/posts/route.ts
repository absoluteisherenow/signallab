import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('instagram_posts')
      .select('instagram_post_id, caption, media_type, posted_at, permalink, likes, comments, saves, reach, impressions, video_views, engagement_rate, synced_at')
      .order('posted_at', { ascending: false })
      .limit(100)

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ posts: [], synced: false, message: 'Not yet synced' })
      }
      throw error
    }

    const posts = data || []
    const withData = posts.filter(p => p.reach && p.reach > 0)

    return NextResponse.json({
      posts,
      synced: posts.length > 0,
      lastSync: posts[0]?.synced_at || null,
      stats: withData.length > 0 ? {
        total: posts.length,
        avgLikes: Math.round(withData.reduce((s, p) => s + (p.likes || 0), 0) / withData.length),
        avgComments: Math.round(withData.reduce((s, p) => s + (p.comments || 0), 0) / withData.length),
        avgSaves: Math.round(withData.reduce((s, p) => s + (p.saves || 0), 0) / withData.length),
        avgEngagementRate: Math.round(withData.reduce((s, p) => s + (p.engagement_rate || 0), 0) / withData.length * 10) / 10,
        topByEngagement: [...withData]
          .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
          .slice(0, 5)
          .map(p => ({ caption: p.caption?.slice(0, 80) || '', likes: p.likes, saves: p.saves, engagement_rate: p.engagement_rate, media_type: p.media_type, posted_at: p.posted_at })),
        topBySaves: [...withData]
          .sort((a, b) => (b.saves || 0) - (a.saves || 0))
          .slice(0, 3)
          .map(p => ({ caption: p.caption?.slice(0, 80) || '', saves: p.saves, media_type: p.media_type })),
        byFormat: (() => {
          const groups: Record<string, { count: number; totalEng: number; totalSaves: number }> = {}
          withData.forEach(p => {
            const k = p.media_type || 'unknown'
            if (!groups[k]) groups[k] = { count: 0, totalEng: 0, totalSaves: 0 }
            groups[k].count++
            groups[k].totalEng += p.engagement_rate || 0
            groups[k].totalSaves += p.saves || 0
          })
          return Object.entries(groups).map(([type, d]) => ({
            type,
            count: d.count,
            avgEngagement: Math.round(d.totalEng / d.count * 10) / 10,
            avgSaves: Math.round(d.totalSaves / d.count),
          })).sort((a, b) => b.avgEngagement - a.avgEngagement)
        })(),
      } : null,
    })
  } catch (err: any) {
    return NextResponse.json({ posts: [], synced: false, error: err.message }, { status: 500 })
  }
}
