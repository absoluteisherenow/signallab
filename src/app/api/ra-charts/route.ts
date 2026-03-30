import { NextResponse } from 'next/server'

// ── Resident Advisor Charts Integration ─────────────────────────────────────
// RA has an unofficial GraphQL API at https://ra.co/graphql
// This route fetches recent charts in electronic music genres and returns
// a flat set of normalized "artist::title" strings for cross-referencing.

// Module-level cache — 6 hour TTL
let chartCache: { tracks: string[]; expires: number } | null = null

const RA_GRAPHQL = 'https://ra.co/graphql'

const RA_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://ra.co/',
}

const PRIMARY_QUERY = `
  query {
    chartsList(
      filters: { genres: [{ id: "1" }, { id: "2" }, { id: "6" }, { id: "10" }] }
      page: 1
      perPage: 100
    ) {
      data {
        id
        title
        artist { name }
        tracks {
          track {
            title
            artists { displayName }
          }
        }
      }
    }
  }
`

const FALLBACK_QUERY = `
  query {
    chartsList {
      data {
        tracks {
          track {
            title
            artists { displayName }
          }
        }
      }
    }
  }
`

function extractTracks(chartsData: any[]): string[] {
  const tracks: string[] = []
  for (const chart of chartsData) {
    if (!Array.isArray(chart.tracks)) continue
    for (const entry of chart.tracks) {
      const track = entry?.track
      if (!track) continue
      const title = track.title?.trim()
      const artist = track.artists?.[0]?.displayName?.trim()
      if (!title || !artist) continue
      tracks.push(`${artist.toLowerCase().trim()}::${title.toLowerCase().trim()}`)
    }
  }
  return tracks
}

async function fetchRACharts(): Promise<string[]> {
  // Try primary query first
  try {
    const res = await fetch(RA_GRAPHQL, {
      method: 'POST',
      headers: RA_HEADERS,
      body: JSON.stringify({ query: PRIMARY_QUERY }),
      signal: AbortSignal.timeout(8000),
    })

    if (res.ok) {
      const json = await res.json()
      const chartsData = json?.data?.chartsList?.data
      if (Array.isArray(chartsData) && chartsData.length > 0) {
        return extractTracks(chartsData)
      }
    }
  } catch {
    // Primary query failed — try fallback
  }

  // Fallback query
  try {
    const res = await fetch(RA_GRAPHQL, {
      method: 'POST',
      headers: RA_HEADERS,
      body: JSON.stringify({ query: FALLBACK_QUERY }),
      signal: AbortSignal.timeout(8000),
    })

    if (res.ok) {
      const json = await res.json()
      const chartsData = json?.data?.chartsList?.data
      if (Array.isArray(chartsData) && chartsData.length > 0) {
        return extractTracks(chartsData)
      }
    }
  } catch {
    // Fallback also failed
  }

  return []
}

export async function GET() {
  try {
    // Return cached result if still valid
    if (chartCache && Date.now() < chartCache.expires) {
      return NextResponse.json({
        tracks: chartCache.tracks,
        cached: true,
        count: chartCache.tracks.length,
      })
    }

    const tracks = await fetchRACharts()

    // Cache for 6 hours
    chartCache = {
      tracks,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    }

    return NextResponse.json({
      tracks,
      cached: false,
      count: tracks.length,
    })
  } catch {
    return NextResponse.json({ tracks: [], cached: false, count: 0 })
  }
}
