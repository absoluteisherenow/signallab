import { NextResponse } from 'next/server'

// ── Resident Advisor Charts Integration ─────────────────────────────────────
// RA has an unofficial GraphQL API at https://ra.co/graphql
// Returns both flat cross-reference strings AND rich attribution data
// (which DJ charted it, chart title, chart URL)

// Module-level cache — 6 hour TTL
let chartCache: {
  tracks: string[]
  rich: RAChartEntry[]
  expires: number
} | null = null

export interface RAChartEntry {
  key: string        // normalised "artist::title" for cross-reference
  artist: string
  title: string
  charted_by: string   // DJ name
  chart_title: string  // e.g. "Objekt - May 2025 Chart"
  chart_id: string
}

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

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

function extractData(chartsData: any[]): { tracks: string[]; rich: RAChartEntry[] } {
  const tracks: string[] = []
  const rich: RAChartEntry[] = []
  const seen = new Set<string>()

  for (const chart of chartsData) {
    if (!Array.isArray(chart.tracks)) continue
    const djName = chart.artist?.name?.trim() || 'Unknown DJ'
    const chartTitle = chart.title?.trim() || ''
    const chartId = String(chart.id || '')

    for (const entry of chart.tracks) {
      const track = entry?.track
      if (!track) continue
      const title = track.title?.trim()
      const artist = track.artists?.[0]?.displayName?.trim()
      if (!title || !artist) continue

      const key = `${normalize(artist)}::${normalize(title)}`
      tracks.push(key)

      // Only keep first attribution per track (most recently published chart)
      if (!seen.has(key)) {
        seen.add(key)
        rich.push({ key, artist, title, charted_by: djName, chart_title: chartTitle, chart_id: chartId })
      }
    }
  }

  return { tracks, rich }
}

async function fetchRACharts(): Promise<{ tracks: string[]; rich: RAChartEntry[] }> {
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
        return extractData(chartsData)
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
        return extractData(chartsData)
      }
    }
  } catch {
    // Fallback also failed
  }

  return { tracks: [], rich: [] }
}

export async function GET() {
  try {
    // Return cached result if still valid
    if (chartCache && Date.now() < chartCache.expires) {
      return NextResponse.json({
        tracks: chartCache.tracks,
        rich: chartCache.rich,
        cached: true,
        count: chartCache.tracks.length,
      })
    }

    const { tracks, rich } = await fetchRACharts()

    // Cache for 6 hours
    chartCache = {
      tracks,
      rich,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    }

    return NextResponse.json({
      tracks,
      rich,
      cached: false,
      count: tracks.length,
    })
  } catch {
    return NextResponse.json({ tracks: [], rich: [], cached: false, count: 0 })
  }
}
