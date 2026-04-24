// ── TikTok publish core ──────────────────────────────────────────────────────
// Extracted from /api/social/tiktok/post/route.ts so the fanout route can call
// it directly instead of doing a same-Worker HTTP loopback (CF returns 522 on
// self-subrequests to the same zone).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const TT = 'https://open.tiktokapis.com/v2'

function sb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

type Account = {
  handle: string
  access_token: string
  refresh_token: string | null
  token_expiry: number | null
}

async function refreshToken(account: Account): Promise<Account | null> {
  if (!account.refresh_token) return null
  try {
    const res = await fetch(`${TT}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token,
      }),
    })
    const data = await res.json() as { error?: unknown; access_token?: string; refresh_token?: string; expires_in?: number }
    if (data.error || !data.access_token) return null
    const expiry = Date.now() + ((data.expires_in ?? 0) * 1000)
    await sb().from('connected_social_accounts').update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || account.refresh_token,
      token_expiry: expiry,
      updated_at: new Date().toISOString(),
    }).eq('platform', 'tiktok').eq('handle', account.handle)
    return { ...account, access_token: data.access_token, token_expiry: expiry }
  } catch {
    return null
  }
}

async function getCreatorInfo(token: string) {
  const res = await fetch(`${TT}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  })
  const data = await res.json() as { error?: { code?: string; message?: string }; data?: { privacy_level_options?: string[] } }
  return { ok: res.ok && data.error?.code === 'ok', data }
}

function pickPrivacy(allowed: string[] | undefined): string {
  // Sandbox/unaudited TT apps (client key prefix "sb") can ONLY post to
  // private accounts. Force SELF_ONLY so the post lands as "Only me" — user
  // flips to public from the TT app. Once the app is audited, this check
  // becomes a no-op because the prod client key won't have the "sb" prefix.
  const isSandbox = (process.env.TIKTOK_CLIENT_KEY || '').startsWith('sb')
  if (isSandbox) return 'SELF_ONLY'
  if (!allowed || !allowed.length) return 'SELF_ONLY'
  const pref = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']
  for (const p of pref) if (allowed.includes(p)) return p
  return allowed[0]
}

export interface TikTokPublishInput {
  caption: string
  video_url: string
  handle?: string | null
}

export interface TikTokPublishResult {
  ok: boolean
  status: number
  publish_id?: string
  privacy_level?: string
  error?: string
}

export async function publishTikTok(input: TikTokPublishInput): Promise<TikTokPublishResult> {
  const { caption, video_url, handle } = input
  if (!caption) return { ok: false, status: 400, error: 'Caption required' }
  if (!video_url) return { ok: false, status: 400, error: 'TikTok needs an mp4 video — attach one from your media library.' }

  const supabase = sb()
  const q = supabase.from('connected_social_accounts').select('*').eq('platform', 'tiktok')
  if (handle) q.eq('handle', handle)
  const { data: account, error: accErr } = await q.order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (accErr || !account) return { ok: false, status: 400, error: 'No TikTok account connected — reconnect in Broadcast Lab.' }

  let live = account as Account & Record<string, unknown>
  if (account.token_expiry && Date.now() > Number(account.token_expiry) - 60_000) {
    const refreshed = await refreshToken(live)
    if (!refreshed) return { ok: false, status: 401, error: 'TikTok token expired and refresh failed — reconnect TikTok.' }
    live = { ...live, ...refreshed }
  }

  let ci = await getCreatorInfo(live.access_token)
  if (!ci.ok) {
    if (ci.data?.error?.code === 'access_token_invalid' && live.refresh_token) {
      const refreshed = await refreshToken(live)
      if (refreshed) {
        live = { ...live, ...refreshed }
        ci = await getCreatorInfo(live.access_token)
        if (!ci.ok) {
          return { ok: false, status: 400, error: `TikTok: ${ci.data?.error?.message || ci.data?.error?.code || 'creator_info failed'}` }
        }
      } else {
        return { ok: false, status: 401, error: 'TikTok token invalid — reconnect TikTok in Broadcast Lab.' }
      }
    } else {
      return { ok: false, status: 400, error: `TikTok: ${ci.data?.error?.message || ci.data?.error?.code || 'creator_info failed'}` }
    }
  }

  const privacy = pickPrivacy(ci.data?.data?.privacy_level_options)

  try {
    const initBody = {
      post_info: {
        title: caption.substring(0, 2200),
        privacy_level: privacy,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url,
      },
    }

    const postRes = await fetch(`${TT}/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${live.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(initBody),
    })
    const postData = await postRes.json() as { error?: { code?: string; message?: string }; data?: { publish_id?: string } }

    if (!postRes.ok || (postData.error?.code && postData.error.code !== 'ok')) {
      const code = postData.error?.code || 'unknown'
      const msg = postData.error?.message || 'TikTok post failed'
      const hint =
        code === 'url_ownership_unverified'
          ? ' — verify the media domain at developers.tiktok.com → your app → URL properties.'
          : code === 'spam_risk_too_many_posts'
          ? ' — TikTok throttled this account, wait a few minutes.'
          : code === 'unaudited_client_can_only_post_to_private_accounts'
          ? ' — app is unaudited; posts will be private until TikTok approves your app.'
          : ''
      throw new Error(`${msg} [${code}]${hint}`)
    }

    const publish_id = postData.data?.publish_id
    await supabase.from('social_posts').insert({
      platform: 'tiktok',
      handle: live.handle,
      caption,
      media_urls: [video_url],
      posted_at: new Date().toISOString(),
      status: 'posted',
      platform_post_id: publish_id,
    })

    return { ok: true, status: 200, publish_id, privacy_level: privacy }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await supabase.from('social_posts').insert({
      platform: 'tiktok',
      handle: live.handle,
      caption,
      status: 'failed',
      error_message: message,
    })
    return { ok: false, status: 500, error: message }
  }
}
