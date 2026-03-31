import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://api.beatport.com/v4'

let cachedToken: { token: string; expires: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60_000) return cachedToken.token
  const res = await fetch(`${BASE}/auth/o/token/`, {
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

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name || name.length < 2) {
    return NextResponse.json({ found: false })
  }

  if (!process.env.BEATPORT_CLIENT_ID || !process.env.BEATPORT_CLIENT_SECRET) {
    return NextResponse.json({ found: false, reason: 'beatport_not_configured' })
  }

  try {
    const token = await getToken()

    // Search for artist
    const artistRes = await fetch(`${BASE}/catalog/artists/?query=${encodeURIComponent(name)}&per_page=5`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!artistRes.ok) return NextResponse.json({ found: false })
    const artistData = await artistRes.json()

    const artists = artistData.results || []
    if (!artists.length) return NextResponse.json({ found: false })

    // Find best match (case-insensitive exact match preferred, else first result)
    const exact = artists.find((a: any) => a.name?.toLowerCase() === name.toLowerCase())
    const artist = exact || artists[0]

    // Get their top tracks
    const tracksRes = await fetch(`${BASE}/catalog/tracks/?artist_id=${artist.id}&per_page=5&order_by=-publish_date`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const tracksData = tracksRes.ok ? await tracksRes.json() : { results: [] }
    const tracks = (tracksData.results || []).map((t: any) => ({
      title: t.name,
      bpm: t.bpm,
      key: t.key?.camelot_number && t.key?.camelot_letter
        ? `${t.key.camelot_number}${t.key.camelot_letter}`
        : null,
      genre: t.genre?.name || null,
    }))

    // Derive genre and BPM range from tracks
    const genres = tracks.map((t: any) => t.genre).filter(Boolean)
    const genre = genres[0] || null
    const bpms = tracks.map((t: any) => t.bpm).filter(Boolean)
    const bpmRange = bpms.length > 1
      ? `${Math.min(...bpms)}–${Math.max(...bpms)}`
      : bpms.length === 1 ? `${bpms[0]}` : null

    return NextResponse.json({
      found: true,
      artistName: artist.name,
      beatportId: artist.id,
      genre,
      bpmRange,
      tracks: tracks.slice(0, 3),
    })
  } catch {
    return NextResponse.json({ found: false })
  }
}
