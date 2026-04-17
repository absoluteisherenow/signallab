import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

const IG_BUSINESS_ID = '17841400093363542' // NM's IG Business Account ID

/**
 * POST /api/artist-search
 * Body: { query: string }
 * Given an artist name, suggest likely Instagram handles by trying common variants
 * against Meta Business Discovery. Used before scanning so "Bicep" → feelmybicep.
 *
 * Returns: {
 *   success: true,
 *   candidates: [{ username, full_name, profile_pic_url, followers }],
 *   auto_resolve: boolean, // true when one candidate dominates
 *   top?: { username, ... }
 * }
 */
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ success: false, error: 'META_SYSTEM_USER_TOKEN not configured', candidates: [] })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    if (!query) return NextResponse.json({ success: false, error: 'query required', candidates: [] })

    // Generate candidate usernames from the query
    const base = query.toLowerCase().replace(/[^a-z0-9]/g, '')
    const withSpaces = query.toLowerCase().replace(/\s+/g, '')
    const underscores = query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const dots = query.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')

    const candidateHandles = Array.from(new Set([
      base,
      withSpaces,
      underscores,
      dots,
      `${base}music`,
      `${base}official`,
      `dj${base}`,
    ])).filter(h => h.length >= 2 && h.length <= 30).slice(0, 8)

    // Query each candidate in parallel via business_discovery
    const results = await Promise.all(candidateHandles.map(async (handle) => {
      try {
        const url = `https://graph.facebook.com/v25.0/${IG_BUSINESS_ID}?fields=business_discovery.fields(username,name,profile_picture_url,followers_count).username(${encodeURIComponent(handle)})&access_token=${token}`
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (!res.ok) return null
        const data = await res.json()
        const u = data?.business_discovery
        if (!u?.username) return null
        return {
          username: u.username as string,
          full_name: u.name || '',
          profile_pic_url: u.profile_picture_url || '',
          followers: u.followers_count || 0,
        }
      } catch {
        return null
      }
    }))

    // Dedupe by username, keep best follower count first
    const seen = new Set<string>()
    const candidates = results
      .filter((r): r is NonNullable<typeof r> => !!r)
      .filter(r => {
        if (seen.has(r.username)) return false
        seen.add(r.username)
        return true
      })
      .sort((a, b) => b.followers - a.followers)

    if (candidates.length === 0) {
      return NextResponse.json({ success: false, candidates: [], note: 'No matches found' })
    }

    // Auto-resolve if top candidate is dramatically larger (5x+) than next
    const top = candidates[0]
    const second = candidates[1]
    const autoResolve = !second || top.followers >= (second.followers * 5) || top.followers >= 50_000

    return NextResponse.json({ success: true, candidates, auto_resolve: autoResolve, top: autoResolve ? top : undefined })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'search failed', candidates: [] }, { status: 500 })
  }
}
