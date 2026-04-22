/**
 * Publisher cron — auto-publishes scheduled IG + TikTok posts whose scheduled_at <= now().
 *
 * Wire-up (Cloudflare Workers via OpenNext):
 *   Add a cron trigger in `wrangler.toml` (or CF dashboard → Workers → Triggers → Cron Triggers):
 *     [triggers]
 *     crons = ["*\/5 * * * *"]   # every 5 minutes (remove the backslash)
 *   Then add a `scheduled` handler in your worker entry that fetches:
 *     await fetch(`${self_url}/api/crons/publish-scheduled`, {
 *       headers: { Authorization: `Bearer ${env.CRON_SECRET}` }
 *     })
 *   (OpenNext: export a `scheduled` hook in `open-next.config.ts` OR hit this endpoint
 *    from an external scheduler / `cloudflare:workers` scheduled event that calls the Worker URL.)
 *
 * Env required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (server-side only)
 *   - CRON_SECRET                (optional in dev; required in prod)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ScheduledPost = {
  id: string
  platform: string
  caption: string | null
  format: string | null
  scheduled_at: string
  status: string
  media_url: string | null
  media_urls: string[] | null
  user_tags: unknown
  first_comment: string | null
  hashtags: unknown
  collaborators: string[] | null
  location_id: string | null
  location_name: string | null
  post_group_id: string | null
  preview_approved_at: string | null
  published_post_id: string | null
  publish_error: string | null
  publish_attempts: number | null
  posted_at: string | null
}

const MAX_ATTEMPTS = 5
const BATCH_LIMIT = 10

function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const u = url.toLowerCase().split('?')[0]
  return u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.m4v') || u.endsWith('.webm')
}

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'publish-scheduled')
  if (unauth) return unauth

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'missing supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // --- Fetch due rows ---
  const nowIso = new Date().toISOString()
  const { data: rows, error: fetchErr } = await admin
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'scheduled')
    .in('platform', ['instagram', 'tiktok', 'youtube'])
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (fetchErr) {
    console.error('[publish-scheduled] fetch error', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const due = (rows || []) as ScheduledPost[]
  const posted: Array<{ id: string; post_id: string }> = []
  const failed: Array<{ id: string; error: string; attempts: number; final: boolean }> = []

  for (const row of due) {
    const nextAttempts = (row.publish_attempts || 0) + 1

    // Mark publishing + bump attempts (optimistic)
    const { error: lockErr } = await admin
      .from('scheduled_posts')
      .update({ status: 'publishing', publish_attempts: nextAttempts })
      .eq('id', row.id)
      .eq('status', 'scheduled') // only grab rows still scheduled — avoids double-publish

    if (lockErr) {
      console.error('[publish-scheduled] lock error', row.id, lockErr)
      continue
    }

    // HARD RULE: feedback_approve_before_send — every scheduled row must
    // carry preview_approved_at (stamped server-side at /api/schedule when
    // the user confirmed). Rows without it should never be here, but we
    // belt-and-brace check anyway to be absolutely certain nothing autoposts
    // unapproved.
    if (!row.preview_approved_at) {
      await admin
        .from('scheduled_posts')
        .update({
          status: 'failed',
          publish_error: 'refused: preview_approved_at missing',
        })
        .eq('id', row.id)
      failed.push({ id: row.id, error: 'preview_approved_at missing', attempts: nextAttempts, final: true })
      continue
    }

    // Build body — shape differs per platform
    const mediaUrls = Array.isArray(row.media_urls) ? row.media_urls.filter(Boolean) : []
    const firstCollab = Array.isArray(row.collaborators) && row.collaborators.length
      ? (row.collaborators[0] || '').replace(/^@/, '').trim() || null
      : null

    let postUrl: string
    let postBody: Record<string, unknown>

    if (row.platform === 'tiktok') {
      // TikTok — video-only, URL pull
      const video = row.media_url || (mediaUrls.length ? mediaUrls[0] : null)
      postUrl = new URL('/api/social/tiktok/post', req.url).toString()
      postBody = {
        caption: row.caption || '',
        video_url: video,
        // OUTBOUND_AUTONOMOUS: approved at schedule time (preview_approved_at set).
        confirmed: true,
      }
    } else if (row.platform === 'youtube') {
      // YouTube — video-only, fetched + multipart-uploaded server-side
      const video = row.media_url || (mediaUrls.length ? mediaUrls[0] : null)
      postUrl = new URL('/api/social/youtube/post', req.url).toString()
      postBody = {
        caption: row.caption || '',
        video_url: video,
        confirmed: true,
      }
    } else {
      // Instagram (default)
      const baseBody: Record<string, unknown> = {
        caption: row.caption || '',
        user_tags: row.user_tags ?? null,
        first_comment: row.first_comment ?? null,
        hashtags: row.hashtags ?? null,
        collab_with: firstCollab,
        location_id: row.location_id ?? null,
      }
      if (mediaUrls.length >= 2) {
        postBody = { ...baseBody, image_urls: mediaUrls, post_format: 'carousel' }
      } else if ((row.format || '').toLowerCase() === 'reel' || isVideoUrl(row.media_url)) {
        postBody = { ...baseBody, video_url: row.media_url, post_format: 'reel' }
      } else {
        postBody = { ...baseBody, image_url: row.media_url, post_format: 'post' }
      }
      // OUTBOUND_AUTONOMOUS: approved at schedule time (preview_approved_at set).
      postBody.confirmed = true
      postUrl = new URL('/api/social/instagram/post', req.url).toString()
    }

    let succeeded = false
    let errMsg = ''
    let publishedId: string | null = null

    try {
      const resp = await fetch(postUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(postBody),
      })
      const json = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        post_id?: string
        publish_id?: string
        error?: string
      }
      const returnedId = json?.post_id || json?.publish_id || null
      if (resp.ok && returnedId) {
        succeeded = true
        publishedId = returnedId
      } else {
        errMsg = json?.error || `publish failed (${resp.status})`
      }
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e)
    }

    if (succeeded && publishedId) {
      await admin
        .from('scheduled_posts')
        .update({
          status: 'posted',
          published_post_id: publishedId,
          posted_at: new Date().toISOString(),
          publish_error: null,
        })
        .eq('id', row.id)
      posted.push({ id: row.id, post_id: publishedId })
    } else {
      const isFinal = nextAttempts >= MAX_ATTEMPTS
      await admin
        .from('scheduled_posts')
        .update({
          status: isFinal ? 'failed' : 'scheduled',
          publish_error: errMsg.slice(0, 2000),
        })
        .eq('id', row.id)
      failed.push({ id: row.id, error: errMsg, attempts: nextAttempts, final: isFinal })
    }
  }

  return NextResponse.json({
    processed: due.length,
    posted,
    failed,
  })
}
