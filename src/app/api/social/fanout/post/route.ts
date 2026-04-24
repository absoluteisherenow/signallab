import { NextRequest, NextResponse } from 'next/server'
import { requireConfirmed } from '@/lib/require-confirmed'
import { PLATFORM_LIMITS } from '@/components/broadcast/chain/types'
import { publishTikTok } from '@/lib/social-publish/tiktok'
import { POST as instagramPost } from '@/app/api/social/instagram/post/route'
import { POST as youtubePost } from '@/app/api/social/youtube/post/route'

export const runtime = 'nodejs'

/**
 * Fanout publish — gates once, then calls each platform's /post endpoint
 * server-side with the shared caption + media. Caption is auto-trimmed per
 * platform limit; YouTube auto-appends #Shorts downstream.
 *
 * Body shape:
 *   {
 *     platforms: Platform[],          // ordered, primary first
 *     caption: string,                 // master caption
 *     media_url: string | null,        // R2 URL (already uploaded)
 *     is_video: boolean,
 *     user_tags, first_comment, hashtags, collaborators, location_id,
 *     alt_text, share_to_feed, thumb_offset,
 *     confirmed: true
 *   }
 *
 * Response: { success, results: [{ platform, ok, post_id?, error? }] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const gate = requireConfirmed(body)
  if (gate) return gate

  const {
    platforms,
    caption,
    media_url,
    image_urls,
    media_items,
    is_video,
    user_tags,
    first_comment,
    hashtags,
    collaborators,
    location_id,
    alt_text,
    share_to_feed,
    thumb_offset,
  } = body as {
    platforms?: Array<'instagram' | 'tiktok' | 'threads' | 'youtube'>
    caption?: string
    media_url?: string | null
    image_urls?: string[] | null
    media_items?: Array<{ url: string; is_video: boolean }> | null
    is_video?: boolean
    user_tags?: unknown
    first_comment?: string | null
    hashtags?: string[] | null
    collaborators?: string[] | null
    location_id?: string | null
    alt_text?: string | null
    share_to_feed?: boolean
    thumb_offset?: number | null
  }

  if (!platforms || !platforms.length) {
    return NextResponse.json({ error: 'platforms required' }, { status: 400 })
  }
  if (!caption) {
    return NextResponse.json({ error: 'caption required' }, { status: 400 })
  }

  const results: Array<{ platform: string; ok: boolean; post_id?: string; error?: string }> = []

  for (const platform of platforms) {
    const limit = PLATFORM_LIMITS[platform] ?? 2200
    const trimmedCaption = caption.length > limit ? caption.slice(0, limit) : caption

    // TikTok: call the publish function directly. Cloudflare Workers blocks
    // same-zone HTTP loopback (returns 522) so we can NOT fetch our own
    // /api/social/tiktok/post endpoint here — has to be in-process.
    if (platform === 'tiktok') {
      const r = await publishTikTok({
        caption: trimmedCaption,
        video_url: media_url || '',
      })
      if (r.ok && r.publish_id) {
        results.push({ platform, ok: true, post_id: r.publish_id })
      } else {
        results.push({ platform, ok: false, error: r.error || 'publish failed' })
      }
      continue
    }

    let endpoint: string
    let postBody: Record<string, unknown>

    if (platform === 'youtube') {
      endpoint = '/api/social/youtube/post'
      postBody = {
        caption: trimmedCaption,
        video_url: media_url,
        confirmed: true,
      }
    } else {
      // Instagram + Threads share the IG Graph endpoint.
      endpoint = '/api/social/instagram/post'
      const firstCollab = Array.isArray(collaborators) && collaborators.length
        ? (collaborators[0] || '').replace(/^@/, '').trim() || null
        : null
      const hasMixedCarousel = Array.isArray(media_items) && media_items.length >= 2
      const isCarousel = Array.isArray(image_urls) && image_urls.length >= 2 && !is_video
      postBody = {
        caption: trimmedCaption,
        user_tags: user_tags ?? null,
        first_comment: first_comment ?? null,
        hashtags: hashtags ?? null,
        collab_with: firstCollab,
        location_id: location_id ?? null,
        alt_text: alt_text ?? null,
        share_to_feed: share_to_feed ?? null,
        thumb_offset: thumb_offset ?? null,
        confirmed: true,
      }
      if (hasMixedCarousel) {
        // Mixed carousel wins over reel path — if the user queued multiple
        // slides (video or not), we publish as CAROUSEL not as single reel.
        postBody.media_items = media_items
        postBody.post_format = 'post'
      } else if (is_video) {
        postBody.video_url = media_url
        postBody.post_format = 'reel'
      } else if (isCarousel) {
        postBody.image_urls = image_urls
        postBody.post_format = 'post'
      } else {
        postBody.image_url = media_url
        postBody.post_format = 'post'
      }
    }

    // Call the platform's POST handler in-process. Same-zone loopback
    // `fetch('/api/social/instagram/post')` returns 522 on Cloudflare Workers,
    // which is why the old behaviour silently failed for IG/Threads/YouTube —
    // only TikTok (already inlined) worked. Direct function invocation skips
    // the network hop and preserves cookies via the constructed Request.
    const handler = endpoint === '/api/social/instagram/post' ? instagramPost : youtubePost
    try {
      const subReq = new Request(new URL(endpoint, req.url).toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: req.headers.get('cookie') || '',
        },
        body: JSON.stringify(postBody),
      }) as NextRequest
      const resp = await handler(subReq)
      const json = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        post_id?: string
        publish_id?: string
        error?: string
      }
      const postId = json.post_id || json.publish_id
      if (resp.ok && postId) {
        results.push({ platform, ok: true, post_id: postId })
      } else {
        results.push({ platform, ok: false, error: json.error || `publish failed (${resp.status})` })
      }
    } catch (e) {
      results.push({ platform, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const allOk = results.every(r => r.ok)
  return NextResponse.json({ success: allOk, results })
}
