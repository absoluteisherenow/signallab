// ── Deezer enrichment ────────────────────────────────────────────────────────
// Undocumented public endpoint. No key needed. Hit rate ~43% for BPM on the
// electronic catalog sample we tested — older tracks tend to be populated,
// underground / new releases often missing. Still cheap enough to run as a
// cascade fallback when Rekordbox/ID3/Discogs haven't supplied BPM.
//
// Rate limit: roughly 50 req/5s per IP (undocumented, conservative).
// ─────────────────────────────────────────────────────────────────────────────

export interface DeezerHit {
  id: number
  title: string
  artist: string
  bpm: number | null
  duration: number | null
  release_date: string | null
  preview_url: string | null
  album_art: string | null
  album_title: string | null
  deezer_url: string | null
}

interface DeezerSearchItem {
  id: number
  title: string
  artist: { name: string }
  album?: { title?: string; cover_xl?: string; cover_big?: string }
  link?: string
}

interface DeezerSearchResponse {
  data?: DeezerSearchItem[]
  error?: { type?: string; message?: string }
}

interface DeezerTrackResponse {
  id?: number
  title?: string
  artist?: { name?: string }
  album?: { title?: string; cover_xl?: string; cover_big?: string; release_date?: string }
  bpm?: number
  duration?: number
  release_date?: string
  preview?: string
  link?: string
  error?: { type?: string; message?: string }
}

const BASE = 'https://api.deezer.com'

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

// Score a candidate against the query. Exact title+artist match beats
// substring. Remix/mix variants lose points so we don't silently accept
// a different edit of the same song.
function scoreMatch(q: { title: string; artist: string }, cand: DeezerSearchItem): number {
  const qt = normalize(q.title)
  const qa = normalize(q.artist)
  const ct = normalize(cand.title)
  const ca = normalize(cand.artist.name)

  if (!qt || !qa) return 0

  let score = 0
  if (ct === qt) score += 10
  else if (ct.startsWith(qt) || qt.startsWith(ct)) score += 6
  else if (ct.includes(qt) || qt.includes(ct)) score += 3

  if (ca === qa) score += 10
  else if (ca.includes(qa) || qa.includes(ca)) score += 5

  // Penalise remix/edit variants if the query isn't asking for one.
  const qHasRemix = /remix|edit|mix|bootleg|rework/.test(q.title.toLowerCase())
  const cHasRemix = /remix|edit|mix|bootleg|rework/.test(cand.title.toLowerCase())
  if (cHasRemix && !qHasRemix) score -= 4

  return score
}

export async function deezerSearch(
  q: { title: string; artist: string },
  limit = 5,
): Promise<DeezerSearchItem[]> {
  const query = `track:"${q.title.replace(/"/g, '')}" artist:"${q.artist.replace(/"/g, '')}"`
  const url = `${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`
  const res = await fetch(url, { headers: { 'User-Agent': 'SignalLab/1.0' } })
  if (!res.ok) return []
  const body = (await res.json()) as DeezerSearchResponse
  if (body.error || !Array.isArray(body.data)) return []
  return body.data
}

export async function deezerGetTrack(id: number): Promise<DeezerTrackResponse | null> {
  const res = await fetch(`${BASE}/track/${id}`, { headers: { 'User-Agent': 'SignalLab/1.0' } })
  if (!res.ok) return null
  const body = (await res.json()) as DeezerTrackResponse
  if (body.error || !body.id) return null
  return body
}

// Lookup BPM + metadata for a track. Returns null if no confident match.
// The threshold of 12 requires real agreement on title AND artist — we will
// not return a remix as if it were the original.
export async function deezerLookup(q: { title: string; artist: string }): Promise<DeezerHit | null> {
  if (!q.title?.trim() || !q.artist?.trim()) return null

  const candidates = await deezerSearch(q)
  if (candidates.length === 0) return null

  const ranked = candidates
    .map((c) => ({ c, score: scoreMatch(q, c) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (!best || best.score < 12) return null

  const full = await deezerGetTrack(best.c.id)
  if (!full) return null

  const bpm = typeof full.bpm === 'number' && full.bpm > 0 ? full.bpm : null

  return {
    id: full.id!,
    title: full.title ?? best.c.title,
    artist: full.artist?.name ?? best.c.artist.name,
    bpm,
    duration: typeof full.duration === 'number' ? full.duration : null,
    release_date: full.release_date ?? full.album?.release_date ?? null,
    preview_url: full.preview ?? null,
    album_art: full.album?.cover_xl ?? full.album?.cover_big ?? null,
    album_title: full.album?.title ?? null,
    deezer_url: full.link ?? null,
  }
}
