import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * /api/tag-suggest — autocomplete source for the Tag & details panel.
 *
 * Searches the local artist_profiles table by handle or name so the user
 * sees suggestions for artists we already have deep-dive data on. This is
 * the fast path — typing "@dot" surfaces the real handle before they
 * fat-finger something wrong.
 *
 * Returns `{ suggestions: [{ handle, name }] }`. Capped at 10 rows so the
 * dropdown never gets unwieldy.
 *
 * Also proxies IG verification: pass `?verify=<handle>` to ping Meta's
 * business_discovery endpoint and return whether the handle resolves +
 * the account's display name. Used for the green-dot confirmation next
 * to each tag.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const GRAPH = 'https://graph.facebook.com/v25.0'
// NM's own IG business ID — see reference_meta_business_discovery.md.
// business_discovery needs an authenticated owner; NM account does this.
const NM_IG_ID = '17841400093363542'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const verify = searchParams.get('verify')
    const platform = (searchParams.get('platform') || 'instagram').toLowerCase()
    if (verify) {
      if (platform === 'tiktok') return await verifyHandleTikTok(verify)
      return await verifyHandle(verify)
    }

    const q = (searchParams.get('q') || '').trim().replace(/^@+/, '')
    if (!q) return NextResponse.json({ suggestions: [] })

    // Two cheap ILIKEs: handle first (most common), name as fallback.
    const { data, error } = await supabase
      .from('artist_profiles')
      .select('handle, name')
      .or(`handle.ilike.%${q}%,name.ilike.%${q}%`)
      .order('name', { ascending: true })
      .limit(10)

    if (error) throw error

    const suggestions = (data || [])
      .map(r => ({ handle: (r.handle || '').replace(/^@+/, ''), name: r.name || '' }))
      .filter(r => r.handle)
    return NextResponse.json({ suggestions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ suggestions: [], error: message }, { status: 500 })
  }
}

async function verifyHandle(raw: string) {
  const handle = raw.trim().replace(/^@+/, '')
  if (!handle) return NextResponse.json({ ok: false, error: 'empty handle' }, { status: 400 })

  const token = process.env.META_GRAPH_TOKEN || process.env.IG_ACCESS_TOKEN
  if (!token) {
    // No token — degrade to "we don't know" without blocking the UI.
    return NextResponse.json({ ok: null, reason: 'no-token' })
  }

  try {
    const url = `${GRAPH}/${NM_IG_ID}?fields=business_discovery.username(${encodeURIComponent(handle)}){id,username,name,followers_count,profile_picture_url}&access_token=${token}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.error) {
      // Most common: "does not exist" / "account is not a business account"
      // Both of those still count as "we can't verify" from the user's POV.
      const msg = data.error.message || 'verify failed'
      return NextResponse.json({ ok: false, handle, reason: msg })
    }
    const profile = data?.business_discovery
    if (!profile?.username) return NextResponse.json({ ok: false, handle, reason: 'not found' })
    return NextResponse.json({
      ok: true,
      handle: profile.username,
      name: profile.name || null,
      followers: profile.followers_count ?? null,
      profile_pic_url: profile.profile_picture_url || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'verify failed'
    return NextResponse.json({ ok: false, handle, reason: message }, { status: 500 })
  }
}

/**
 * TikTok handle verification via the public oEmbed endpoint. No auth token
 * needed. Returns 200 + JSON when the user exists, 404 otherwise. We get
 * author_name (display name) for free — follower count isn't exposed here,
 * so the chip renders with name only.
 */
async function verifyHandleTikTok(raw: string) {
  const handle = raw.trim().replace(/^@+/, '')
  if (!handle) return NextResponse.json({ ok: false, error: 'empty handle' }, { status: 400 })
  try {
    const url = `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${handle}`)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (res.status === 404) return NextResponse.json({ ok: false, handle, reason: 'not found' })
    if (!res.ok) return NextResponse.json({ ok: null, reason: `tt oembed ${res.status}` })
    const data = await res.json()
    // oEmbed returns { author_name, author_url, title, ... } for real users.
    if (!data?.author_url) return NextResponse.json({ ok: false, handle, reason: 'not found' })
    return NextResponse.json({
      ok: true,
      handle,
      name: data.author_name || null,
      followers: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'verify failed'
    return NextResponse.json({ ok: null, handle, reason: message })
  }
}
