import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { caption, image_url, video_url, handle, post_format } = await req.json()

  if (!image_url && !video_url) {
    return NextResponse.json({ error: 'Instagram requires an image or video.' }, { status: 400 })
  }

  // Get stored credentials
  const query = supabase
    .from('connected_social_accounts')
    .select('*')
    .eq('platform', 'instagram')
  if (handle) query.eq('handle', handle)

  const { data: accounts } = await query.limit(1).single()
  if (!accounts) return NextResponse.json({ error: 'No Instagram account connected' }, { status: 400 })

  const { platform_user_id, access_token } = accounts
  const token = access_token

  try {
    // 1. Create media container
    const containerBody: Record<string, string> = {
      access_token: token,
    }

    // Add caption (not supported on Stories but won't error)
    if (caption) containerBody.caption = caption

    const format = (post_format || 'post').toLowerCase()

    if (format === 'story') {
      // Story — image or video
      containerBody.media_type = 'STORIES'
      if (video_url) {
        containerBody.video_url = video_url
      } else if (image_url) {
        containerBody.image_url = image_url
      }
    } else if (format === 'reel' && video_url) {
      // Reel — video only
      containerBody.media_type = 'REELS'
      containerBody.video_url = video_url
    } else if (video_url) {
      // Video feed post
      containerBody.media_type = 'REELS'
      containerBody.video_url = video_url
    } else {
      // Standard image feed post
      containerBody.image_url = image_url
    }

    const containerRes = await fetch(
      `https://graph.instagram.com/v25.0/${platform_user_id}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerBody),
      }
    )
    const container = await containerRes.json()
    if (container.error) throw new Error(container.error.message)

    const mediaId = container.id

    // 2. For video/reels, poll until processing is done
    if (video_url) {
      let status = 'IN_PROGRESS'
      let attempts = 0
      while (status === 'IN_PROGRESS' && attempts < 30) {
        await new Promise(r => setTimeout(r, 2000))
        const checkRes = await fetch(
          `https://graph.instagram.com/v25.0/${mediaId}?fields=status_code&access_token=${token}`
        )
        const checkData = await checkRes.json()
        status = checkData.status_code || 'FINISHED'
        attempts++
      }
      if (status === 'ERROR') throw new Error('Video processing failed on Instagram')
    }

    // 3. Publish the container
    const publishRes = await fetch(
      `https://graph.instagram.com/v25.0/${platform_user_id}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: mediaId,
          access_token: token,
        }),
      }
    )
    const published = await publishRes.json()
    if (published.error) throw new Error(published.error.message)

    // 4. Log to social_posts
    await supabase.from('social_posts').insert({
      platform: 'instagram',
      handle: accounts.handle,
      caption: caption || '',
      media_urls: [image_url || video_url].filter(Boolean),
      posted_at: new Date().toISOString(),
      status: 'posted',
      platform_post_id: published.id,
    })

    return NextResponse.json({ success: true, post_id: published.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await supabase.from('social_posts').insert({
      platform: 'instagram',
      handle: accounts.handle,
      caption: caption || '',
      status: 'failed',
      error_message: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
