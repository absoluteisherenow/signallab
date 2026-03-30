import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// TikTok requires video content — text-only posts not supported
// This route handles video URL publishing via the Content Posting API
export async function POST(req: NextRequest) {
  const { caption, video_url, handle } = await req.json()

  if (!caption) return NextResponse.json({ error: 'Caption required' }, { status: 400 })
  if (!video_url) return NextResponse.json({ error: 'TikTok requires a video. Attach one from your media library.' }, { status: 400 })

  const query = supabase
    .from('connected_social_accounts')
    .select('*')
    .eq('platform', 'tiktok')
  if (handle) query.eq('handle', handle)

  const { data: account } = await query.limit(1).single()
  if (!account) return NextResponse.json({ error: 'No TikTok account connected' }, { status: 400 })

  try {
    // TikTok Content Posting API — URL-based upload
    const postRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: caption.substring(0, 150), // TikTok title limit
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url,
        },
      }),
    })

    const postData = await postRes.json()
    if (postData.error?.code && postData.error.code !== 'ok') {
      throw new Error(postData.error.message || 'TikTok post failed')
    }

    await supabase.from('social_posts').insert({
      platform: 'tiktok',
      handle: account.handle,
      caption,
      media_urls: [video_url],
      posted_at: new Date().toISOString(),
      status: 'posted',
      platform_post_id: postData.data?.publish_id,
    })

    return NextResponse.json({ success: true, publish_id: postData.data?.publish_id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await supabase.from('social_posts').insert({
      platform: 'tiktok',
      handle: account.handle,
      caption,
      status: 'failed',
      error_message: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
