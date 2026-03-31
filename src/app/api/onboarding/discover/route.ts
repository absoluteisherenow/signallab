import { NextRequest, NextResponse } from 'next/server'

// ── Last.fm ───────────────────────────────────────────────────────────────────

async function discoverLastfm(name: string) {
  const key = process.env.LASTFM_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(name)}&api_key=${key}&format=json`
    )
    if (!res.ok) return null
    const data = await res.json()
    const artist = data?.artist
    if (!artist || artist.name?.toLowerCase() === 'undefined') return null

    const tags: string[] = (artist.tags?.tag || []).map((t: { name: string }) => t.name)
    const bio: string = artist.bio?.summary || ''
    const cleanBio = bio.replace(/<a[^>]*>.*?<\/a>/gi, '').replace(/<[^>]+>/g, '').trim()

    const topTracksRes = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(name)}&api_key=${key}&format=json&limit=6`
    )
    const topTracksData = topTracksRes.ok ? await topTracksRes.json() : {}
    const tracks = (topTracksData?.toptracks?.track || []).map((t: { name: string }) => ({
      title: t.name,
      bpm: 0,
    }))

    return {
      found: true,
      artistName: artist.name,
      genre: tags[0] || null,
      tags: tags.slice(0, 4),
      bio: cleanBio ? cleanBio.slice(0, 200) : null,
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
          biography { blurb }
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
          bio: artist.biography?.blurb ? artist.biography.blurb.slice(0, 200) : null,
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
  const [lastfm, ra] = await Promise.all([
    discoverLastfm(name),
    discoverRA(name),
  ])

  // RA is the authority — only surface discovery if RA finds them
  if (!ra?.found) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    sources: ['ra'],
    artistName: lastfm?.artistName || name,
    raSlug: ra?.raSlug || null,
    genre: lastfm?.genre || null,
    tags: lastfm?.tags || [],
    bpmRange: null,
    country: ra?.country || null,
    bio: ra?.bio || lastfm?.bio || null,
    tracks: lastfm?.tracks || [],
  })
}
