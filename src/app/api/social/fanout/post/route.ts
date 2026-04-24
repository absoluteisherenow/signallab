import { NextRequest, NextResponse } from 'next/server'
import { requireConfirmed } from '@/lib/require-confirmed'
import { requireUser } from '@/lib/api-auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLATFORM_LIMITS } from '@/components/broadcast/chain/types'
import { publishTikTok } from '@/lib/social-publish/tiktok'
import { POST as instagramPost } from '@/app/api/social/instagram/post/route'
import { POST as youtubePost } from '@/app/api/social/youtube/post/route'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const runtime = 'nodejs'

/**
 * Fanout publish — async job pattern.
 *
 * The old single-request flow could spend 2–5 minutes waiting on Meta to
 * finish transcoding carousel videos, which blew past the Cloudflare Worker
 * wall-clock limit AND left the user staring at a frozen spinner with no
 * feedback. Now:
 *   1. Client POSTs the fanout body → we insert a `publish_jobs` row, kick
 *      the heavy work off via `ctx.waitUntil`, return `{job_id}` immediately.
 *   2. Client polls `/api/social/fanout/status/{id}` every few seconds,
 *      reads `phase` (human string) + `status` (queued|working|done|failed).
 *   3. When status = done, result holds the per-platform outcomes.
 *
 * Backward-compat: pass `?sync=1` to block until completion (used by tests
 * and scheduled-post callers that already expect sync semantics).
 */

type FanoutPayload = {
  platforms: Array<'instagram' | 'tiktok' | 'threads' | 'youtube'>
  caption: string
  media_url: string | null
  image_urls: string[] | null
  media_items: Array<{ url: string; is_video: boolean }> | null
  is_video: boolean
  user_tags: unknown
  first_comment: string | null
  hashtags: string[] | null
  collaborators: string[] | null
  location_id: string | null
  alt_text: string | null
  share_to_feed: boolean | null
  thumb_offset: number | null
  cookie: string
  base_url: string
}

type FanoutResult = {
  success: boolean
  results: Array<{ platform: string; ok: boolean; post_id?: string; error?: string }>
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const gate = requireConfirmed(body)
  if (gate) return gate

  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const { user, serviceClient } = auth

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
  } = body as Partial<FanoutPayload>

  if (!platforms || !platforms.length) {
    return NextResponse.json({ error: 'platforms required' }, { status: 400 })
  }
  if (!caption) {
    return NextResponse.json({ error: 'caption required' }, { status: 400 })
  }

  const payload: FanoutPayload = {
    platforms,
    caption,
    media_url: media_url ?? null,
    image_urls: image_urls ?? null,
    media_items: media_items ?? null,
    is_video: !!is_video,
    user_tags: user_tags ?? null,
    first_comment: first_comment ?? null,
    hashtags: hashtags ?? null,
    collaborators: collaborators ?? null,
    location_id: location_id ?? null,
    alt_text: alt_text ?? null,
    share_to_feed: share_to_feed ?? null,
    thumb_offset: thumb_offset ?? null,
    cookie: req.headers.get('cookie') || '',
    base_url: new URL(req.url).origin,
  }

  // Sync mode — legacy callers (scheduled-post cron). Runs inline, returns
  // the final result. Not recommended for user-facing paths because the
  // Worker can time out mid-publish.
  const isSync = new URL(req.url).searchParams.get('sync') === '1'
  if (isSync) {
    const result = await runFanout(payload)
    return NextResponse.json(result)
  }

  // Async mode — insert row, kick off ctx.waitUntil, return job id.
  const { data: job, error } = await serviceClient
    .from('publish_jobs')
    .insert({
      user_id: user.id,
      status: 'queued',
      phase: 'queued',
      payload: { ...payload, cookie: '[redacted]' }, // don't persist cookies
    })
    .select('id')
    .single()
  if (error || !job) {
    return NextResponse.json({ error: error?.message || 'failed to queue job' }, { status: 500 })
  }

  const jobId = (job as { id: string }).id
  const cfCtx = await getCloudflareContext({ async: true })
  cfCtx.ctx.waitUntil(runFanoutJob(jobId, payload, serviceClient))

  return NextResponse.json({ job_id: jobId })
}

async function runFanoutJob(
  jobId: string,
  payload: FanoutPayload,
  serviceClient: SupabaseClient,
) {
  const setPhase = async (status: string, phase: string) => {
    await serviceClient
      .from('publish_jobs')
      .update({ status, phase, updated_at: new Date().toISOString() })
      .eq('id', jobId)
  }
  try {
    await setPhase('working', 'publishing to platforms…')
    const result = await runFanout(payload, (p) => { void setPhase('working', p) })
    await serviceClient
      .from('publish_jobs')
      .update({
        status: result.success ? 'done' : (result.results.some(r => r.ok) ? 'done' : 'failed'),
        phase: result.success ? 'published' : 'finished with errors',
        result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await serviceClient
      .from('publish_jobs')
      .update({ status: 'failed', phase: 'failed', error: msg, updated_at: new Date().toISOString() })
      .eq('id', jobId)
  }
}

async function runFanout(
  payload: FanoutPayload,
  onPhase?: (phase: string) => void,
): Promise<FanoutResult> {
  const {
    platforms, caption, media_url, image_urls, media_items, is_video,
    user_tags, first_comment, hashtags, collaborators, location_id,
    alt_text, share_to_feed, thumb_offset, cookie, base_url,
  } = payload

  const results: FanoutResult['results'] = []

  for (const platform of platforms) {
    onPhase?.(`publishing to ${platform}…`)
    const limit = PLATFORM_LIMITS[platform] ?? 2200
    let trimmedCaption = caption
    if (caption.length > limit) {
      const head = caption.slice(0, limit - 1)
      const lastSpace = head.lastIndexOf(' ')
      const cut = lastSpace > limit * 0.7 ? head.slice(0, lastSpace) : head
      trimmedCaption = cut.replace(/[\s,;:.!?-]+$/, '') + '…'
    }

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

    const handler = endpoint === '/api/social/instagram/post' ? instagramPost : youtubePost
    const mixedHasVideo = Array.isArray(media_items) && media_items.some(m => m.is_video)
    if (platform === 'instagram' && (mixedHasVideo || is_video)) {
      onPhase?.('Meta is processing video (up to 5 min)…')
    } else if (platform === 'instagram') {
      onPhase?.('creating Instagram post…')
    }
    try {
      const subReq = new Request(new URL(endpoint, base_url).toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
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
  return { success: allOk, results }
}
