// ── MusicBrainz enrichment ───────────────────────────────────────────────────
// Free, open, no key needed — but strict on rate limits (1 req/sec per IP)
// and User-Agent headers. We use it for:
//
//   - Canonical artist name (resolves misspellings / feat. chaos)
//   - Producer / remixer relations (who actually made this)
//   - Release year / first-release date
//   - ISRC (useful for cross-source joins later)
//
// MusicBrainz does NOT supply BPM, key, or energy — that's Deezer / bliss /
// Essentia. Keep this module focused on identity + credits.
// ─────────────────────────────────────────────────────────────────────────────

export interface MBRelation {
  type: string
  direction?: 'forward' | 'backward'
  artist?: { id: string; name: string; 'sort-name'?: string }
  work?: { id: string; title: string }
}

export interface MBRecording {
  id: string
  title: string
  length?: number | null
  'first-release-date'?: string
  isrcs?: string[]
  'artist-credit'?: Array<{
    name: string
    joinphrase?: string
    artist: { id: string; name: string; 'sort-name'?: string }
  }>
  relations?: MBRelation[]
  releases?: Array<{ id: string; title: string; date?: string }>
  score?: number
}

export interface MBLookup {
  mbid: string
  title: string
  artist: string
  artist_sort: string | null
  canonical_artists: Array<{ id: string; name: string; sort_name: string | null }>
  producers: string[]
  remixers: string[]
  release_year: number | null
  first_release_date: string | null
  isrc: string | null
  musicbrainz_url: string
}

const BASE = 'https://musicbrainz.org/ws/2'
const UA = 'SignalLab/1.0 (https://signallabos.com; support@signallabos.com)'

// MusicBrainz requires ≤1 req/sec. This is a simple promise chain to
// serialise calls from the same worker instance. Won't protect across
// horizontal workers, but our cascade runs one track at a time anyway.
let chain: Promise<unknown> = Promise.resolve()
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => fn()).finally(() => new Promise((r) => setTimeout(r, 1050)))
  chain = run.catch(() => {})
  return run
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

// Lucene-escape the bits that break MB's search parser.
function luceneEscape(s: string): string {
  return s.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1')
}

interface MBSearchResponse {
  recordings?: MBRecording[]
  error?: string
}

export async function mbSearchRecording(q: {
  title: string
  artist: string
}): Promise<MBRecording[]> {
  const title = luceneEscape(q.title)
  const artist = luceneEscape(q.artist)
  const query = `recording:"${title}" AND artist:"${artist}"`
  const url = `${BASE}/recording/?query=${encodeURIComponent(query)}&limit=10&fmt=json`
  const res = await throttle(() => fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }))
  if (!res.ok) return []
  const body = (await res.json()) as MBSearchResponse
  return Array.isArray(body.recordings) ? body.recordings : []
}

export async function mbGetRecording(mbid: string): Promise<MBRecording | null> {
  const url = `${BASE}/recording/${mbid}?inc=artist-credits+releases+isrcs+artist-rels+work-rels&fmt=json`
  const res = await throttle(() => fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }))
  if (!res.ok) return null
  return (await res.json()) as MBRecording
}

function scoreMatch(q: { title: string; artist: string }, cand: MBRecording): number {
  const qt = normalize(q.title)
  const qa = normalize(q.artist)
  const ct = normalize(cand.title)
  const ca = normalize((cand['artist-credit'] ?? []).map((c) => c.artist.name).join(' '))

  if (!qt || !qa) return 0

  let score = 0
  if (ct === qt) score += 10
  else if (ct.includes(qt) || qt.includes(ct)) score += 4

  if (ca.includes(qa)) score += 10
  else if (qa.includes(ca.split(/\s+/)[0] ?? '')) score += 4

  // MB's own relevance score nudges the ranking.
  if (typeof cand.score === 'number') score += Math.floor(cand.score / 20)

  return score
}

function extractYear(date?: string | null): number | null {
  if (!date) return null
  const m = /^(\d{4})/.exec(date)
  return m ? Number(m[1]) : null
}

export async function musicbrainzLookup(q: {
  title: string
  artist: string
}): Promise<MBLookup | null> {
  if (!q.title?.trim() || !q.artist?.trim()) return null

  const candidates = await mbSearchRecording(q)
  if (candidates.length === 0) return null

  const ranked = candidates
    .map((c) => ({ c, score: scoreMatch(q, c) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (!best || best.score < 14) return null

  const full = (await mbGetRecording(best.c.id)) ?? best.c

  const credits = full['artist-credit'] ?? []
  const primaryArtist = credits[0]?.artist
  const joinedArtist = credits.map((c) => (c.name || c.artist.name) + (c.joinphrase || '')).join('').trim()

  const rels = full.relations ?? []
  const producers = rels
    .filter((r) => r.type === 'producer' && r.artist)
    .map((r) => r.artist!.name)
  const remixers = rels
    .filter((r) => r.type === 'remixer' && r.artist)
    .map((r) => r.artist!.name)

  const earliestRelease =
    full.releases?.map((r) => r.date).filter(Boolean).sort()[0] ?? full['first-release-date'] ?? null

  return {
    mbid: full.id,
    title: full.title,
    artist: joinedArtist || primaryArtist?.name || q.artist,
    artist_sort: primaryArtist?.['sort-name'] ?? null,
    canonical_artists: credits.map((c) => ({
      id: c.artist.id,
      name: c.artist.name,
      sort_name: c.artist['sort-name'] ?? null,
    })),
    producers: Array.from(new Set(producers)),
    remixers: Array.from(new Set(remixers)),
    release_year: extractYear(earliestRelease),
    first_release_date: earliestRelease ?? null,
    isrc: full.isrcs?.[0] ?? null,
    musicbrainz_url: `https://musicbrainz.org/recording/${full.id}`,
  }
}
