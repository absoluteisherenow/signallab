import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { caption, image_url, handle } = await req.json()

  if (!caption) return NextResponse.json({ error: 'Caption required' }, { status: 400 })

  // Get stored credentials
  const query = supabase
    .from('connected_social_accounts')
    .select('*')
    .eq('platform', 'instagram')
  if (handle) query.eq('handle', handle)

  const { data: accounts } = await query.limit(1).single()
  if (!accounts) return NextResponse.json({ error: 'No Instagram account connected' }, { status: 400 })

  const { platform_user_id, page_access_token } = accounts

  try {
    let mediaId: string

    if (image_url) {
      // 1a. Create image container
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${platform_user_id}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url,
            caption,
            access_token: page_access_token,
          }),
        }
      )
      const container = await containerRes.json()
      if (container.error) throw new Error(container.error.message)
      mediaId = container.id
    } else {
      // 1b. Text-only / caption-only post (requires image on Instagram — use a placeholder or skip)
      return NextResponse.json({ error: 'Instagram requires an image. Use the media library to attach one.' }, { status: 400 })
    }

    // 2. Publish the container
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${platform_user_id}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: mediaId,
          access_token: page_access_token,
        }),
      }
    )
    const published = await publishRes.json()
    if (published.error) throw new Error(published.error.message)

    // 3. Log to social_posts
    await supabase.from('social_posts').insert({
      platform: 'instagram',
      handle: accounts.handle,
      caption,
      media_urls: image_url ? [image_url] : [],
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
      caption,
      status: 'failed',
      error_message: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
