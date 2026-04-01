import { NextRequest, NextResponse } from 'next/server'

// ── Resident Advisor Artist Profile Fetch ──────────────────────────────────
// Uses RA's GraphQL API to pull artist bio, genres, location, and links.
// Falls back to HTML scraping if GraphQL doesn't return bio data.

const RA_GRAPHQL = 'https://ra.co/graphql'

const RA_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://ra.co/',
}

/** Convert artist name to RA slug variants */
function toSlugs(name: string): string[] {
  const base = name.trim().toLowerCase()
  const noSpaces = base.replace(/\s+/g, '')
  const dashed = base.replace(/\s+/g, '-')
  // Return unique variants
  return Array.from(new Set([noSpaces, dashed, base]))
}

/** Try GraphQL first — RA exposes artist data via their internal API */
async function fetchViaGraphQL(slug: string) {
  const query = `
    query GET_ARTIST($slug: String!) {
      artist(slug: $slug) {
        id
        name
        bio
        country { name }
        genres { name }
        links { platform url }
        imageUrl
      }
    }
  `

  try {
    const res = await fetch(RA_GRAPHQL, {
      method: 'POST',
      headers: RA_HEADERS,
      body: JSON.stringify({ query, variables: { slug } }),
    })

    if (!res.ok) return null

    const json = await res.json()
    const artist = json?.data?.artist
    if (!artist) return null

    return {
      bio: artist.bio || '',
      genres: (artist.genres || []).map((g: { name: string }) => g.name),
      country: artist.country?.name || '',
      links: (artist.links || []).map((l: { platform: string; url: string }) => ({
        platform: l.platform,
        url: l.url,
      })),
      raUrl: `https://ra.co/dj/${slug}`,
      imageUrl: artist.imageUrl || null,
      source: 'graphql' as const,
    }
  } catch {
    return null
  }
}

/** Fallback: scrape the artist page HTML for JSON-LD or meta tags */
async function fetchViaHTML(slug: string) {
  const url = `https://ra.co/dj/${slug}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': RA_HEADERS['User-Agent'],
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!res.ok) return null

    const html = await res.text()

    // 1. Try JSON-LD structured data
    const jsonLdMatch = html.match(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i
    )
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1])
        // RA may use Person or MusicGroup schema
        const entity = Array.isArray(ld) ? ld[0] : ld
        if (entity) {
          return {
            bio: entity.description || '',
            genres: entity.genre
              ? Array.isArray(entity.genre)
                ? entity.genre
                : [entity.genre]
              : [],
            country:
              entity.address?.addressCountry ||
              entity.location?.name ||
              '',
            links: (entity.sameAs || []).map((url: string) => ({
              platform: guessPlatform(url),
              url,
            })),
            raUrl: url,
            imageUrl: entity.image || null,
            source: 'jsonld' as const,
          }
        }
      } catch {
        // JSON-LD parse failed, continue to meta tags
      }
    }

    // 2. Try Open Graph / meta tags
    const ogDesc =
      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/) ||
      html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/)
    const ogTitle = html.match(
      /<meta[^>]*property="og:title"[^>]*content="([^"]*)"/
    )

    if (ogDesc || ogTitle) {
      return {
        bio: ogDesc ? decodeHTMLEntities(ogDesc[1]) : '',
        genres: extractGenresFromHTML(html),
        country: extractCountryFromHTML(html),
        links: extractLinksFromHTML(html),
        raUrl: url,
        imageUrl: null,
        source: 'html' as const,
      }
    }

    // 3. Last resort — check if page exists at all (non-404 = artist exists)
    if (html.includes('data-testid="artist') || html.includes('/dj/')) {
      return {
        bio: '',
        genres: extractGenresFromHTML(html),
        country: extractCountryFromHTML(html),
        links: extractLinksFromHTML(html),
        raUrl: url,
        imageUrl: null,
        source: 'html-minimal' as const,
      }
    }

    return null
  } catch {
    return null
  }
}

function guessPlatform(url: string): string {
  if (url.includes('soundcloud')) return 'SoundCloud'
  if (url.includes('instagram')) return 'Instagram'
  if (url.includes('facebook')) return 'Facebook'
  if (url.includes('twitter') || url.includes('x.com')) return 'X'
  if (url.includes('bandcamp')) return 'Bandcamp'
  if (url.includes('spotify')) return 'Spotify'
  if (url.includes('youtube')) return 'YouTube'
  if (url.includes('discogs')) return 'Discogs'
  return 'Website'
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
}

function extractGenresFromHTML(html: string): string[] {
  // Look for genre links common on RA pages
  const genreMatches = html.match(/href="\/music\/genre\/[^"]*"[^>]*>([^<]+)/g)
  if (genreMatches) {
    return genreMatches.map((m) => {
      const nameMatch = m.match(/>([^<]+)/)
      return nameMatch ? nameMatch[1].trim() : ''
    }).filter(Boolean)
  }
  return []
}

function extractCountryFromHTML(html: string): string {
  // RA often has country in a specific section
  const countryMatch = html.match(/href="\/music\/country\/[^"]*"[^>]*>([^<]+)/)
  return countryMatch ? countryMatch[1].trim() : ''
}

function extractLinksFromHTML(html: string): { platform: string; url: string }[] {
  const links: { platform: string; url: string }[] = []
  const socialPatterns = [
    /href="(https?:\/\/(?:www\.)?soundcloud\.com\/[^"]+)"/g,
    /href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/g,
    /href="(https?:\/\/(?:www\.)?facebook\.com\/[^"]+)"/g,
    /href="(https?:\/\/(?:www\.)?bandcamp\.com[^"]+)"/g,
    /href="(https?:\/\/(?:www\.)?spotify\.com[^"]+)"/g,
  ]
  for (const pat of socialPatterns) {
    const match = pat.exec(html)
    if (match) {
      links.push({ platform: guessPlatform(match[1]), url: match[1] })
    }
  }
  return links
}

// ── GET handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get('artist')
  if (!artist) {
    return NextResponse.json({ error: 'Missing ?artist= parameter' }, { status: 400 })
  }

  const slugs = toSlugs(artist)
  let result = null

  // Try each slug variant via GraphQL first, then HTML
  for (const slug of slugs) {
    result = await fetchViaGraphQL(slug)
    if (result && (result.bio || result.genres.length > 0)) break

    result = await fetchViaHTML(slug)
    if (result && (result.bio || result.genres.length > 0)) break
  }

  if (!result) {
    return NextResponse.json(
      {
        error: `Could not find "${artist}" on Resident Advisor`,
        tried: slugs.map((s) => `https://ra.co/dj/${s}`),
      },
      { status: 404 }
    )
  }

  return NextResponse.json(result)
}
