import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DISCOGS_BASE = 'https://api.discogs.com'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ── Rate limiter (60 req/min rolling window) ────────────────────────────────
const requestTimestamps: number[] = []
const RATE_LIMIT = 60
const RATE_WINDOW = 60_000

function checkRateLimit(): boolean {
  const now = Date.now()
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT) return false
  requestTimestamps.push(now)
  return true
}

// ── Discogs fetch helper ────────────────────────────────────────────────────
async function discogsFetch(path: string, params?: Record<string, string>): Promise<any> {
  const token = process.env.DISCOGS_PERSONAL_TOKEN
  if (!token) throw new Error('DISCOGS_PERSONAL_TOKEN not configured')

  if (!checkRateLimit()) {
    throw new Error('Rate limited — try again in a moment')
  }

  const url = new URL(`${DISCOGS_BASE}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Discogs token=${token}`,
      'User-Agent': 'SignalLabOS/1.0',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Discogs API ${res.status}: ${text.slice(0, 200)}`)
  }

  return res.json()
}

// ── Cache helpers ───────────────────────────────────────────────────────────
async function getCache(queryType: string, queryKey: string): Promise<any | null> {
  const { data } = await supabase
    .from('discogs_cache')
    .select('response_data, expires_at')
    .eq('query_type', queryType)
    .eq('query_key', queryKey)
    .single()

  if (data && new Date(data.expires_at) > new Date()) {
    return data.response_data
  }
  return null
}

async function setCache(queryType: string, queryKey: string, responseData: any): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
  await supabase
    .from('discogs_cache')
    .upsert({
      query_type: queryType,
      query_key: queryKey,
      response_data: responseData,
      expires_at: expiresAt,
    }, { onConflict: 'query_type,query_key' })
}

// ── Action handlers ─────────────────────────────────────────────────────────

async function resolveTrack(artist: string, title: string) {
  const cacheKey = `${artist.toLowerCase()}::${title.toLowerCase()}`
  const cached = await getCache('resolve', cacheKey)
  if (cached) return cached

  const data = await discogsFetch('/database/search', {
    q: `${artist} ${title}`,
    type: 'release',
    per_page: '5',
  })

  const results = (data.results || []).slice(0, 5)
  if (results.length === 0) {
    return { resolved: false, results: [] }
  }

  // Pick the best match — prefer master releases, highest community rating
  const best = results[0]
  const labelParts = (best.label || [])
  const resolved = {
    resolved: true,
    release_id: best.id,
    master_id: best.master_id,
    label_name: labelParts[0] || '',
    label_id: null as number | null,
    styles: best.style || [],
    genre: (best.genre || [])[0] || '',
    year: best.year || 0,
    thumb: best.thumb || best.cover_image || '',
    discogs_url: best.resource_url ? `https://www.discogs.com${best.uri}` : '',
    title: best.title || '',
    format: (best.format || []).join(', '),
  }

  // Get label ID from the release details if we have a release_id
  if (resolved.release_id) {
    try {
      const releaseData = await discogsFetch(`/releases/${resolved.release_id}`)
      if (releaseData.labels?.[0]?.id) {
        resolved.label_id = releaseData.labels[0].id
        resolved.label_name = releaseData.labels[0].name || resolved.label_name
      }
      if (releaseData.styles?.length) resolved.styles = releaseData.styles
      if (releaseData.year) resolved.year = releaseData.year
    } catch { /* non-critical — continue with search data */ }
  }

  await setCache('resolve', cacheKey, resolved)
  return resolved
}

async function labelDig(labelId: number, labelName: string) {
  const cacheKey = `label::${labelId}`
  const cached = await getCache('label-dig', cacheKey)
  if (cached) return cached

  const data = await discogsFetch(`/labels/${labelId}/releases`, {
    sort: 'year',
    sort_order: 'desc',
    per_page: '50',
  })

  const releases = (data.releases || []).map((r: any) => ({
    id: r.id,
    title: r.title || '',
    artist: r.artist || '',
    year: r.year || 0,
    thumb: r.thumb || '',
    discogs_url: `https://www.discogs.com${r.resource_url?.replace('https://api.discogs.com', '') || ''}`,
    format: r.format || '',
    status: r.status || '',
    label_name: labelName,
    community_want: r.stats?.community?.in_wantlist || 0,
    community_have: r.stats?.community?.in_collection || 0,
    want_have_ratio: r.stats?.community?.in_wantlist && r.stats?.community?.in_collection
      ? +(r.stats.community.in_wantlist / r.stats.community.in_collection).toFixed(2)
      : 0,
  }))

  // Sort by want/have ratio descending (most sought-after first)
  releases.sort((a: any, b: any) => b.want_have_ratio - a.want_have_ratio)

  const result = { releases, label_name: labelName, label_id: labelId }
  await setCache('label-dig', cacheKey, result)
  return result
}

async function artistDig(artistName: string) {
  const cacheKey = `artist::${artistName.toLowerCase()}`
  const cached = await getCache('artist-dig', cacheKey)
  if (cached) return cached

  // Search for the artist
  const searchData = await discogsFetch('/database/search', {
    q: artistName,
    type: 'artist',
    per_page: '3',
  })

  const artists = searchData.results || []
  if (artists.length === 0) {
    return { releases: [], artist_name: artistName, aliases: [] }
  }

  const artistId = artists[0].id

  // Fetch artist details for aliases
  let aliases: string[] = []
  try {
    const artistDetail = await discogsFetch(`/artists/${artistId}`)
    aliases = (artistDetail.aliases || []).map((a: any) => a.name)
  } catch { /* non-critical */ }

  // Fetch releases
  const releasesData = await discogsFetch(`/artists/${artistId}/releases`, {
    sort: 'year',
    sort_order: 'desc',
    per_page: '50',
  })

  const releases = (releasesData.releases || []).map((r: any) => ({
    id: r.id,
    title: r.title || '',
    artist: r.artist || artistName,
    year: r.year || 0,
    thumb: r.thumb || '',
    discogs_url: `https://www.discogs.com${r.resource_url?.replace('https://api.discogs.com', '') || ''}`,
    format: r.format || '',
    role: r.role || 'Main',
    label_name: (r.label || ''),
    type: r.type || 'release',
    community_want: r.stats?.community?.in_wantlist || 0,
    community_have: r.stats?.community?.in_collection || 0,
  }))

  const result = { releases, artist_name: artistName, artist_id: artistId, aliases }
  await setCache('artist-dig', cacheKey, result)
  return result
}

async function styleDig(style: string, year: number) {
  const yearFrom = year - 3
  const yearTo = year + 3
  const cacheKey = `style::${style.toLowerCase()}::${yearFrom}-${yearTo}`
  const cached = await getCache('style-dig', cacheKey)
  if (cached) return cached

  const data = await discogsFetch('/database/search', {
    style: style,
    year: `${yearFrom}-${yearTo}`,
    type: 'release',
    sort: 'want',
    sort_order: 'desc',
    per_page: '50',
  })

  const releases = (data.results || []).map((r: any) => ({
    id: r.id,
    title: r.title || '',
    artist: '', // Search results have "Artist - Title" in title field
    year: r.year || 0,
    thumb: r.thumb || r.cover_image || '',
    discogs_url: `https://www.discogs.com${r.uri || ''}`,
    format: (r.format || []).join(', '),
    label_name: (r.label || [])[0] || '',
    styles: r.style || [],
    genre: (r.genre || [])[0] || '',
    community_want: r.community?.want || 0,
    community_have: r.community?.have || 0,
    want_have_ratio: r.community?.want && r.community?.have
      ? +(r.community.want / r.community.have).toFixed(2)
      : 0,
  }))

  // Parse "Artist - Title" format from search results
  for (const rel of releases) {
    if (!rel.artist && rel.title.includes(' - ')) {
      const parts = rel.title.split(' - ')
      rel.artist = parts[0].trim()
      rel.title = parts.slice(1).join(' - ').trim()
    }
  }

  const result = { releases, style, year_range: `${yearFrom}-${yearTo}` }
  await setCache('style-dig', cacheKey, result)
  return result
}

async function creditDig(releaseId: number) {
  const cacheKey = `credit::${releaseId}`
  const cached = await getCache('credit-dig', cacheKey)
  if (cached) return cached

  // Fetch full release to get extraartists / credits
  const releaseData = await discogsFetch(`/releases/${releaseId}`)

  const credits = (releaseData.extraartists || [])
    .filter((c: any) => ['Producer', 'Remix', 'Written-By', 'Mixed By', 'Engineer', 'Mastered By'].some(
      role => (c.role || '').toLowerCase().includes(role.toLowerCase())
    ))
    .slice(0, 4) // Cap at 4 to stay within rate limits

  if (credits.length === 0) {
    return { releases: [], credits: [], release_title: releaseData.title }
  }

  // Search for other releases by each credited person
  const creditSearches = await Promise.allSettled(
    credits.map(async (c: any) => {
      const searchData = await discogsFetch('/database/search', {
        q: c.name,
        type: 'release',
        per_page: '12',
      })
      return {
        credit_name: c.name,
        credit_role: c.role,
        results: (searchData.results || []).map((r: any) => ({
          id: r.id,
          title: r.title || '',
          artist: '',
          year: r.year || 0,
          thumb: r.thumb || r.cover_image || '',
          discogs_url: `https://www.discogs.com${r.uri || ''}`,
          format: (r.format || []).join(', '),
          label_name: (r.label || [])[0] || '',
          credit_name: c.name,
          credit_role: c.role,
          community_want: r.community?.want || 0,
          community_have: r.community?.have || 0,
          want_have_ratio: r.community?.want && r.community?.have
            ? +(r.community.want / r.community.have).toFixed(2)
            : 0,
        })),
      }
    })
  )

  const allReleases: any[] = []
  const creditNames: any[] = []

  for (const result of creditSearches) {
    if (result.status === 'fulfilled') {
      creditNames.push({ name: result.value.credit_name, role: result.value.credit_role })
      for (const r of result.value.results) {
        // Parse "Artist - Title" format
        if (!r.artist && r.title.includes(' - ')) {
          const parts = r.title.split(' - ')
          r.artist = parts[0].trim()
          r.title = parts.slice(1).join(' - ').trim()
        }
        allReleases.push(r)
      }
    }
  }

  // Deduplicate by release ID
  const seen = new Set<number>()
  const dedupedReleases = allReleases.filter(r => {
    if (seen.has(r.id) || r.id === releaseId) return false
    seen.add(r.id)
    return true
  })

  // Sort by want/have ratio
  dedupedReleases.sort((a, b) => b.want_have_ratio - a.want_have_ratio)

  const resultData = {
    releases: dedupedReleases.slice(0, 50),
    credits: creditNames,
    release_title: releaseData.title,
    release_id: releaseId,
  }
  await setCache('credit-dig', cacheKey, resultData)
  return resultData
}

// ── POST handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, artist, title, label_id, label_name, style, year, release_id } = body

    switch (action) {
      case 'resolve':
        if (!artist || !title) return NextResponse.json({ error: 'artist and title required' }, { status: 400 })
        return NextResponse.json(await resolveTrack(artist, title))

      case 'label-dig':
        if (!label_id) return NextResponse.json({ error: 'label_id required' }, { status: 400 })
        return NextResponse.json(await labelDig(label_id, label_name || ''))

      case 'artist-dig':
        if (!artist) return NextResponse.json({ error: 'artist required' }, { status: 400 })
        return NextResponse.json(await artistDig(artist))

      case 'style-dig':
        if (!style) return NextResponse.json({ error: 'style required' }, { status: 400 })
        return NextResponse.json(await styleDig(style, year || 2020))

      case 'credit-dig':
        if (!release_id) return NextResponse.json({ error: 'release_id required' }, { status: 400 })
        return NextResponse.json(await creditDig(release_id))

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── GET handler (status check) ──────────────────────────────────────────────
export async function GET() {
  const configured = !!process.env.DISCOGS_PERSONAL_TOKEN
  return NextResponse.json({
    configured,
    rate_limit: `${RATE_LIMIT}/min`,
    cache_ttl: '7 days',
    actions: ['resolve', 'label-dig', 'artist-dig', 'style-dig', 'credit-dig'],
  })
}
