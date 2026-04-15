import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

// Vercel cron: runs daily at 09:00 UTC
// Fetches engagement for posted scheduled_posts not yet synced (24h+ after going live)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function fetchEngagement(platformPostId: string): Promise<{ likes: number; comments: number } | null> {
  const key = process.env.HIKER_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://api.hikerapi.com/v2/media/by/id?id=${encodeURIComponent(platformPostId)}`,
      {
        headers: { 'x-access-key': key, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const media = data?.media || data
    if (!media) return null
    return { likes: media.like_count || 0, comments: media.comment_count || 0 }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: posts, error } = await supabase
      .from('scheduled_posts')
      .select('id, platform_post_id')
      .eq('status', 'posted')
      .lt('posted_at', cutoff)
      .not('platform_post_id', 'is', null)
      .is('likes', null)
      .limit(50)

    if (error) throw error
    if (!posts?.length) return NextResponse.json({ synced: 0, message: 'No posts pending sync' })

    let synced = 0, failed = 0

    for (const post of posts) {
      const engagement = await fetchEngagement(post.platform_post_id)
      if (!engagement) { failed++; continue }

      const { error: updateError } = await supabase
        .from('scheduled_posts')
        .update({
          likes: engagement.likes,
          comments: engagement.comments,
          engagement_score: engagement.likes + engagement.comments * 3,
        })
        .eq('id', post.id)

      if (updateError) { failed++; continue }
      synced++
    }

    return NextResponse.json({ synced, failed, total: posts.length })
  } catch (err: any) {
    await createNotification({ type: 'cron_error', title: 'Sync performance failed', message: err instanceof Error ? err.message : 'Unknown error' })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
