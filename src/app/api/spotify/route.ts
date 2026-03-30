import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const LASTFM_API_KEY = process.env.LASTFM_API_KEY!

// ── Camelot wheel — compatible keys ────────────────────────────────────────
const CAMELOT_WHEEL: Record<string, string[]> = {
  '1A': ['1A','2A','12A','1B'], '2A': ['2A','3A','1A','2B'], '3A': ['3A','4A','2A','3B'],
  '4A': ['4A','5A','3A','4B'], '5A': ['5A','6A','4A','5B'], '6A': ['6A','7A','5A','6B'],
  '7A': ['7A','8A','6A','7B'], '8A': ['8A','9A','7A','8B'], '9A': ['9A','10A','8A','9B'],
  '10A': ['10A','11A','9A','10B'], '11A': ['11A','12A','10A','11B'], '12A': ['12A','1A','11A','12B'],
  '1B': ['1B','2B','12B','1A'], '2B': ['2B','3B','1B','2A'], '3B': ['3B','4B','2B','3A'],
  '4B': ['4B','5B','3B','4A'], '5B': ['5B','6B','4B','5A'], '6B': ['6B','7B','5B','6A'],
  '7B': ['7B','8B','6B','7A'], '8B': ['8B','9B','7B','8A'], '9B': ['9B','10B','8B','9A'],
  '10B': ['10B','11B','9B','10A'], '11B': ['11B','12B','10B','11A'], '12B': ['12B','1B','11B','12A'],
}

async function getSpotifyToken(): Promise<string> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Spotify auth failed')
  return data.access_token
}

async function searchSpotify(token: string, artist: string, title: string): Promise<any | null> {
  const q = encodeURIComponent(`track:${title} artist:${artist}`)
  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  const track = data.tracks?.items?.[0]
  if (!track) return null
  return {
    id: track.id,
    title: track.name,
    artist: track.artists.map((a: any) => a.name).join(', '),
    popularity: track.popularity,
    preview_url: track.preview_url,
    spotify_url: track.external_urls?.spotify,
    album_art: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url,
    album: track.album?.name,
    release_year: track.album?.release_date?.slice(0, 4),
  }
}

// ── Last.fm: get similar tracks for a seed track ───────────────────────────
async function getLastFmSimilar(artist: string, title: string, limit = 20): Promise<{ artist: string; title: string; match: number }[]> {
  const params = new URLSearchParams({
    method: 'track.getSimilar',
    artist,
    track: title,
    limit: String(limit),
    autocorrect: '1',
    api_key: LASTFM_API_KEY,
    format: 'json',
  })
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`)
  const data = await res.json()
  const similar = data.similartracks?.track || []
  return similar.map((t: any) => ({
    artist: t.artist?.name || '',
    title: t.name || '',
    match: parseFloat(t.match) || 0,
  }))
}

// ── Claude: suggest tracks by style/key/BPM context ───────────────────────
async function getClaudeSuggestions(
  tracks: any[],
  maxPopularity: number,
  limit: number,
  dominantCamelot: string,
  avgBpm: number
): Promise<{ artist: string; title: string; camelot: string; bpm: number; reason: string }[]> {
  const compatible = CAMELOT_WHEEL[dominantCamelot] || [dominantCamelot]
  const popularityDesc =
    maxPopularity < 25 ? 'extremely rare, deep underground, cult following only' :
    maxPopularity < 45 ? 'underground and lesser-known, not mainstream' :
    maxPopularity < 65 ? 'moderately known, not chart hits' : 'well known'

  const seedList = tracks.slice(0, 10).map(t => `${t.artist} — ${t.title} (${t.bpm}BPM, ${t.camelot})`).join('\n')

  const prompt = `You are a DJ music expert. A DJ's library contains these tracks:
${seedList}

Target profile:
- Dominant key: ${dominantCamelot} (compatible keys: ${compatible.join(', ')})
- Average BPM: ${avgBpm} (suggest tracks within ±8 BPM: ${avgBpm - 8}–${avgBpm + 8})
- Popularity level wanted: ${popularityDesc} (Spotify popularity score max ${maxPopularity} out of 100)

Suggest exactly ${limit} real tracks that fit this DJ's sound. Focus on ${popularityDesc} music in the electronic/dance genre.

Return ONLY a JSON array, no markdown:
[{"artist": "Artist Name", "title": "Track Title", "camelot": "8A", "bpm": 128, "reason": "one sentence why it fits"}]`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  const text = data.content?.[0]?.text || '[]'
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return []
  }
}

// POST /api/spotify
// Body: { tracks: [{artist, title, bpm, camelot}], maxPopularity: 35, limit: 20 }
export async function POST(req: NextRequest) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'Spotify credentials not configured' }, { status: 500 })
  }

  try {
    const { tracks, maxPopularity = 35, limit = 20 } = await req.json()
    if (!tracks?.length) return NextResponse.json({ error: 'No tracks provided' }, { status: 400 })

    const avgBpm = Math.round(tracks.reduce((s: number, t: any) => s + (t.bpm || 128), 0) / tracks.length)
    const dominantCamelot = tracks
      .map((t: any) => t.camelot)
      .filter(Boolean)
      .sort((a: string, b: string) =>
        tracks.filter((t: any) => t.camelot === b).length - tracks.filter((t: any) => t.camelot === a).length
      )[0] || '8A'

    // Pick best Last.fm seeds: top 3 tracks with known artist/title
    const lastFmSeeds = tracks.filter((t: any) => t.artist && t.title).slice(0, 3)

    // Run Claude + Last.fm in parallel (separate Promise.all to keep types clean)
    const [claudeSuggestions, lastFmBatches] = await Promise.all([
      ANTHROPIC_API_KEY
        ? getClaudeSuggestions(tracks, maxPopularity, 15, dominantCamelot, avgBpm)
        : Promise.resolve([] as { artist: string; title: string; camelot: string; bpm: number; reason: string }[]),
      LASTFM_API_KEY && lastFmSeeds.length
        ? Promise.all(lastFmSeeds.map((t: any) => getLastFmSimilar(t.artist, t.title, 20)))
        : Promise.resolve([] as { artist: string; title: string; match: number }[][]),
    ])

    const lastFmSimilar = (Array.isArray(lastFmBatches[0]) ? lastFmBatches.flat() : []) as { artist: string; title: string; match: number }[]

    // Merge: Claude suggestions + Last.fm similar (deduplicated by title)
    const seen = new Set<string>()
    const merged: { artist: string; title: string; camelot?: string; bpm?: number; reason?: string; source: string }[] = []

    for (const s of claudeSuggestions) {
      const key = `${s.artist.toLowerCase()}::${s.title.toLowerCase()}`
      if (!seen.has(key)) { seen.add(key); merged.push({ ...s, source: 'claude' }) }
    }
    for (const s of lastFmSimilar) {
      const key = `${s.artist.toLowerCase()}::${s.title.toLowerCase()}`
      if (!seen.has(key)) { seen.add(key); merged.push({ ...s, source: 'lastfm' }) }
    }

    if (!merged.length) {
      return NextResponse.json({ tracks: [], targetCamelot: dominantCamelot, targetBpm: avgBpm })
    }

    // Look up each on Spotify for metadata + popularity filter
    const token = await getSpotifyToken()
    const results: any[] = []

    for (const sug of merged) {
      if (results.length >= limit) break
      try {
        const spotifyData = await searchSpotify(token, sug.artist, sug.title)
        if (!spotifyData) continue
        if (spotifyData.popularity > maxPopularity) continue

        results.push({
          ...spotifyData,
          camelot: sug.camelot || null,
          bpm: sug.bpm || null,
          reason: sug.reason || null,
          source: sug.source,
        })
      } catch {
        // skip
      }
    }

    results.sort((a, b) => a.popularity - b.popularity)

    return NextResponse.json({
      tracks: results,
      targetCamelot: dominantCamelot,
      targetBpm: avgBpm,
      seedCount: tracks.length,
      debug: {
        lastFmSeeds: lastFmSeeds.map((t: any) => `${t.artist} — ${t.title}`),
        claudeCount: claudeSuggestions.length,
        lastFmCount: lastFmSimilar.length,
        mergedBeforeFilter: merged.length,
        afterPopularityFilter: results.length,
      },
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
