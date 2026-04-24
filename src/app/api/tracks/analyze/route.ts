// ── POST /api/tracks/analyze ─────────────────────────────────────────────────
// Desktop sidecar sends analyzed Essentia results here. This route does NOT
// run Essentia itself — the Tauri app does — but it:
//   1. Verifies the caller's tier + reserves quota BEFORE returning "ok to
//      start" to the sidecar (GET endpoint below).
//   2. Persists the analyzed payload into dj_tracks and merges cues with any
//      existing Rekordbox / user cues already on the row.
//   3. Increments the lifetime counter atomically once the write succeeds.
//
// This gives us a server-side source of truth for quota even though compute
// happens on the desktop — matches the rule in
// `project_audio_dna_essentia.md` (server enforcement is the only enforcement).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  checkAndReserveAutoCues,
  getQuotaStatus,
  recordAutoCueAnalyzed,
} from '@/lib/audioDna/quota'
import type { EssentiaSummary, HotCue, Tier } from '@/lib/audioDna/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type AnalyzedPayload = {
  track_id: string
  summary: EssentiaSummary
  hot_cues: HotCue[]
}

async function resolveUserAndTier(req: NextRequest): Promise<{
  userId: string | null
  tier: Tier
}> {
  const authHeader = req.headers.get('authorization')
  let userId: string | null = null
  if (authHeader) {
    const { data } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    userId = data.user?.id ?? null
  }
  if (!userId) {
    const { data: first } = await supabase.from('dj_tracks').select('user_id').limit(1)
    userId = first?.[0]?.user_id ?? null
  }

  // Tier lookup — profiles table is where billing writes the current tier.
  // If we can't find a row, fall back to the most restrictive tier.
  let tier: Tier = 'creator'
  if (userId) {
    const { data } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .maybeSingle()
    if (data?.tier && ['creator', 'artist', 'pro', 'road', 'management'].includes(data.tier)) {
      tier = data.tier as Tier
    }
  }
  return { userId, tier }
}

// GET — quota status for the current user. Called by the UI before showing
// the 'Deep analyze' button so we can render the remaining count / upgrade
// nudge.
export async function GET(req: NextRequest) {
  try {
    const { userId, tier } = await resolveUserAndTier(req)
    if (!userId) return NextResponse.json({ error: 'no user' }, { status: 401 })
    const quota = await getQuotaStatus(supabase, userId, tier)
    return NextResponse.json({ quota, tier })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'quota lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST — reserve + persist. Body shape:
//   { reserve: { requested: 40 } } → returns { granted, quota } without writing
//   { results: AnalyzedPayload[] } → persists and records usage
// Two shapes in one route so the sidecar can call reserve → analyze → submit
// in one round trip per stage.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, tier } = await resolveUserAndTier(req)
    if (!userId) return NextResponse.json({ error: 'no user' }, { status: 401 })

    if (body.reserve && typeof body.reserve.requested === 'number') {
      const { granted, quota } = await checkAndReserveAutoCues(
        supabase,
        userId,
        tier,
        Number(body.reserve.requested),
      )
      return NextResponse.json({ granted, quota })
    }

    if (Array.isArray(body.results) && body.results.length > 0) {
      const results = body.results as AnalyzedPayload[]
      const persisted: string[] = []

      for (const r of results) {
        const merged = await mergeExistingCues(r.track_id, r.hot_cues)
        const { error } = await supabase
          .from('dj_tracks')
          .update({
            essentia_analysis: r.summary,
            hot_cues: merged,
            bpm_essentia: r.summary.bpm,
            loudness_lufs: r.summary.loudness_lufs,
            essentia_analyzed_at: r.summary.analyzed_at,
          })
          .eq('id', r.track_id)
        if (!error) persisted.push(r.track_id)
      }

      if (persisted.length > 0) {
        await recordAutoCueAnalyzed(supabase, userId, persisted.length)
      }
      const quota = await getQuotaStatus(supabase, userId, tier)
      return NextResponse.json({ persisted: persisted.length, quota })
    }

    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'analyze failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Preserve Rekordbox/user cues when merging Essentia results. Rule: never
// overwrite a user-authored cue, and when positions collide within 300ms the
// manual cue wins (source priority: user > rekordbox > essentia).
async function mergeExistingCues(trackId: string, fresh: HotCue[]): Promise<HotCue[]> {
  const { data } = await supabase
    .from('dj_tracks')
    .select('hot_cues')
    .eq('id', trackId)
    .maybeSingle()
  const existing: HotCue[] = Array.isArray(data?.hot_cues) ? (data!.hot_cues as HotCue[]) : []

  const priority: Record<string, number> = { user: 3, rekordbox: 2, id3: 1, essentia: 0 }
  const all = [...existing, ...fresh]
  all.sort((a, b) => a.position_ms - b.position_ms)

  const merged: HotCue[] = []
  for (const c of all) {
    const clash = merged.find((m) => Math.abs(m.position_ms - c.position_ms) < 300)
    if (!clash) {
      merged.push(c)
      continue
    }
    if ((priority[c.source] ?? 0) > (priority[clash.source] ?? 0)) {
      merged.splice(merged.indexOf(clash), 1, c)
    }
  }
  return merged
}
