import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

const IG_BUSINESS_ID = '17841400093363542' // NM's IG Business Account ID

/**
 * GET /api/instagram/profile-pic?handle=username
 * Fetches profile pic URL for an Instagram handle via Meta Business Discovery.
 * Used by BroadcastLab to backfill reference artist avatars.
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const handle = req.nextUrl.searchParams.get('handle')?.trim().replace(/^@/, '').toLowerCase()
  if (!handle || handle.length < 2) {
    return NextResponse.json({ profile_pic_url: null })
  }

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ profile_pic_url: null, error: 'META_SYSTEM_USER_TOKEN not configured' }, { status: 500 })
  }

  try {
    const url = `https://graph.facebook.com/v25.0/${IG_BUSINESS_ID}?fields=business_discovery.fields(profile_picture_url).username(${encodeURIComponent(handle)})&access_token=${token}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })

    if (!res.ok) {
      return NextResponse.json({ profile_pic_url: null })
    }
    const data = await res.json()
    const pic = data?.business_discovery?.profile_picture_url || null
    return NextResponse.json({ profile_pic_url: pic })
  } catch {
    return NextResponse.json({ profile_pic_url: null })
  }
}
