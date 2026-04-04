import { NextRequest, NextResponse } from 'next/server'

// ── Spotify Track Lookup ────────────────────────────────────────────────────
// Uses Client Credentials flow (server-side, no user auth needed)
// Searches for a track by artist + title, returns metadata + audio features
// Add to env: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET

// ── Key conversion maps ────────────────────────────────────────────────────

// Spotify pitch class → note name
const PITCH_CLASS: Record<number, string> = {
  0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F',
  6: 'F#', 7: 'G', 8: 'G#', 9: 'A', 10: 'A#', 11: 'B',
}

// Camelot wheel: [pitchClass][mode] → camelot code
// mode 1 = major, mode 0 = minor
const CAMELOT_MAP: Record<number, Record<number, string>> = {
  0:  { 1: '8B',  0: '5A'  }, // C major / C minor
  1:  { 1: '3B',  0: '12A' }, // C#/Db major / C#/Db minor
  2:  { 1: '10B', 0: '7A'  }, // D major / D minor
  3:  { 1: '5B',  0: '2A'  }, // D#/Eb major / D#/Eb minor
  4:  { 1: '12B', 0: '9A'  }, // E major / E minor
  5:  { 1: '7B',  0: '4A'  }, // F major / F minor
  6:  { 1: '2B',  0: '11A' }, // F#/Gb major / F#/Gb minor
  7:  { 1: '9B',  0: '6A'  }, // G major / G minor
  8:  { 1: '4B',  0: '1A'  }, // G#/Ab major / G#/Ab minor
  9:  { 1: '11B', 0: '8A'  }, // A major / A minor
  10: { 1: '6B',  0: '3A'  }, // A#/Bb major / A#/Bb minor
  11: { 1: '1B',  0: '10A' }, // B major / B minor
}

function toKeyName(pitchClass: number, mode: number): string {
  const note = PITCH_CLASS[pitchClass]
  const quality = mode === 1 ? 'major' : 'minor'
  return note ? `${note} ${quality}` : 'Unknown'
}

function toCamelot(pitchClass: number, mode: number): string | null {
  return CAMELOT_MAP[pitchClass]?.[mode] ?? null
}

// ── Token cache ─────────────────────────────────────────────────────────────

let cachedToken: { token: string; expires: number } | null = null

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60_000) return cachedToken.token

  const clientId     = process.env.SPOTIFY_CLIENT_ID!
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Spotify auth failed: ${JSON.stringify(data)}`)

  cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

// ── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Spotify not configured — add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env.local' },
      { status: 500 }
    )
  }

  try {
    const { artist, title } = await req.json()
    if (!artist || !title) {
      return NextResponse.json({ error: 'Both artist and title are required' }, { status: 400 })
    }

    const token = await getSpotifyToken()

    // ── Search for track ──────────────────────────────────────────────────
    const query = encodeURIComponent(`track:${title} artist:${artist}`)
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!searchRes.ok) {
      const errBody = await searchRes.text()
      throw new Error(`Spotify search failed (${searchRes.status}): ${errBody}`)
    }

    const searchData = await searchRes.json()
    const track = searchData?.tracks?.items?.[0]

    if (!track) {
      return NextResponse.json({ found: false })
    }

    // ── Get audio features ──────────────────────────────────────────────
    let bpm: number | null = null
    let key: string | null = null
    let camelot: string | null = null
    let energy: number | null = null
    let danceability: number | null = null
    let audioFeaturesAvailable = true

    try {
      const featuresRes = await fetch(
        `https://api.spotify.com/v1/audio-features/${track.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (featuresRes.ok) {
        const features = await featuresRes.json()

        if (features && features.tempo) {
          bpm = Math.round(features.tempo)
        }

        if (features && features.key !== undefined && features.key !== -1 && features.mode !== undefined) {
          key = toKeyName(features.key, features.mode)
          camelot = toCamelot(features.key, features.mode)
        }

        if (features && features.energy !== undefined) {
          // Scale 0-1 → 1-10
          energy = Math.round(features.energy * 9 + 1)
        }

        if (features && features.danceability !== undefined) {
          danceability = features.danceability
        }
      } else {
        audioFeaturesAvailable = false
      }
    } catch {
      audioFeaturesAvailable = false
    }

    return NextResponse.json({
      found: true,
      spotify_id: track.id,
      title: track.name,
      artist: track.artists?.map((a: any) => a.name).join(', ') || '',
      bpm,
      key,
      camelot,
      energy,
      danceability,
      duration_ms: track.duration_ms,
      preview_url: track.preview_url || null,
      album_art: track.album?.images?.[0]?.url || null,
      spotify_url: track.external_urls?.spotify || null,
      audio_features_available: audioFeaturesAvailable,
      ...(audioFeaturesAvailable ? {} : { audio_features_note: 'Audio features endpoint unavailable — BPM, key, energy data not returned' }),
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── GET health check ────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    configured: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    message: 'POST { artist, title } to look up a track on Spotify',
  })
}
