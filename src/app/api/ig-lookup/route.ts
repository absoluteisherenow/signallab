import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

const IG_BUSINESS_ID = '17841400093363542' // NM's IG Business Account ID

/**
 * GET /api/ig-lookup?q=username
 * Looks up an Instagram username via Meta Business Discovery API.
 * Returns profile pic, name, follower count for the collab search.
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const q = req.nextUrl.searchParams.get('q')?.trim().replace(/^@/, '').toLowerCase()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ results: [], error: 'META_SYSTEM_USER_TOKEN not configured' }, { status: 500 })
  }

  try {
    const fields = 'username,name,profile_picture_url,followers_count,biography'
    const url = `https://graph.facebook.com/v25.0/${IG_BUSINESS_ID}?fields=business_discovery.fields(${fields}).username(${encodeURIComponent(q)})&access_token=${token}`

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      // "Invalid username" or "not found" errors (code 100 or 110, subcode 2207013)
      if (err?.error?.code === 100 || err?.error?.code === 110 || err?.error?.error_subcode === 2207013) {
        return NextResponse.json({ results: [] })
      }
      return NextResponse.json({ results: [], error: err?.error?.message || `Meta API ${res.status}` })
    }

    const data = await res.json()
    const user = data?.business_discovery

    if (!user?.username) {
      return NextResponse.json({ results: [] })
    }

    return NextResponse.json({
      results: [{
        username: user.username,
        full_name: user.name || '',
        profile_pic_url: user.profile_picture_url || '',
        followers: user.followers_count || 0,
        is_verified: false, // Business Discovery doesn't expose this
        bio: user.biography || '',
      }]
    })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ results: [], error: 'timeout' })
    }
    return NextResponse.json({ results: [], error: err.message }, { status: 500 })
  }
}
