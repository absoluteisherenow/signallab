import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { requireCronAuth } from '@/lib/cron-auth'
import { runWithLog } from '@/lib/cron-observability'

// Cloudflare cron (signal-lab-crons): runs daily at 09:00 UTC.
// Fetches engagement for posted scheduled_posts not yet synced (24h+ after
// going live), updates scheduled_posts, AND bridges the row into
// post_performance so the brain's OperatingContext reads real engagement.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

interface ScheduledPostRow {
  id: string
  platform_post_id: string
  user_id: string | null
  scan_id: string | null
  caption: string | null
  format: string | null
  format_type: string | null
  platform: string | null
  posted_at: string | null
}

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'sync-performance')
  if (unauth) return unauth

  return runWithLog('sync-performance', async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { data: posts, error } = await supabase
        .from('scheduled_posts')
        .select('id, platform_post_id, user_id, scan_id, caption, format, format_type, platform, posted_at')
        .eq('status', 'posted')
        .lt('posted_at', cutoff)
        .not('platform_post_id', 'is', null)
        .is('likes', null)
        .limit(50)

      if (error) throw error
      if (!posts?.length) return NextResponse.json({ synced: 0, message: 'No posts pending sync' })

      let synced = 0, failed = 0, bridged = 0

      for (const post of posts as ScheduledPostRow[]) {
        const engagement = await fetchEngagement(post.platform_post_id)
        if (!engagement) { failed++; continue }

        const engagementScore = engagement.likes + engagement.comments * 3

        const { error: updateError } = await supabase
          .from('scheduled_posts')
          .update({
            likes: engagement.likes,
            comments: engagement.comments,
            engagement_score: engagementScore,
          })
          .eq('id', post.id)

        if (updateError) { failed++; continue }
        synced++

        // Bridge to post_performance — the brain's OperatingContext reads from
        // this table. Keyed on scheduled_post_id (unique partial index) so
        // repeated syncs update in place. Populate both naming conventions
        // (likes/actual_likes, engagement_score/estimated_score) so the two
        // existing readers (operatingContext + weekly-content) both work.
        const mediaType = post.format || post.format_type || 'post'
        const bridgeRow = {
          scheduled_post_id: post.id,
          user_id: post.user_id,
          scan_id: post.scan_id,
          caption: post.caption,
          format: mediaType,
          media_type: mediaType,
          platform: post.platform,
          likes: engagement.likes,
          comments: engagement.comments,
          actual_likes: engagement.likes,
          actual_comments: engagement.comments,
          engagement_score: engagementScore,
          estimated_score: engagementScore,
          posted_at: post.posted_at,
          updated_at: new Date().toISOString(),
        }

        const { error: bridgeError } = await supabase
          .from('post_performance')
          .upsert(bridgeRow, { onConflict: 'scheduled_post_id' })

        if (!bridgeError) bridged++
      }

      return NextResponse.json({ synced, bridged, failed, total: posts.length })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await createNotification({ type: 'cron_error', title: 'Sync performance failed', message })
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
