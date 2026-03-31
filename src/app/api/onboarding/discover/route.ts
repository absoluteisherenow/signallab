import { NextRequest, NextResponse } from 'next/server'

const BEATPORT_BASE = 'https://api.beatport.com/v4'

let cachedToken: { token: string; expires: number } | null = null

async function getBeatportToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60_000) return cachedToken.token
  const res = await fetch(`${BEATPORT_BASE}/auth/o/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${process.env.BEATPORT_CLIENT_ID}:${process.env.BEATPORT_CLIENT_SECRET}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Beatport auth failed')
  cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

// ── Beatport ──────────────────────────────────────────────────────────────────

async function discoverBeatport(name: string) {
  if (!process.env.BEATPORT_CLIENT_ID || !process.env.BEATPORT_CLIENT_SECRET) return null
  try {
    const token = await getBeatportToken()
    const artistRes = await fetch(`${BEATPORT_BASE}/catalog/artists/?query=${encodeURIComponent(name)}&per_page=5`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!artistRes.ok) return null
    const artistData = await artistRes.json()
    const artists = artistData.results || []
    if (!artists.length) return null

    const exact = artists.find((a: { name?: string }) => a.name?.toLowerCase() === name.toLowerCase())
    const artist = exact || artists[0]

    const tracksRes = await fetch(`${BEATPORT_BASE}/catalog/tracks/?artist_id=${artist.id}&per_page=6&order_by=-publish_date`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const tracksData = tracksRes.ok ? await tracksRes.json() : { results: [] }
    const tracks = (tracksData.results || []).map((t: { name: string; bpm: number; genre?: { name: string } }) => ({
      title: t.name,
      bpm: t.bpm,
      genre: t.genre?.name || null,
    }))

    const genres = tracks.map((t: { genre: string | null }) => t.genre).filter(Boolean)
    const bpms = tracks.map((t: { bpm: number }) => t.bpm).filter(Boolean)

    return {
      found: true,
      artistName: artist.name,
      beatportId: artist.id,
      genre: genres[0] || null,
      bpmRange: bpms.length > 1
        ? `${Math.min(...bpms)}–${Math.max(...bpms)}`
        : bpms.length === 1 ? `${bpms[0]}` : null,
      tracks: tracks.slice(0, 4),
    }
  } catch {
    return null
  }
}

// ── Resident Advisor ──────────────────────────────────────────────────────────

async function discoverRA(name: string) {
  try {
    // Derive slug from name: "Night Manoeuvres" → "night-manoeuvres"
    const slug = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Try slug-based artist lookup first
    const slugQuery = {
      query: `query GetArtist($slug: String!) {
        artist(slug: $slug) {
          id
          name
          country { name }
          biography
        }
      }`,
      variables: { slug },
    }

    const slugRes = await fetch('https://ra.co/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://ra.co/',
        'User-Agent': 'Mozilla/5.0 (compatible; SignalLabOS/1.0)',
      },
      body: JSON.stringify(slugQuery),
    })

    if (slugRes.ok) {
      const slugData = await slugRes.json()
      const artist = slugData?.data?.artist
      if (artist?.id) {
        return {
          found: true,
          raSlug: slug,
          country: artist.country?.name || null,
          bio: artist.biography ? artist.biography.slice(0, 200) : null,
        }
      }
    }

    // Fallback: search by name
    const searchQuery = {
      query: `query Search($query: String!) {
        search(query: $query) {
          artists {
            id
            name
            slug
            country { name }
          }
        }
      }`,
      variables: { query: name },
    }

    const searchRes = await fetch('https://ra.co/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://ra.co/',
        'User-Agent': 'Mozilla/5.0 (compatible; SignalLabOS/1.0)',
      },
      body: JSON.stringify(searchQuery),
    })

    if (!searchRes.ok) return null

    const searchData = await searchRes.json()
    const results = searchData?.data?.search?.artists || []
    if (!results.length) return null

    const exact = results.find((a: { name?: string }) => a.name?.toLowerCase() === name.toLowerCase())
    const match = exact || results[0]

    return {
      found: true,
      raSlug: match.slug,
      country: match.country?.name || null,
      bio: null,
    }
  } catch {
    return null
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name || name.length < 2) return NextResponse.json({ found: false })

  // Run both in parallel
  const [beatport, ra] = await Promise.all([
    discoverBeatport(name),
    discoverRA(name),
  ])

  const foundAnywhere = !!(beatport?.found || ra?.found)

  if (!foundAnywhere) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    sources: [
      ...(beatport?.found ? ['beatport'] : []),
      ...(ra?.found ? ['ra'] : []),
    ],
    artistName: beatport?.artistName || name,
    beatportId: beatport?.beatportId || null,
    raSlug: ra?.raSlug || null,
    genre: beatport?.genre || null,
    bpmRange: beatport?.bpmRange || null,
    country: ra?.country || null,
    bio: ra?.bio || null,
    tracks: beatport?.tracks || [],
  })
}
