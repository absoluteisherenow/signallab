// ── Describe-search endpoint ─────────────────────────────────────────────────
// Natural-language track search over the user's dj_tracks library. Zero
// fabrication: embeds the query via Workers AI, orders by pgvector cosine
// distance, returns ONLY rows with real embeddings that pass the hard
// distance threshold. Empty result set is an acceptable outcome — we never
// return "close enough" approximations.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { embedText, EMBEDDING_DIMS } from '@/lib/trackEmbedding'

export const runtime = 'nodejs'

// Hard similarity threshold — anything worse than this is a miss. Tune
// against real queries after shipping. `distance` is pgvector cosine
// distance: 0 = identical, 1 = orthogonal. `similarity = 1 - distance`.
const DEFAULT_MAX_DISTANCE = 0.6 // ≈ similarity ≥ 0.4
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MIN_QUERY_LEN = 3

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const query = String(body.query ?? '').trim()
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT))
    const maxDistance = Math.min(
      1,
      Math.max(0.1, Number(body.max_distance) || DEFAULT_MAX_DISTANCE),
    )

    if (query.length < MIN_QUERY_LEN) {
      return NextResponse.json(
        { tracks: [], count: 0, query, error: `Query too short (≥${MIN_QUERY_LEN} chars)` },
        { status: 400 },
      )
    }

    let vector: number[]
    try {
      vector = await embedText(query)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // Workers AI binding missing in local `next dev` — useful diagnostic.
      return NextResponse.json(
        { tracks: [], count: 0, query, error: `Embedding failed: ${msg}` },
        { status: 503 },
      )
    }

    if (vector.length !== EMBEDDING_DIMS) {
      return NextResponse.json(
        { tracks: [], count: 0, query, error: `Embedding dim mismatch: ${vector.length}` },
        { status: 500 },
      )
    }

    // pgvector accepts '[1,2,3]' literals — PostgREST will cast a string
    // arg into `vector(768)` without extra coercion on the client side.
    const pgVectorLiteral = `[${vector.join(',')}]`

    const { data, error } = await supabase().rpc('match_tracks_by_embedding', {
      query_embedding: pgVectorLiteral,
      match_limit: limit,
      max_distance: maxDistance,
    })

    if (error) {
      return NextResponse.json(
        { tracks: [], count: 0, query, error: error.message },
        { status: 500 },
      )
    }

    const tracks = Array.isArray(data) ? data : []

    return NextResponse.json({
      tracks,
      count: tracks.length,
      query,
      max_distance: maxDistance,
      // When empty, UI should show a specific "no matches above threshold"
      // empty state — not a "loading" state — to enforce the no-fabrication
      // rule visibly.
      empty_reason: tracks.length === 0 ? 'no-tracks-above-threshold' : null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ tracks: [], count: 0, error: msg }, { status: 500 })
  }
}

// Surface pool health so the client can warn when "no results" actually
// means "no tracks are indexed yet" vs "no tracks pass the threshold".
export async function GET() {
  try {
    const sb = supabase()
    const [{ count: total }, { count: indexed }] = await Promise.all([
      sb.from('dj_tracks').select('id', { count: 'exact', head: true }),
      sb
        .from('dj_tracks')
        .select('id', { count: 'exact', head: true })
        .not('embedding', 'is', null),
    ])
    return NextResponse.json({
      total: total ?? 0,
      indexed: indexed ?? 0,
      unindexed: Math.max(0, (total ?? 0) - (indexed ?? 0)),
      threshold: DEFAULT_MAX_DISTANCE,
      ready: (indexed ?? 0) > 0,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
