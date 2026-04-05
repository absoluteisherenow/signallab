import { NextRequest, NextResponse } from 'next/server'

// ── Bandcamp Search API ─────────────────────────────────────────────────────
// Uses Bandcamp's autocomplete endpoint for search results
// No API key required — public endpoint

const SEARCH_URL = 'https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic'

interface BandcampResult {
  id: string
  title: string
  artist: string
  album?: string
  label?: string
  genre?: string
  album_art?: string
  bandcamp_url: string
  source: 'bandcamp'
}

export async function POST(req: NextRequest) {
  try {
    const { query, genre, limit = 20 } = await req.json()
    if (!query) return NextResponse.json({ error: 'No query provided' }, { status: 400 })

    // Bandcamp autocomplete search
    const searchRes = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search_text: genre ? `${query} ${genre}` : query,
        search_filter: 't', // 't' = tracks, 'a' = albums, 'b' = bands
        full_page: false,
        fan_id: null,
      }),
    })

    if (!searchRes.ok) {
      // Fallback: try the fuzzy search endpoint
      const fuzzyRes = await fetch(`https://bandcamp.com/api/fuzzysearch/1/autocomplete?q=${encodeURIComponent(query)}`, {
        headers: { 'Accept': 'application/json' },
      })
      if (!fuzzyRes.ok) throw new Error(`Bandcamp search failed: ${searchRes.status}`)
      const fuzzyData = await fuzzyRes.json()

      const results: BandcampResult[] = (fuzzyData.results || [])
        .filter((r: any) => r.type === 'a' || r.type === 't') // albums and tracks
        .slice(0, limit)
        .map((r: any) => ({
          id: `bc-${r.id}`,
          title: r.name || '',
          artist: r.band_name || '',
          album: r.album_name || '',
          album_art: r.img ? r.img.replace('_7', '_16') : null, // larger image
          bandcamp_url: r.url || '',
          source: 'bandcamp' as const,
        }))

      return NextResponse.json({ tracks: results, source: 'bandcamp' })
    }

    const data = await searchRes.json()
    const trackResults = data.auto?.results || []

    const results: BandcampResult[] = trackResults
      .slice(0, limit)
      .map((item: any) => ({
        id: `bc-${item.id}`,
        title: item.name || '',
        artist: item.band_name || '',
        album: item.album_name || '',
        album_art: item.img ? item.img.replace('_7', '_16') : null,
        bandcamp_url: item.item_url_path || item.url || '',
        genre: item.genre || '',
        source: 'bandcamp' as const,
      }))

    return NextResponse.json({ tracks: results, source: 'bandcamp' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Bandcamp search — no API key required' })
}
