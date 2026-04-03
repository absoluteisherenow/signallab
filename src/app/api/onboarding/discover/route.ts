import { NextRequest, NextResponse } from 'next/server'

// ── Spotify ──────────────────────────────────────────────────────────────────

async function getSpotifyToken() {
  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) return null
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${id}&client_secret=${secret}`,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token as string
  } catch { return null }
}

async function discoverSpotify(name: string) {
  const token = await getSpotifyToken()
  if (!token) return null
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const items = data?.artists?.items || []
    // Find exact or close match
    const exact = items.find((a: { name: string }) => a.name.toLowerCase() === name.toLowerCase())
    const match = exact || items[0]
    if (!match) return null
    // Only accept if name is a reasonable match
    if (!exact && !match.name.toLowerCase().includes(name.toLowerCase().split(' ')[0])) return null

    return {
      found: true,
      name: match.name,
      spotifyUrl: match.external_urls?.spotify || null,
      spotifyId: match.id,
      imageUrl: match.images?.[0]?.url || null,
      genres: match.genres || [],
      followers: match.followers?.total || 0,
      popularity: match.popularity || 0,
    }
  } catch { return null }
}

// ── Last.fm ──────────────────────────────────────────────────────────────────

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
      bio: cleanBio ? cleanBio.slice(0, 300) : null,
      tracks: tracks.slice(0, 4),
    }
  } catch {
    return null
  }
}

// ── Resident Advisor ─────────────────────────────────────────────────────────

const RA_GQL = 'https://ra.co/graphql'
const RA_HEADERS = {
  'Content-Type': 'application/json',
  'Referer': 'https://ra.co/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

const RA_ARTIST_QUERY = `query GetArtist($slug: String!) {
  artist(slug: $slug) {
    id name image
    country { name }
    instagram soundcloud bandcamp website
    contentUrl upcomingEventsCount
    events(type: FROMDATE) {
      id title date
      venue { name area { name country { name } } }
    }
    biography { blurb }
  }
}`

function extractInstagramHandle(url: string | null): string | null {
  if (!url) return null
  const match = url.replace(/\/$/, '').match(/instagram\.com\/([^/?#]+)/)
  return match?.[1] || null
}

async function discoverRA(name: string) {
  try {
    // Step 1: Search for the artist (most reliable — handles all slug formats)
    const searchRes = await fetch(RA_GQL, {
      method: 'POST',
      headers: RA_HEADERS,
      body: JSON.stringify({
        query: `{ search(searchTerm: ${JSON.stringify(name)}, indices: [ARTIST], limit: 5) { id value contentUrl imageUrl countryName } }`,
      }),
    })

    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const results = searchData?.data?.search || []
    if (!results.length) return null

    // Find best match
    const exact = results.find((a: { value: string }) =>
      a.value.toLowerCase() === name.toLowerCase()
    )
    const match = exact || results[0]
    if (!match) return null

    // Extract slug from contentUrl (e.g. "/dj/nightmanoeuvres" → "nightmanoeuvres")
    const slug = match.contentUrl?.replace(/^\/dj\//, '') || null
    if (!slug) return null

    // Step 2: Get full profile
    const fullRes = await fetch(RA_GQL, {
      method: 'POST',
      headers: RA_HEADERS,
      body: JSON.stringify({ query: RA_ARTIST_QUERY, variables: { slug } }),
    })

    if (!fullRes.ok) {
      // Return search-level data as fallback
      return {
        found: true,
        raSlug: slug,
        raUrl: `https://ra.co/dj/${slug}`,
        name: match.value || name,
        country: match.countryName || null,
        bio: null,
        imageUrl: match.imageUrl || null,
        instagram: null,
        soundcloud: null,
        bandcamp: null,
        upcomingGigs: [],
      }
    }

    const fullData = await fullRes.json()
    const artist = fullData?.data?.artist

    if (!artist) {
      return {
        found: true,
        raSlug: slug,
        raUrl: `https://ra.co/dj/${slug}`,
        name: match.value || name,
        country: match.countryName || null,
        bio: null,
        imageUrl: match.imageUrl || null,
        instagram: null,
        soundcloud: null,
        bandcamp: null,
        upcomingGigs: [],
      }
    }

    // Filter events to only future dates
    const now = new Date()
    const upcomingGigs = (artist.events || [])
      .filter((e: { date: string }) => {
        const d = new Date(e.date)
        return d >= now
      })
      .map((e: { title: string; date: string; venue: { name: string; area: { name: string; country: { name: string } } } }) => ({
        title: e.title || name,
        venue: e.venue?.name || '',
        location: [e.venue?.area?.name, e.venue?.area?.country?.name].filter(Boolean).join(', '),
        date: (e.date || '').split('T')[0],
        status: 'confirmed' as const,
      }))

    return {
      found: true,
      raSlug: slug,
      raUrl: `https://ra.co/dj/${slug}`,
      name: artist.name || name,
      country: artist.country?.name || null,
      bio: artist.biography?.blurb || null,
      imageUrl: artist.image || match.imageUrl || null,
      instagram: extractInstagramHandle(artist.instagram),
      soundcloud: artist.soundcloud || null,
      bandcamp: artist.bandcamp || null,
      upcomingGigs,
    }
  } catch {
    return null
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name || name.length < 2) return NextResponse.json({ found: false })

  // Run all sources in parallel
  const [lastfm, ra, spotify] = await Promise.all([
    discoverLastfm(name),
    discoverRA(name),
    discoverSpotify(name),
  ])

  // Need at least one source to have found something
  if (!ra?.found && !spotify?.found && !lastfm?.found) {
    return NextResponse.json({ found: false })
  }

  // Merge — RA is primary for gigs/links, Spotify for image/genres, Last.fm for bio/tags
  // Filter out country names and overly generic tags from genres
  const EXCLUDED_TAGS = new Set(['united kingdom', 'uk', 'usa', 'germany', 'france', 'netherlands', 'spain', 'italy', 'seen live', 'all', 'favorites'])
  const genres = [
    ...(spotify?.genres || []),
    ...(lastfm?.tags || []),
  ].filter((g, i, arr) =>
    arr.indexOf(g) === i && !EXCLUDED_TAGS.has(g.toLowerCase())
  ).slice(0, 5)

  return NextResponse.json({
    found: true,
    sources: [ra?.found && 'ra', spotify?.found && 'spotify', lastfm?.found && 'lastfm'].filter(Boolean),
    artistName: ra?.name || spotify?.name || lastfm?.artistName || name,
    raSlug: ra?.raSlug || null,
    raUrl: ra?.raUrl || null,
    spotifyUrl: spotify?.spotifyUrl || null,
    genre: genres[0] || null,
    genres,
    bpmRange: null,
    country: ra?.country || null,
    bio: ra?.bio || lastfm?.bio || null,
    imageUrl: ra?.imageUrl || spotify?.imageUrl || null,
    instagram: ra?.instagram || null,
    soundcloud: ra?.soundcloud || null,
    bandcamp: ra?.bandcamp || null,
    upcomingGigs: ra?.upcomingGigs || [],
    tracks: lastfm?.tracks || [],
    followers: spotify?.followers || null,
  })
}
