import { NextRequest, NextResponse } from 'next/server'

// ── Beatport API v4 ─────────────────────────────────────────────────────────
// Register at developer.beatport.com — free for indie developers
// Add to env: BEATPORT_CLIENT_ID, BEATPORT_CLIENT_SECRET
//
// Key format returned: { camelot_number: 8, camelot_letter: "A" } → "8A"
// BPM filter: bpm_range=120-130
// Genre IDs used in electronic music:
//   6=Techno  12=Tech House  5=House  7=Melodic House & Techno
//   4=Hard Techno  94=Minimal  14=Deep House  15=Electronica

const BASE = 'https://api.beatport.com/v4'

// Camelot wheel — compatible keys (±1 hour, parallel major/minor)
const CAMELOT_COMPATIBLE: Record<string, string[]> = {
  '1A': ['1A','2A','12A','1B'], '2A': ['2A','3A','1A','2B'], '3A': ['3A','4A','2A','3B'],
  '4A': ['4A','5A','3A','4B'], '5A': ['5A','6A','4A','5B'], '6A': ['6A','7A','5A','6B'],
  '7A': ['7A','8A','6A','7B'], '8A': ['8A','9A','7A','8B'], '9A': ['9A','10A','8A','9B'],
  '10A': ['10A','11A','9A','10B'], '11A': ['11A','12A','10A','11B'], '12A': ['12A','1A','11A','12B'],
  '1B': ['1B','2B','12B','1A'], '2B': ['2B','3B','1B','2A'], '3B': ['3B','4B','2B','3A'],
  '4B': ['4B','5B','3B','4A'], '5B': ['5B','6B','4B','5A'], '6B': ['6B','7B','5B','6A'],
  '7B': ['7B','8B','6B','7A'], '8B': ['8B','9B','7B','8A'], '9B': ['9B','10B','8B','9A'],
  '10B': ['10B','11B','9B','10A'], '11B': ['11B','12B','10B','11A'], '12B': ['12B','1B','11B','12A'],
}

// Token cache — client credentials tokens last 3600s
let cachedToken: { token: string; expires: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60_000) return cachedToken.token

  const clientId     = process.env.BEATPORT_CLIENT_ID!
  const clientSecret = process.env.BEATPORT_CLIENT_SECRET!

  const res = await fetch(`${BASE}/auth/o/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Beatport auth failed: ${JSON.stringify(data)}`)

  cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

function parseCamelot(key: any): string | null {
  if (!key) return null
  // Beatport returns { camelot_number: 8, camelot_letter: "A" }
  if (key.camelot_number && key.camelot_letter) {
    return `${key.camelot_number}${key.camelot_letter}`
  }
  return null
}

// Map genre string from user library → Beatport genre IDs to query
function genreToIds(genre: string): number[] {
  const g = genre.toLowerCase()
  if (g.includes('techno'))    return [6, 4]
  if (g.includes('tech house')) return [12]
  if (g.includes('melodic'))   return [7]
  if (g.includes('minimal'))   return [94]
  if (g.includes('deep'))      return [14]
  if (g.includes('house'))     return [5, 12, 14]
  // Default: broad electronic
  return [6, 12, 7, 5]
}

export async function POST(req: NextRequest) {
  if (!process.env.BEATPORT_CLIENT_ID || !process.env.BEATPORT_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Beatport not configured — add BEATPORT_CLIENT_ID and BEATPORT_CLIENT_SECRET' },
      { status: 500 }
    )
  }

  try {
    const { tracks, maxPopularity = 40, limit = 20 } = await req.json()
    if (!tracks?.length) return NextResponse.json({ error: 'No tracks provided' }, { status: 400 })

    const avgBpm = Math.round(tracks.reduce((s: number, t: any) => s + (t.bpm || 128), 0) / tracks.length)
    const bpmLow  = avgBpm - 8
    const bpmHigh = avgBpm + 8

    // Find dominant Camelot key from library
    const camelotCounts: Record<string, number> = {}
    tracks.forEach((t: any) => { if (t.camelot) camelotCounts[t.camelot] = (camelotCounts[t.camelot] || 0) + 1 })
    const dominantCamelot = Object.entries(camelotCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '8A'
    const compatibleKeys  = CAMELOT_COMPATIBLE[dominantCamelot] || [dominantCamelot]

    // Determine genre from library
    const genres = tracks.map((t: any) => t.genre).filter(Boolean)
    const dominantGenre = genres[0] || 'techno'
    const genreIds = genreToIds(dominantGenre)

    const token = await getToken()

    // Fetch from Beatport — all genre IDs in parallel
    const fetchGenre = async (genreId: number) => {
      const params = new URLSearchParams({
        bpm_range: `${bpmLow}-${bpmHigh}`,
        genre_id:  String(genreId),
        per_page:  '50',
        order_by:  '-publish_date',
      })
      const res = await fetch(`${BASE}/catalog/tracks/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.results || []) as any[]
    }

    const genreResults = await Promise.all(genreIds.map(fetchGenre))
    const allItems = genreResults.flat()

    const seen = new Set<string>()
    const results: any[] = []

    for (const item of allItems) {
      if (results.length >= limit) break

      const camelot = parseCamelot(item.key)
      if (camelot && !compatibleKeys.includes(camelot)) continue

      const artist     = item.artists?.[0]?.name || ''
      const title      = item.name || ''
      const dedupeKey  = `${artist.toLowerCase()}::${title.toLowerCase()}`
      if (seen.has(dedupeKey)) continue

      const inLibrary = tracks.some(
        (t: any) =>
          t.title?.toLowerCase() === title.toLowerCase() &&
          t.artist?.toLowerCase() === artist.toLowerCase()
      )
      if (inLibrary) continue
      seen.add(dedupeKey)

      const chartRank       = item.chart_rank || null
      const popularityProxy = chartRank ? Math.min(100, Math.round(100 - (100 / chartRank) * 10)) : 10
      if (popularityProxy > maxPopularity) continue

      results.push({
        id:           item.id,
        title,
        artist,
        bpm:          item.bpm || null,
        camelot,
        key_name:     item.key?.musical_key || null,
        label:        item.release?.label?.name || null,
        release:      item.release?.name || null,
        release_date: item.release?.date || null,
        release_year: item.release?.date?.slice(0, 4) || null,
        album_art:    item.release?.image?.uri || null,
        genre:        item.genre?.name || null,
        sub_genre:    item.sub_genre?.name || null,
        beatport_url: `https://www.beatport.com/track/${item.slug}/${item.id}`,
        source:       'beatport',
        popularity:   popularityProxy,
      })
    }

    // Sort by newest release
    results.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))

    return NextResponse.json({
      tracks: results,
      targetCamelot: dominantCamelot,
      targetBpm:     avgBpm,
      compatibleKeys,
      bpmRange:      `${bpmLow}–${bpmHigh}`,
      source:        'beatport',
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    configured: !!(process.env.BEATPORT_CLIENT_ID && process.env.BEATPORT_CLIENT_SECRET),
    message: 'Register at developer.beatport.com → add BEATPORT_CLIENT_ID + BEATPORT_CLIENT_SECRET',
  })
}
