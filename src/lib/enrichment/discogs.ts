// ── Discogs enrichment ───────────────────────────────────────────────────────
// Discogs is the best open source of electronic-music sub-genre tags,
// label, catalogue number, and release year. It does NOT supply BPM, key,
// or energy — those come from Deezer / bliss / Essentia.
//
// Rate limit: 60 req/min per token. We hit the same `discogs_cache` table
// used by `/api/discogs` so cache hits are shared across the app.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface DiscogsHit {
  release_id: number
  master_id: number | null
  title: string
  artist: string
  label: string | null
  label_id: number | null
  catalog_number: string | null
  genre: string | null
  styles: string[]
  year: number | null
  country: string | null
  format: string | null
  thumb: string | null
  discogs_url: string | null
}

const BASE = 'https://api.discogs.com'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface DiscogsSearchResult {
  id: number
  master_id?: number
  title?: string
  label?: string[]
  style?: string[]
  genre?: string[]
  year?: number | string
  thumb?: string
  cover_image?: string
  uri?: string
  country?: string
  format?: string[]
  catno?: string
  community?: { want?: number; have?: number }
}

interface DiscogsSearchResponse {
  results?: DiscogsSearchResult[]
}

interface DiscogsReleaseDetail {
  id?: number
  title?: string
  artists?: Array<{ name: string; id?: number }>
  labels?: Array<{ name: string; id: number; catno?: string }>
  styles?: string[]
  genres?: string[]
  year?: number
  country?: string
  uri?: string
  released?: string
  thumb?: string
  images?: Array<{ uri?: string; uri150?: string; resource_url?: string }>
}

let _supabase: SupabaseClient | null = null
function supabase(): SupabaseClient {
  if (_supabase) return _supabase
  _supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return _supabase
}

// Rolling 60/min rate limiter shared across the module instance.
const timestamps: number[] = []
function canFire(): boolean {
  const now = Date.now()
  while (timestamps.length && timestamps[0] < now - 60_000) timestamps.shift()
  if (timestamps.length >= 60) return false
  timestamps.push(now)
  return true
}

async function discogsFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = process.env.DISCOGS_PERSONAL_TOKEN
  if (!token) throw new Error('DISCOGS_PERSONAL_TOKEN not configured')
  if (!canFire()) throw new Error('Discogs rate limited')

  const url = new URL(`${BASE}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Discogs token=${token}`,
      'User-Agent': 'SignalLabOS/1.0',
    },
  })
  if (!res.ok) throw new Error(`Discogs ${res.status}`)
  return (await res.json()) as T
}

async function getCache<T>(key: string): Promise<T | null> {
  const { data } = await supabase()
    .from('discogs_cache')
    .select('response_data, expires_at')
    .eq('query_type', 'enrich-resolve')
    .eq('query_key', key)
    .single()
  if (data && new Date(data.expires_at) > new Date()) return data.response_data as T
  return null
}

async function setCache(key: string, value: unknown): Promise<void> {
  const expires_at = new Date(Date.now() + CACHE_TTL_MS).toISOString()
  await supabase()
    .from('discogs_cache')
    .upsert(
      { query_type: 'enrich-resolve', query_key: key, response_data: value, expires_at },
      { onConflict: 'query_type,query_key' },
    )
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

function scoreMatch(q: { title: string; artist: string }, cand: DiscogsSearchResult): number {
  const qt = normalize(q.title)
  const qa = normalize(q.artist)
  const t = normalize(cand.title || '')

  if (!qt || !qa) return 0

  let score = 0
  // Discogs search titles are "Artist - Title" — look for both substrings.
  if (t.includes(qa)) score += 8
  if (t.includes(qt)) score += 8
  if (t.includes(qa) && t.includes(qt)) score += 4

  // "Master" releases are usually the canonical entry; nudge them up.
  if (cand.master_id) score += 2

  // Community signal — more in collection = more likely the real release.
  const have = cand.community?.have ?? 0
  if (have > 50) score += 2
  if (have > 500) score += 2

  return score
}

export async function discogsLookup(q: {
  title: string
  artist: string
}): Promise<DiscogsHit | null> {
  if (!q.title?.trim() || !q.artist?.trim()) return null

  const cacheKey = `${q.artist.toLowerCase()}::${q.title.toLowerCase()}`
  const cached = await getCache<DiscogsHit | null>(cacheKey)
  if (cached !== null) return cached

  const search = await discogsFetch<DiscogsSearchResponse>('/database/search', {
    q: `${q.artist} ${q.title}`,
    type: 'release',
    per_page: '10',
  })

  const candidates = search.results ?? []
  const ranked = candidates
    .map((c) => ({ c, score: scoreMatch(q, c) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (!best || best.score < 14) {
    await setCache(cacheKey, null)
    return null
  }

  // Pull full release for label + catalogue number + canonical year.
  let detail: DiscogsReleaseDetail | null = null
  try {
    detail = await discogsFetch<DiscogsReleaseDetail>(`/releases/${best.c.id}`)
  } catch {
    // Non-fatal — fall back to search payload.
  }

  const label = detail?.labels?.[0]
  const yearRaw = detail?.year ?? best.c.year
  const year = typeof yearRaw === 'string' ? Number(yearRaw) || null : yearRaw ?? null

  const hit: DiscogsHit = {
    release_id: best.c.id,
    master_id: best.c.master_id ?? null,
    title: detail?.title ?? best.c.title ?? q.title,
    artist: detail?.artists?.map((a) => a.name).join(', ') ?? q.artist,
    label: label?.name ?? best.c.label?.[0] ?? null,
    label_id: label?.id ?? null,
    catalog_number: label?.catno ?? best.c.catno ?? null,
    genre: detail?.genres?.[0] ?? best.c.genre?.[0] ?? null,
    styles: detail?.styles ?? best.c.style ?? [],
    year: year,
    country: detail?.country ?? best.c.country ?? null,
    format: (detail ? undefined : best.c.format?.join(', ')) ?? null,
    thumb: detail?.images?.[0]?.uri150 ?? best.c.thumb ?? best.c.cover_image ?? null,
    discogs_url: detail?.uri ?? (best.c.uri ? `https://www.discogs.com${best.c.uri}` : null),
  }

  await setCache(cacheKey, hit)
  return hit
}
