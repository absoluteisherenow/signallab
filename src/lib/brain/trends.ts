// Trend-intelligence loader — ported from
// ~/.claude/skills/trend-intelligence/SKILL.md.
//
// Reads the latest row from `trend_snapshots` (see migration
// 20260421_trend_snapshots.sql) and returns a shape the brain can drop into a
// "What's moving in the scene right now" primer section. Intentionally simple:
// a cron writes a new snapshot nightly; the brain reads the freshest one.
//
// Skipped entirely if the table doesn't exist yet or the freshest snapshot
// is older than TTL_DAYS — stale trends are worse than none.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface TrendSnapshot {
  updated_at: string | null
  sounds: string[]
  formats: string[]
  topics: string[]
  /** Pre-composed primer text if the snapshot writer provided one. */
  primer_md: string | null
}

const TTL_DAYS = 10

const EMPTY: TrendSnapshot = {
  updated_at: null,
  sounds: [],
  formats: [],
  topics: [],
  primer_md: null,
}

export async function loadTrendSnapshot(sb: SupabaseClient, userId: string): Promise<TrendSnapshot> {
  try {
    const { data, error } = await sb
      .from('trend_snapshots')
      .select('updated_at, sounds, formats, topics, primer_md, user_id')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return EMPTY
    const ageMs = data.updated_at ? Date.now() - new Date(data.updated_at).getTime() : Infinity
    if (ageMs > TTL_DAYS * 24 * 60 * 60 * 1000) return EMPTY
    return {
      updated_at: data.updated_at || null,
      sounds: Array.isArray(data.sounds) ? data.sounds : [],
      formats: Array.isArray(data.formats) ? data.formats : [],
      topics: Array.isArray(data.topics) ? data.topics : [],
      primer_md: typeof data.primer_md === 'string' ? data.primer_md : null,
    }
  } catch {
    return EMPTY
  }
}

export function formatTrendsBlock(snap: TrendSnapshot): string {
  if (snap.primer_md) return snap.primer_md
  const hasAny = snap.sounds.length || snap.formats.length || snap.topics.length
  if (!hasAny) return ''
  const parts: string[] = ['# Scene signal (nightly refresh)']
  if (snap.sounds.length) parts.push(`- Sounds gaining: ${snap.sounds.map((s) => `"${s}"`).join(', ')}`)
  if (snap.formats.length) parts.push(`- Formats working: ${snap.formats.map((s) => `"${s}"`).join(', ')}`)
  if (snap.topics.length) parts.push(`- Topics resonating: ${snap.topics.map((s) => `"${s}"`).join(', ')}`)
  if (snap.updated_at) {
    const date = new Date(snap.updated_at).toISOString().slice(0, 10)
    parts.push(`\n(Updated ${date}. Use as tonal nudge, not script.)`)
  }
  return parts.join('\n')
}
