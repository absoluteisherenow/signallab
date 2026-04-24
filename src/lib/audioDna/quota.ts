// ── Audio DNA quota helper ───────────────────────────────────────────────────
// Server-side enforcement of the locked tier caps. Single source of truth —
// every code path that runs the sidecar (right-click, batch button, future
// scheduled analyze) MUST go through `checkAndReserveAutoCues` first, and
// `recordAnalyzed` after the work lands. Never trust the client to enforce.
// ─────────────────────────────────────────────────────────────────────────────

import { SupabaseClient } from '@supabase/supabase-js'
import {
  AudioDnaUsage,
  QuotaCheck,
  Tier,
  TIER_LIMITS,
} from './types'

async function fetchUsage(sb: SupabaseClient, userId: string): Promise<AudioDnaUsage> {
  const { data } = await sb
    .from('audio_dna_usage')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (data) return data as AudioDnaUsage

  // No row yet — create one atomically. UPSERT is safe against the race
  // where two sidecar workers check quota simultaneously.
  const blank: AudioDnaUsage = {
    user_id: userId,
    auto_cue_tracks_lifetime: 0,
    bpm_verify_tracks_lifetime: 0,
    loudness_tracks_lifetime: 0,
    last_analyzed_at: null,
  }
  await sb.from('audio_dna_usage').upsert(blank, { onConflict: 'user_id' })
  return blank
}

export async function getQuotaStatus(
  sb: SupabaseClient,
  userId: string,
  tier: Tier,
): Promise<QuotaCheck> {
  const usage = await fetchUsage(sb, userId)
  const limits = TIER_LIMITS[tier]
  const used = usage.auto_cue_tracks_lifetime
  const limit = limits.auto_cue_lifetime

  if (limit === null) {
    return { allowed: true, tier, used, limit: null, remaining: null }
  }

  const remaining = Math.max(0, limit - used)
  return {
    allowed: remaining > 0,
    tier,
    used,
    limit,
    remaining,
    reason: remaining === 0 ? `${tier} tier hit lifetime cap of ${limit}` : undefined,
  }
}

// Check whether `requested` more tracks can be analyzed. Returns the actual
// count that fits under the cap — callers should honour this (e.g. a batch
// of 40 with 10 remaining should process 10, not fail entirely).
export async function checkAndReserveAutoCues(
  sb: SupabaseClient,
  userId: string,
  tier: Tier,
  requested: number,
): Promise<{ granted: number; quota: QuotaCheck }> {
  const quota = await getQuotaStatus(sb, userId, tier)
  if (!quota.allowed) return { granted: 0, quota }
  if (quota.limit === null) return { granted: requested, quota }
  const granted = Math.min(requested, quota.remaining ?? 0)
  return { granted, quota }
}

// Call after each track successfully completes analysis. Atomic increment
// via raw SQL to avoid read-modify-write races between parallel sidecars.
export async function recordAutoCueAnalyzed(
  sb: SupabaseClient,
  userId: string,
  count = 1,
): Promise<void> {
  const { error } = await sb.rpc('increment_audio_dna_auto_cues', {
    p_user_id: userId,
    p_count: count,
  })
  if (error) throw new Error(`recordAutoCueAnalyzed: ${error.message}`)
}

// Pro+ features use the same pattern — bumped separately so we can audit
// usage by feature (auto-cue is the gated one; BPM verify / LUFS are
// unlimited for Pro+ but we still track volume).
export async function recordBpmVerifyAnalyzed(
  sb: SupabaseClient,
  userId: string,
  count = 1,
): Promise<void> {
  const { error } = await sb.rpc('increment_audio_dna_bpm_verify', {
    p_user_id: userId,
    p_count: count,
  })
  if (error) throw new Error(`recordBpmVerifyAnalyzed: ${error.message}`)
}

export async function recordLoudnessAnalyzed(
  sb: SupabaseClient,
  userId: string,
  count = 1,
): Promise<void> {
  const { error } = await sb.rpc('increment_audio_dna_loudness', {
    p_user_id: userId,
    p_count: count,
  })
  if (error) throw new Error(`recordLoudnessAnalyzed: ${error.message}`)
}
