import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireConfirmed } from '@/lib/require-confirmed'
import { requestCheckRegistry } from '@/lib/rules/checks/requestChecks'

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
  /** Mixed carousel slides (images + videos). If present and length >= 2,
   *  replaces image_urls and child containers are created per-type. */
  media_items?: Array<{ url: string; is_video: boolean }>
  user_tags?: UserTag[]
  first_comment?: string
  hashtags?: string[]
  location_id?: string
  /**
   * REELS only. Millisecond offset into the video to use as the cover frame.
   * Before this landed, Signal Lab had no way to override Meta's default
   * (first frame) — the cover picker UI generates this from the extracted
   * 6-frame strip. 0 = first frame; > duration gets clamped server-side.
   */
  thumb_offset?: number
  /**
   * REELS only. If true (default on IG), the Reel also lands on the main
   * grid. Toggleable in the chain details panel.
   */
  share_to_feed?: boolean
  /**
   * IG collab — single username invited as co-author. Graph API v25 accepts
   * a `collaborators` field (JSON array of usernames) on the media container.
   * Post only lands on collaborator's grid after they accept the invite.
   */
  collab_with?: string | null
  /**
   * Multiple collaborators. UI currently sends first-comment-tag style; this
   * path lands them as official IG Collab co-authors. Each must accept the
   * invite before the post shows on their grid.
   */
  collaborators?: string[]
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

  // Pre-Meta URL-shape guard (rule slug: platform_media_url_shape). Meta Graph
  // can only fetch public HTTPS URLs — data:, blob:, localhost, http: silently
  // fail on their side. This rejects them with a clear error BEFORE we waste
  // an API call. Running the check directly (not via the brain) keeps this
  // path tight; brain logging happens on the chainCaptionGen path instead.
  const urlCheck = requestCheckRegistry.platformMediaUrlShape(body as unknown as Record<string, unknown>, {} as any)
  if (!urlCheck.passed) {
    return NextResponse.json({ error: urlCheck.detail || 'Invalid media URL shape' }, { status: 400 })
  }
  const {
    caption,
    image_url,
    video_url,
    handle,
    post_format,
    image_urls,
    media_items,
    user_tags,
    first_comment,
    hashtags,
    location_id,
    collab_with,
    collaborators,
    thumb_offset,
    share_to_feed,
  } = body

  // `collab_with` is a single handle; `collaborators` is an array. Merge and
  // dedupe so the request body can use either shape without losing data.
  const collabList = [
    ...(collab_with ? [collab_with] : []),
    ...(Array.isArray(collaborators) ? collaborators : []),
  ]
    .map(c => (c || '').replace(/^@/, '').trim())
    .filter(Boolean)
  const uniqCollabs = Array.from(new Set(collabList))

  // ── Validate presence of media ─────────────────────────────────────────────
  const hasMixedCarousel = Array.isArray(media_items) && media_items.length >= 2
  const isCarousel = hasMixedCarousel || (Array.isArray(image_urls) && image_urls.length >= 2)
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
      // Build a unified slide list. If media_items was sent, use that (mixed
      // images + videos). Otherwise fall back to image_urls.
      const slides: Array<{ url: string; is_video: boolean }> = hasMixedCarousel
        ? media_items!
        : image_urls!.map(url => ({ url, is_video: false }))

      // 1. Create child containers, one per slide. Videos need media_type=VIDEO
      //    and video_url; images use image_url (no media_type for default IMAGE).
      //    FINISHED-check loop below polls each child to status_code=FINISHED
      //    because VIDEO children aren't immediately publishable.
      const childIds: string[] = []
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i]
        const slideTags = (user_tags || []).filter(t => (t.slide_index ?? 0) === i)
        const childBody: Record<string, string> = {
          is_carousel_item: 'true',
          access_token: token,
        }
        if (slide.is_video) {
          childBody.media_type = 'VIDEO'
          childBody.video_url = slide.url
        } else {
          childBody.image_url = slide.url
        }
        if (slideTags.length && !slide.is_video) {
          childBody.user_tags = JSON.stringify(slideTags.map(({ username, x, y }) => ({ username, x, y })))
        }
        const child = await graphPost(`/${platform_user_id}/media`, childBody)
        childIds.push(child.id)
      }

      // 1b. Poll each child container until status_code = FINISHED. IG won't
      //     let us create the parent CAROUSEL while any child is still
      //     IN_PROGRESS (video transcoding server-side can take 30–240s per
      //     clip). We poll ALL children in parallel (so the slowest video
      //     bounds total wait, not the sum) and HARD FAIL on deadline — the
      //     old code silently fell through on timeout and then created a
      //     parent container that Meta rejected with a cryptic error. That
      //     was the #1 cause of "publish spinner forever, abandon, post
      //     manually".
      if (hasMixedCarousel) {
        const perChildDeadlineMs = 300_000 // 5 min per video child
        await Promise.all(
          childIds.map(async (childId, idx) => {
            const deadline = Date.now() + perChildDeadlineMs
            let lastStatus = 'IN_PROGRESS'
            while (Date.now() < deadline) {
              const statusRes = await fetch(`${GRAPH}/${childId}?fields=status_code&access_token=${encodeURIComponent(token)}`)
              const statusJson = (await statusRes.json()) as { status_code?: string; error?: { message?: string } }
              lastStatus = statusJson.status_code || lastStatus
              if (lastStatus === 'FINISHED') return
              if (lastStatus === 'ERROR' || lastStatus === 'EXPIRED') {
                throw new Error(`child ${idx + 1}/${childIds.length} status=${lastStatus}${statusJson.error?.message ? ` (${statusJson.error.message})` : ''}`)
              }
              await new Promise(r => setTimeout(r, 3000))
            }
            throw new Error(`child ${idx + 1}/${childIds.length} still ${lastStatus} after ${Math.round(perChildDeadlineMs / 1000)}s — IG servers are slow right now, try again in a minute`)
          }),
        ).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e)
          throw new Error(`carousel child processing failed: ${msg}`)
        })
      }

      // 2. Create the parent CAROUSEL container
      const parentBody: Record<string, string> = {
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        access_token: token,
      }
      if (caption) parentBody.caption = caption
      if (location_id) parentBody.location_id = location_id
      if (uniqCollabs.length) parentBody.collaborators = JSON.stringify(uniqCollabs)
      const parent = await graphPost(`/${platform_user_id}/media`, parentBody)

      // 3. Publish the parent
      const published = await graphPost(`/${platform_user_id}/media_publish`, {
        creation_id: parent.id,
        access_token: token,
      })
      publishedId = published.id
      loggedMediaUrls = hasMixedCarousel ? media_items!.map(m => m.url) : image_urls!
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

      // REELS-only extras — Meta silently ignores these on IMAGE containers,
      // but we scope them anyway so the API surface stays clean.
      if (video_url) {
        if (typeof thumb_offset === 'number' && Number.isFinite(thumb_offset) && thumb_offset >= 0) {
          containerBody.thumb_offset = String(Math.round(thumb_offset))
        }
        if (share_to_feed === false) {
          containerBody.share_to_feed = 'false'
        }
      }

      // Single-image user tags — only apply where no slide_index or slide_index === 0
      if (!video_url && user_tags && user_tags.length) {
        const singleTags = user_tags
          .filter(t => t.slide_index === undefined || t.slide_index === 0)
          .map(({ username, x, y }) => ({ username, x, y }))
        if (singleTags.length) containerBody.user_tags = JSON.stringify(singleTags)
      }
      if (location_id) containerBody.location_id = location_id
      if (uniqCollabs.length) containerBody.collaborators = JSON.stringify(uniqCollabs)

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
