import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data: rows, error } = await supabase
      .from('post_performance')
      .select('artist_name, caption, likes, comments, media_type, taken_at, engagement_score, scanned_at')
      .order('engagement_score', { ascending: false })

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({
        topPosts: [],
        byPlatform: { instagram: { avg_engagement: 0, post_count: 0 }, tiktok: { avg_engagement: 0, post_count: 0 } },
        totalScanned: 0,
        lastScanned: null,
      })
    }

    // Top 5 by engagement_score
    const topPosts = rows.slice(0, 5).map(p => ({
      artist_name: p.artist_name,
      caption: (p.caption || '').slice(0, 60),
      likes: p.likes ?? 0,
      comments: p.comments ?? 0,
      engagement_score: p.engagement_score ?? 0,
      media_type: p.media_type,
      taken_at: p.taken_at,
    }))

    // By platform — infer from media_type or artist_name if no platform field
    // post_performance uses artist_name; we treat all as instagram unless media_type hints tiktok
    const instagramRows = rows.filter(p => !String(p.media_type || '').toLowerCase().includes('tiktok'))
    const tiktokRows = rows.filter(p => String(p.media_type || '').toLowerCase().includes('tiktok'))

    const avg = (arr: typeof rows) =>
      arr.length === 0
        ? 0
        : Math.round(arr.reduce((s, p) => s + (p.engagement_score ?? 0), 0) / arr.length)

    const byPlatform = {
      instagram: { avg_engagement: avg(instagramRows), post_count: instagramRows.length },
      tiktok: { avg_engagement: avg(tiktokRows), post_count: tiktokRows.length },
    }

    // Most recent scan timestamp
    const lastScanned = rows.reduce((latest: string | null, p) => {
      if (!p.scanned_at) return latest
      if (!latest) return p.scanned_at
      return p.scanned_at > latest ? p.scanned_at : latest
    }, null)

    return NextResponse.json({
      topPosts,
      byPlatform,
      totalScanned: rows.length,
      lastScanned,
    })
  } catch {
    return NextResponse.json({
      topPosts: [],
      byPlatform: { instagram: { avg_engagement: 0, post_count: 0 }, tiktok: { avg_engagement: 0, post_count: 0 } },
      totalScanned: 0,
      lastScanned: null,
    })
  }
}
