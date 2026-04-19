import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireConfirmed } from '@/lib/require-confirmed'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const GRAPH = 'https://graph.facebook.com/v25.0'

interface UserTag {
  username: string
  x: number          // 0-1 normalised
  y: number          // 0-1 normalised
  slide_index?: number
}

interface PostBody {
  // existing fields (backward compatible)
  caption?: string
  image_url?: string
  video_url?: string
  handle?: string
  post_format?: string
  // new optional fields (additive)
  image_urls?: string[]
  user_tags?: UserTag[]
  first_comment?: string
  hashtags?: string[]
  location_id?: string
  /**
   * Explicit user confirmation gate — see HARD RULE feedback_approve_before_send.md.
   * POST without `confirmed` returns a 400 so the caller is forced through the
   * approval modal (via @/lib/outbound useGatedSend).
   */
  confirmed?: boolean
}

async function graphPost(path: string, body: Record<string, string>) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data
}

// Wait for a video/reels container to finish processing on Meta's side.
async function waitForContainer(id: string, token: string) {
  let status = 'IN_PROGRESS'
  let attempts = 0
  while (status === 'IN_PROGRESS' && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${GRAPH}/${id}?fields=status_code&access_token=${token}`)
    const check = await res.json()
    status = check.status_code || 'FINISHED'
    attempts++
  }
  if (status === 'ERROR') throw new Error('Video processing failed on Instagram')
}

// Compose the first-comment body: user's first_comment text + hashtags appended.
function buildFirstComment(firstComment?: string, hashtags?: string[]): string | null {
  const tagBlock = (hashtags || [])
    .filter(Boolean)
    .map(h => h.trim())
    .filter(Boolean)
    .map(h => (h.startsWith('#') ? h : '#' + h))
    .join(' ')
  const parts = [firstComment?.trim(), tagBlock].filter(Boolean)
  if (!parts.length) return null
  return parts.join('\n\n')
}

// Attempt to post a first comment. Never throws — returns status string.
async function tryPostFirstComment(postId: string, message: string, token: string): Promise<'posted' | 'failed'> {
  try {
    await graphPost(`/${postId}/comments`, { message, access_token: token })
    return 'posted'
  } catch (err) {
    console.warn('[ig post] first_comment failed:', err instanceof Error ? err.message : err)
    return 'failed'
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as PostBody
  const gate = requireConfirmed(body)
  if (gate) return gate
  const {
    caption,
    image_url,
    video_url,
    handle,
    post_format,
    image_urls,
    user_tags,
    first_comment,
    hashtags,
    location_id,
  } = body

  // ── Validate presence of media ─────────────────────────────────────────────
  const isCarousel = Array.isArray(image_urls) && image_urls.length >= 2
  if (!isCarousel && !image_url && !video_url) {
    return NextResponse.json({ error: 'Instagram requires an image or video.' }, { status: 400 })
  }

  // ── Lookup account ─────────────────────────────────────────────────────────
  const q = supabase
    .from('connected_social_accounts')
    .select('*')
    .eq('platform', 'instagram')
    .order('created_at', { ascending: false })
  if (handle) q.eq('handle', handle)
  const { data: accounts } = await q.limit(1).single()
  if (!accounts) return NextResponse.json({ error: 'No Instagram account connected' }, { status: 400 })

  const { platform_user_id, access_token } = accounts as { platform_user_id: string; access_token: string }
  const token = access_token

  try {
    let publishedId: string
    let loggedMediaUrls: string[]

    // ── Carousel path ────────────────────────────────────────────────────────
    if (isCarousel) {
      // 1. Create child containers, one per slide
      const childIds: string[] = []
      for (let i = 0; i < image_urls!.length; i++) {
        const slideTags = (user_tags || []).filter(t => (t.slide_index ?? 0) === i)
        const childBody: Record<string, string> = {
          image_url: image_urls![i],
          is_carousel_item: 'true',
          access_token: token,
        }
        if (slideTags.length) {
          childBody.user_tags = JSON.stringify(slideTags.map(({ username, x, y }) => ({ username, x, y })))
        }
        const child = await graphPost(`/${platform_user_id}/media`, childBody)
        childIds.push(child.id)
      }

      // 2. Create the parent CAROUSEL container
      const parentBody: Record<string, string> = {
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        access_token: token,
      }
      if (caption) parentBody.caption = caption
      if (location_id) parentBody.location_id = location_id
      const parent = await graphPost(`/${platform_user_id}/media`, parentBody)

      // 3. Publish the parent
      const published = await graphPost(`/${platform_user_id}/media_publish`, {
        creation_id: parent.id,
        access_token: token,
      })
      publishedId = published.id
      loggedMediaUrls = image_urls!
    } else {
      // ── Single-media path (existing behaviour, plus user_tags/location) ────
      const containerBody: Record<string, string> = { access_token: token }
      if (caption) containerBody.caption = caption
      const format = (post_format || 'post').toLowerCase()

      if (format === 'story') {
        containerBody.media_type = 'STORIES'
        if (video_url) containerBody.video_url = video_url
        else if (image_url) containerBody.image_url = image_url
      } else if (format === 'reel' && video_url) {
        containerBody.media_type = 'REELS'
        containerBody.video_url = video_url
      } else if (video_url) {
        containerBody.media_type = 'REELS'
        containerBody.video_url = video_url
      } else {
        containerBody.image_url = image_url!
      }

      // Single-image user tags — only apply where no slide_index or slide_index === 0
      if (!video_url && user_tags && user_tags.length) {
        const singleTags = user_tags
          .filter(t => t.slide_index === undefined || t.slide_index === 0)
          .map(({ username, x, y }) => ({ username, x, y }))
        if (singleTags.length) containerBody.user_tags = JSON.stringify(singleTags)
      }
      if (location_id) containerBody.location_id = location_id

      const container = await graphPost(`/${platform_user_id}/media`, containerBody)
      const mediaId: string = container.id

      // Video/reels need processing poll
      if (video_url) await waitForContainer(mediaId, token)

      const published = await graphPost(`/${platform_user_id}/media_publish`, {
        creation_id: mediaId,
        access_token: token,
      })
      publishedId = published.id
      loggedMediaUrls = [image_url || video_url].filter(Boolean) as string[]
    }

    // ── First comment (additive; failure never fails the post) ───────────────
    let first_comment_status: 'posted' | 'failed' | undefined
    const commentText = buildFirstComment(first_comment, hashtags)
    if (commentText) {
      first_comment_status = await tryPostFirstComment(publishedId, commentText, token)
    }

    // ── Log to social_posts ──────────────────────────────────────────────────
    await supabase.from('social_posts').insert({
      platform: 'instagram',
      handle: accounts.handle,
      caption: caption || '',
      media_urls: loggedMediaUrls,
      posted_at: new Date().toISOString(),
      status: 'posted',
      platform_post_id: publishedId,
    })

    return NextResponse.json({
      success: true,
      post_id: publishedId,
      ...(first_comment_status ? { first_comment_status } : {}),
    })
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
