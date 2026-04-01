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

const RA_GQL = 'https://ra.co/graphql'
const RA_HEADERS = {
  'Content-Type': 'application/json',
  'Referer': 'https://ra.co/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

async function discoverRA(name: string) {
  try {
    // Derive slug variants: "Night Manoeuvres" → "night-manoeuvres", "nightmanoeuvres"
    const base = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const dashed = base.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const nospaces = base.replace(/[^a-z0-9]/g, '')
    const slugs = Array.from(new Set([dashed, nospaces]))

    // Full artist query with bio, image, genres, links
    const fullQuery = {
      query: `query GetArtist($slug: String!) {
        artist(slug: $slug) {
          id
          name
          country { name }
          bio
          imageUrl
          genres { name }
          links { platform url }
        }
      }`,
    }

    for (const slug of slugs) {
      const res = await fetch(RA_GQL, {
        method: 'POST',
        headers: RA_HEADERS,
        body: JSON.stringify({ ...fullQuery, variables: { slug } }),
      })

      if (!res.ok) continue
      const data = await res.json()
      const artist = data?.data?.artist
      if (artist?.id) {
        return {
          found: true,
          raSlug: slug,
          raUrl: `https://ra.co/dj/${slug}`,
          name: artist.name || name,
          country: artist.country?.name || null,
          bio: artist.bio || null,
          imageUrl: artist.imageUrl || null,
          genres: (artist.genres || []).map((g: { name: string }) => g.name),
          links: (artist.links || []).map((l: { platform: string; url: string }) => ({
            platform: l.platform,
            url: l.url,
          })),
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

    const searchRes = await fetch(RA_GQL, {
      method: 'POST',
      headers: RA_HEADERS,
      body: JSON.stringify(searchQuery),
    })

    if (!searchRes.ok) return null

    const searchData = await searchRes.json()
    const results = searchData?.data?.search?.artists || []
    if (!results.length) return null

    const exact = results.find((a: { name?: string }) => a.name?.toLowerCase() === name.toLowerCase())
    const match = exact || results[0]

    // If we found via search, try to get full profile
    if (match?.slug) {
      const fullRes = await fetch(RA_GQL, {
        method: 'POST',
        headers: RA_HEADERS,
        body: JSON.stringify({ ...fullQuery, variables: { slug: match.slug } }),
      })
      if (fullRes.ok) {
        const fullData = await fullRes.json()
        const artist = fullData?.data?.artist
        if (artist) {
          return {
            found: true,
            raSlug: match.slug,
            raUrl: `https://ra.co/dj/${match.slug}`,
            name: artist.name || match.name || name,
            country: artist.country?.name || match.country?.name || null,
            bio: artist.bio || null,
            imageUrl: artist.imageUrl || null,
            genres: (artist.genres || []).map((g: { name: string }) => g.name),
            links: (artist.links || []).map((l: { platform: string; url: string }) => ({
              platform: l.platform,
              url: l.url,
            })),
          }
        }
      }
    }

    return {
      found: true,
      raSlug: match.slug,
      raUrl: `https://ra.co/dj/${match.slug}`,
      name: match.name || name,
      country: match.country?.name || null,
      bio: null,
      imageUrl: null,
      genres: [],
      links: [],
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
    artistName: ra?.name || lastfm?.artistName || name,
    raSlug: ra?.raSlug || null,
    raUrl: ra?.raUrl || null,
    genre: (ra?.genres && ra.genres.length > 0 ? ra.genres[0] : null) || lastfm?.genre || null,
    genres: ra?.genres || [],
    tags: lastfm?.tags || [],
    bpmRange: null,
    country: ra?.country || null,
    bio: ra?.bio || lastfm?.bio || null,
    imageUrl: ra?.imageUrl || null,
    links: ra?.links || [],
    tracks: lastfm?.tracks || [],
  })
}
