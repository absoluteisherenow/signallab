import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SetLabReferenceRequest {
  query: string
  context_date?: string
}

interface StemMeasurements {
  filename: string
  duration_ms: number
  sample_rate: number
  channels: number
  peak_db: number
  rms_db: number
  dynamic_range_db: number
  spectral_centroid_hz: number
  low_energy_ratio: number
  high_energy_ratio: number
  transient_sharpness: number
  fundamental_hz: number
  crest_factor_db: number
  spectral_flatness: number
}

interface ClaudeTrackResolution {
  title: string
  artist: string
  position: string       // e.g. "closing track", "opener", "track 4"
  venue: string | null
  set_name: string | null
  confidence: 'high' | 'medium' | 'low'
  notes: string
}

interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface SpotifySearchTrack {
  id: string
  name: string
  artists: { name: string }[]
  duration_ms: number
}

interface SpotifySearchResponse {
  tracks: {
    items: SpotifySearchTrack[]
  }
}

interface SpotifyAudioFeatures {
  loudness: number           // typically -60 to 0
  energy: number             // 0-1
  acousticness: number       // 0-1
  tempo: number              // BPM
  danceability: number       // 0-1
  valence: number            // 0-1
  instrumentalness: number   // 0-1
  speechiness: number        // 0-1
  liveness: number           // 0-1
  key: number                // 0-11 (Pitch class)
  mode: number               // 0=minor, 1=major
  time_signature: number
  duration_ms: number
  id: string
}

interface DJTrackRecord {
  title: string
  artist: string
  bpm: number | null
  key: string | null
  camelot: string | null
  energy: number | null
  genre: string | null
  moment_type: string | null
  producer_style: string | null
  similar_to: string | null
  play_count: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a string for fuzzy matching — lowercase, strip punctuation, trim.
 */
function normalise(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Simple fuzzy match — returns true if all words of the needle are present
 * somewhere in the haystack.
 */
function fuzzyMatch(haystack: string, needle: string): boolean {
  const h = normalise(haystack)
  const words = normalise(needle).split(' ').filter(Boolean)
  return words.every(w => h.includes(w))
}

/**
 * Find the best matching track in the library by title + artist.
 */
function findLibraryTrack(
  tracks: DJTrackRecord[],
  title: string,
  artist: string
): DJTrackRecord | null {
  // Exact match first
  const exact = tracks.find(
    t =>
      normalise(t.title) === normalise(title) &&
      normalise(t.artist) === normalise(artist)
  )
  if (exact) return exact

  // Title + partial artist
  const titleArtist = tracks.find(
    t =>
      fuzzyMatch(t.title, title) &&
      fuzzyMatch(t.artist, artist)
  )
  if (titleArtist) return titleArtist

  // Title only
  return tracks.find(t => fuzzyMatch(t.title, title)) ?? null
}

// ── Spotify helpers ───────────────────────────────────────────────────────────

async function getSpotifyToken(
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) return null
    const data: SpotifyTokenResponse = await res.json()
    return data.access_token ?? null
  } catch {
    return null
  }
}

async function searchSpotifyTrack(
  token: string,
  artist: string,
  title: string
): Promise<SpotifySearchTrack | null> {
  try {
    const q = encodeURIComponent(`${artist} ${title}`)
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
    if (!res.ok) return null
    const data: SpotifySearchResponse = await res.json()
    return data?.tracks?.items?.[0] ?? null
  } catch {
    return null
  }
}

async function getSpotifyAudioFeatures(
  token: string,
  trackId: string
): Promise<SpotifyAudioFeatures | null> {
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/audio-features/${trackId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── Measurement builders ──────────────────────────────────────────────────────

/**
 * Genre-based fundamental frequency estimate.
 * Techno / industrial kick sits around 50-60 Hz.
 */
function estimateFundamental(genre: string | null): number {
  const g = (genre ?? '').toLowerCase()
  if (g.includes('techno') || g.includes('industrial')) return 55
  if (g.includes('house')) return 65
  if (g.includes('drum') || g.includes('dnb') || g.includes('jungle')) return 70
  if (g.includes('ambient') || g.includes('drone')) return 110
  return 60 // safe default for dark electronic
}

/**
 * Estimate spectral centroid from energy and genre. Higher energy / brighter
 * genres push the centroid up.
 */
function estimateSpectralCentroid(
  energy: number | null, // 0-1 scale (normalised from library 1-10 or Spotify 0-1)
  genre: string | null
): number {
  const e = energy ?? 0.7
  const g = (genre ?? '').toLowerCase()

  let base = 1200 // balanced default
  if (g.includes('techno') || g.includes('industrial')) base = 900
  else if (g.includes('house')) base = 1400
  else if (g.includes('ambient')) base = 800

  // Energy pushes brightness upward
  return Math.round(base + e * 600)
}

/**
 * Build StemMeasurements from Spotify audio features, supplemented by library
 * data and genre estimates.
 */
function buildFromSpotify(
  resolved: ClaudeTrackResolution,
  spotifyFeatures: SpotifyAudioFeatures,
  spotifyTrack: SpotifySearchTrack,
  libraryTrack: DJTrackRecord | null
): StemMeasurements {
  // Loudness in Spotify is typically -60 to 0 (LUFS-ish integrated)
  // We treat it as peak_db approximation; typical techno masters sit -6 to -4
  const peak_db = Math.max(-30, Math.min(0, spotifyFeatures.loudness + 4))
  const rms_db = peak_db - 6
  const dynamic_range_db = Math.abs(peak_db - rms_db)

  // Energy (0-1) maps to high_energy_ratio and transient_sharpness
  const high_energy_ratio = Math.min(1, spotifyFeatures.energy * 0.6)
  const transient_sharpness = Math.min(1, spotifyFeatures.energy * 0.9)

  // Low energy ratio — inverse of energy, biased for techno (lots of sub)
  const low_energy_ratio = Math.max(0, Math.min(1, 0.55 - spotifyFeatures.energy * 0.2))

  // Spectral flatness — inverse of acousticness (acoustic = tonal = low flatness)
  const spectral_flatness = Math.max(0, Math.min(1, 1 - spotifyFeatures.acousticness))

  // Normalise library energy (1-10) to 0-1 if available
  const libEnergyNorm = libraryTrack?.energy != null
    ? (libraryTrack.energy - 1) / 9
    : null

  const energyForCentroid = libEnergyNorm ?? spotifyFeatures.energy
  const genre = libraryTrack?.genre ?? null

  const spectral_centroid_hz = estimateSpectralCentroid(energyForCentroid, genre)
  const fundamental_hz = estimateFundamental(genre)

  // Crest factor: dynamic range + some energy-based headroom
  const crest_factor_db = Math.max(4, 14 - spotifyFeatures.energy * 8)

  const filename = `${resolved.artist} - ${resolved.title} (reference)`

  return {
    filename,
    duration_ms: spotifyTrack.duration_ms || 360000,
    sample_rate: 44100,
    channels: 2,
    peak_db,
    rms_db,
    dynamic_range_db,
    spectral_centroid_hz,
    low_energy_ratio,
    high_energy_ratio,
    transient_sharpness,
    fundamental_hz,
    crest_factor_db,
    spectral_flatness,
  }
}

/**
 * Build StemMeasurements from library data only (no Spotify).
 * All values are estimated from the DJ library fields.
 */
function buildFromLibrary(
  resolved: ClaudeTrackResolution,
  libraryTrack: DJTrackRecord
): StemMeasurements {
  // Library energy is 1-10; normalise to 0-1
  const energyNorm = libraryTrack.energy != null
    ? (libraryTrack.energy - 1) / 9
    : 0.7

  const peak_db = -8 - (1 - energyNorm) * 8     // high energy → hotter
  const rms_db = peak_db - 6
  const dynamic_range_db = 6

  const spectral_centroid_hz = estimateSpectralCentroid(energyNorm, libraryTrack.genre)
  const fundamental_hz = estimateFundamental(libraryTrack.genre)

  const high_energy_ratio = Math.min(1, energyNorm * 0.55)
  const low_energy_ratio = Math.max(0, 0.50 - energyNorm * 0.15)
  const transient_sharpness = Math.min(1, energyNorm * 0.85)
  const spectral_flatness = 0.35   // reasonable default for mixed electronic material
  const crest_factor_db = Math.max(4, 14 - energyNorm * 8)

  const filename = `${resolved.artist} - ${resolved.title} (reference)`

  return {
    filename,
    duration_ms: 360000,
    sample_rate: 44100,
    channels: 2,
    peak_db,
    rms_db,
    dynamic_range_db,
    spectral_centroid_hz,
    low_energy_ratio,
    high_energy_ratio,
    transient_sharpness,
    fundamental_hz,
    crest_factor_db,
    spectral_flatness,
  }
}

/**
 * Build fully estimated StemMeasurements when neither Spotify nor library data
 * is available — uses generic dark-techno defaults.
 */
function buildEstimated(resolved: ClaudeTrackResolution): StemMeasurements {
  const filename = `${resolved.artist} - ${resolved.title} (reference)`

  return {
    filename,
    duration_ms: 360000,
    sample_rate: 44100,
    channels: 2,
    peak_db: -8,
    rms_db: -14,
    dynamic_range_db: 6,
    spectral_centroid_hz: 1000,
    low_energy_ratio: 0.45,
    high_energy_ratio: 0.30,
    transient_sharpness: 0.65,
    fundamental_hz: 55,
    crest_factor_db: 10,
    spectral_flatness: 0.35,
  }
}

// ── Claude resolution ─────────────────────────────────────────────────────────

function buildResolutionSystemPrompt(todayStr: string): string {
  return `You are an expert DJ set analyst for Night Manoeuvres, an electronic music artist based in Dublin. You help identify specific tracks from natural language descriptions like "the track I closed my set with at Pitch last week" or "the opening track from my techno set in Berlin".

TODAY'S DATE: ${todayStr}
When resolving time references — "last week", "yesterday", "last month", "last night" — compute them relative to today's date (${todayStr}).

You are given the artist's complete DJ set history and track library as JSON. Your job is to identify the single most likely track being referenced.

RULES:
- Use set order: "closer" or "closing track" = last track in set, "opener" = first track, "second track" = index 1, etc.
- Venue matching: match loosely — "Pitch" can match "Pitch Music and Arts", "pitch" in venue field, etc.
- Date matching: "last week" = within the 7 days prior to today; "last night" = yesterday's date or the most recent set.
- If multiple sets match the time/venue, prefer the most recently created one.
- If you are confident you know the exact track, return title and artist. If you are NOT confident, return "unknown": true — NEVER guess or fabricate an artist name.

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences, starting with { ending with }:

{
  "title": "<track title>",
  "artist": "<track artist>",
  "position": "<human-readable position e.g. 'closing track', 'opener', 'track 4 of 12'>",
  "venue": "<venue name or null>",
  "set_name": "<name of the set or null>",
  "confidence": "<high|medium|low>",
  "notes": "<1-2 sentences explaining your reasoning>"
}`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = await env('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500, headers: corsHeaders }
    )
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: SetLabReferenceRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders }
    )
  }

  if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: 'query field is required and must be a non-empty string' },
      { status: 400, headers: corsHeaders }
    )
  }

  // ── Resolve context date ────────────────────────────────────────────────────
  const contextDate = body.context_date ? new Date(body.context_date) : new Date()
  const todayStr = contextDate.toISOString().split('T')[0]

  // ── Fetch sets and tracks from Supabase in parallel ─────────────────────────
  const [setsRes, tracksRes] = await Promise.allSettled([
    supabase
      .from('dj_sets')
      .select('id, name, venue, slot_type, tracks, created_at')
      .order('created_at', { ascending: false })
      .limit(20),

    supabase
      .from('dj_tracks')
      .select('title, artist, bpm, key, camelot, energy, genre, moment_type, producer_style, similar_to, play_count')
      .order('play_count', { ascending: false })
      .limit(200),
  ])

  const rawSets  = setsRes.status    === 'fulfilled' ? (setsRes.value.data    || []) : []
  const rawTracks = tracksRes.status === 'fulfilled' ? (tracksRes.value.data  || []) : []

  // Parse track lists inside each set
  const sets = rawSets.map((s: Record<string, unknown>) => {
    let parsedTracks: unknown[] = []
    try {
      if (typeof s.tracks === 'string') {
        parsedTracks = JSON.parse(s.tracks)
      } else if (Array.isArray(s.tracks)) {
        parsedTracks = s.tracks
      }
    } catch {
      parsedTracks = []
    }
    return { ...s, tracks: parsedTracks }
  })

  const tracks = rawTracks as DJTrackRecord[]

  // ── Call Claude Haiku to resolve the reference ──────────────────────────────
  const systemPrompt = buildResolutionSystemPrompt(todayStr)
  const userPrompt = `ARTIST DATA:
${JSON.stringify({ today: todayStr, recent_sets: sets, track_library: tracks }, null, 2)}

USER QUERY: "${body.query.trim()}"

Identify the single track being referenced. Return only the JSON.`

  let resolved: ClaudeTrackResolution
  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const claudeData = await claudeRes.json()

    if (!claudeRes.ok) {
      const msg = claudeData?.error?.message || `Anthropic API error ${claudeRes.status}`
      return NextResponse.json(
        { success: false, error: msg },
        { status: claudeRes.status, headers: corsHeaders }
      )
    }

    const rawText: string = claudeData?.content?.[0]?.text ?? ''
    if (!rawText) {
      return NextResponse.json(
        { success: false, error: 'Empty response from Claude' },
        { status: 502, headers: corsHeaders }
      )
    }

    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    resolved = JSON.parse(jsonText) as ClaudeTrackResolution
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve track reference'
    return NextResponse.json(
      { success: false, error: message },
      { status: 502, headers: corsHeaders }
    )
  }

  // ── Look up track in library ────────────────────────────────────────────────
  const libraryTrack = findLibraryTrack(tracks, resolved.title, resolved.artist)

  // ── Attempt Spotify enrichment ──────────────────────────────────────────────
  const spotifyClientId     = process.env.SPOTIFY_CLIENT_ID
  const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET

  let measurements: StemMeasurements
  let source: 'spotify' | 'library' | 'estimated'

  if (spotifyClientId && spotifyClientSecret) {
    const token = await getSpotifyToken(spotifyClientId, spotifyClientSecret)

    if (token) {
      const spotifyTrack = await searchSpotifyTrack(token, resolved.artist, resolved.title)

      if (spotifyTrack) {
        const audioFeatures = await getSpotifyAudioFeatures(token, spotifyTrack.id)

        if (audioFeatures) {
          measurements = buildFromSpotify(resolved, audioFeatures, spotifyTrack, libraryTrack)
          source = 'spotify'
        } else {
          // Spotify track found but audio features unavailable
          measurements = libraryTrack
            ? buildFromLibrary(resolved, libraryTrack)
            : buildEstimated(resolved)
          source = libraryTrack ? 'library' : 'estimated'
        }
      } else {
        // No Spotify search result
        measurements = libraryTrack
          ? buildFromLibrary(resolved, libraryTrack)
          : buildEstimated(resolved)
        source = libraryTrack ? 'library' : 'estimated'
      }
    } else {
      // Token fetch failed
      measurements = libraryTrack
        ? buildFromLibrary(resolved, libraryTrack)
        : buildEstimated(resolved)
      source = libraryTrack ? 'library' : 'estimated'
    }
  } else {
    // No Spotify credentials configured
    measurements = libraryTrack
      ? buildFromLibrary(resolved, libraryTrack)
      : buildEstimated(resolved)
    source = libraryTrack ? 'library' : 'estimated'
  }

  // ── Build track metadata response ───────────────────────────────────────────
  const trackMeta = {
    title:    resolved.title,
    artist:   resolved.artist,
    bpm:      libraryTrack?.bpm ?? null,
    key:      libraryTrack?.key ?? null,
    venue:    resolved.venue,
    set_name: resolved.set_name,
    position: resolved.position,
  }

  return NextResponse.json(
    {
      success: true,
      track: trackMeta,
      measurements,
      source,
    },
    { headers: corsHeaders }
  )
}
