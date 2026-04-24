// ── Track enrichment + embedding endpoint ────────────────────────────────────
// POST /api/tracks/enrich   → run the cascade for one or many track IDs
// GET  /api/tracks/enrich   → index health summary (for the Library UI)
//
// The endpoint pulls rows from dj_tracks, runs the orchestrator, and writes
// back the fields the cascade filled plus the embedding + enrichment_sources.
// Only rows that become embeddable (title + artist + genre + bpm) gain an
// embedding — everything else stays invisible to describe-search, which is
// the zero-fabrication guarantee.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { enrichTrack, CascadeTrack } from '@/lib/enrichment/orchestrator'

export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_HARD_CAP = 200 // per call — enforced even if caller asks for more

function supabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

type TrackRow = CascadeTrack & { id: string }

interface PerTrackOutcome {
  id: string
  title: string
  artist: string
  embedded: boolean
  fields_filled: string[]
  sources: string[]
  reason_not_embedded?: string
  error?: string
}

async function loadTracks(sb: SupabaseClient, ids: string[]): Promise<TrackRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await sb.from('dj_tracks').select('*').in('id', ids)
  if (error) throw new Error(`Load tracks: ${error.message}`)
  return (data ?? []) as TrackRow[]
}

async function loadStaleTracks(sb: SupabaseClient, limit: number): Promise<TrackRow[]> {
  // Prioritise rows that have the required baseline but no embedding yet.
  const { data, error } = await sb
    .from('dj_tracks')
    .select('*')
    .is('embedding', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`Load stale: ${error.message}`)
  return (data ?? []) as TrackRow[]
}

// Only write columns the orchestrator may have touched, plus the embedding
// + provenance trio. Keeps the update payload narrow and predictable.
const WRITABLE_FIELDS = [
  'title',
  'artist',
  'bpm',
  'genre',
  'album_art',
  'producer_style',
  'similar_to',
  'embedding',
  'embedding_input',
  'embedding_updated_at',
  'enrichment_sources',
  'enriched',
] as const

function buildUpdatePayload(before: TrackRow, after: CascadeTrack): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const key of WRITABLE_FIELDS) {
    const a = (after as unknown as Record<string, unknown>)[key]
    const b = (before as unknown as Record<string, unknown>)[key]
    if (a !== undefined && JSON.stringify(a) !== JSON.stringify(b)) payload[key] = a
  }
  if (after.embedding) payload.enriched = true
  return payload
}

async function runOne(sb: SupabaseClient, row: TrackRow): Promise<PerTrackOutcome> {
  try {
    const result = await enrichTrack(row)
    const payload = buildUpdatePayload(row, result.track)

    if (Object.keys(payload).length > 0) {
      const { error } = await sb.from('dj_tracks').update(payload).eq('id', row.id)
      if (error) throw new Error(`Update: ${error.message}`)
    }

    const filled = new Set<string>()
    for (const s of result.sources) s.fields.forEach((f) => filled.add(f))

    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      embedded: result.embedded,
      fields_filled: Array.from(filled),
      sources: result.sources.map((s) => s.source),
      reason_not_embedded: result.reason_not_embedded,
    }
  } catch (err: unknown) {
    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      embedded: false,
      fields_filled: [],
      sources: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      ids?: string[]
      all_unindexed?: boolean
      limit?: number
    }
    const sb = supabase()

    let rows: TrackRow[]
    if (Array.isArray(body.ids) && body.ids.length) {
      rows = await loadTracks(sb, body.ids.slice(0, BATCH_HARD_CAP))
    } else if (body.all_unindexed) {
      const lim = Math.min(BATCH_HARD_CAP, Math.max(1, Number(body.limit) || 50))
      rows = await loadStaleTracks(sb, lim)
    } else {
      return NextResponse.json(
        { error: 'Provide { ids: [...] } or { all_unindexed: true, limit: N }' },
        { status: 400 },
      )
    }

    if (rows.length === 0) {
      return NextResponse.json({ processed: 0, embedded: 0, results: [] })
    }

    const results: PerTrackOutcome[] = []
    for (const row of rows) {
      // Sequential — MusicBrainz is throttled to 1/sec per IP and parallel
      // calls would trip Deezer + Discogs rate limits. Batch UI shows a
      // progress bar; a DJ's one-time indexing job is fine at this pace.
      // eslint-disable-next-line no-await-in-loop
      results.push(await runOne(sb, row))
    }

    return NextResponse.json({
      processed: results.length,
      embedded: results.filter((r) => r.embedded).length,
      results,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  try {
    const sb = supabase()
    const [totalRes, indexedRes, embeddableRes] = await Promise.all([
      sb.from('dj_tracks').select('id', { count: 'exact', head: true }),
      sb
        .from('dj_tracks')
        .select('id', { count: 'exact', head: true })
        .not('embedding', 'is', null),
      // Rough estimate of how many unindexed rows the cascade could rescue
      // immediately without network calls (BPM + genre already present).
      sb
        .from('dj_tracks')
        .select('id', { count: 'exact', head: true })
        .is('embedding', null)
        .gt('bpm', 0)
        .not('genre', 'is', null)
        .not('genre', 'eq', ''),
    ])

    const total = totalRes.count ?? 0
    const indexed = indexedRes.count ?? 0
    const ready_to_embed = embeddableRes.count ?? 0

    return NextResponse.json({
      total,
      indexed,
      unindexed: Math.max(0, total - indexed),
      ready_to_embed,
      needs_cascade: Math.max(0, total - indexed - ready_to_embed),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
