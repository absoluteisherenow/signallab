// ── Audio DNA types ──────────────────────────────────────────────────────────
// Shared types for hot cues, Essentia analysis output, and tier quotas.
// Kept in one small file so the Rust sidecar, the API routes, and the UI
// can all depend on the same shapes without circular imports.
// ─────────────────────────────────────────────────────────────────────────────

export type HotCueType = 'intro' | 'drop' | 'breakdown' | 'outro' | 'custom'
export type HotCueSource = 'rekordbox' | 'essentia' | 'user' | 'id3'

export interface HotCue {
  position_ms: number
  label: string
  type: HotCueType
  source: HotCueSource
  // Confidence is only meaningful for `source: 'essentia'`. Rekordbox/user
  // cues are treated as authoritative (confidence = 1).
  confidence?: number
  color?: string // hex, optional — matches Rekordbox cue colours if imported
}

// Raw Essentia output we persist to dj_tracks.essentia_analysis. We keep it
// minimal — the full Essentia JSON can be huge and most of it isn't useful
// downstream. Full blob goes to the raw_path file on disk for debugging.
export interface EssentiaSummary {
  bpm: number
  bpm_confidence: number
  key: string // e.g. "C#m"
  key_confidence: number
  camelot: string // derived from key
  loudness_lufs: number
  duration_ms: number
  segment_boundaries_ms: number[] // from sfx.structural_segmentation
  energy_contour: number[] // downsampled to ~1Hz
  analyzed_at: string
  essentia_version: string
}

// The sidecar progress event shape (emitted once per track).
export interface AnalysisProgressEvent {
  track_id: string
  title: string
  artist: string
  state: 'queued' | 'running' | 'done' | 'error'
  error?: string
  cues_found?: number
}

// Tier quotas — LOCKED 2026-04-22 in project_audio_dna_essentia.md.
// Lifetime (not monthly) caps. Pro+ unlimited.
export type Tier = 'creator' | 'artist' | 'pro' | 'road' | 'management'

export interface TierLimits {
  auto_cue_lifetime: number | null // null = unlimited
  bpm_verify: boolean // Pro+ only
  loudness: boolean // Pro+ only
  timbral_similarity: boolean // Pro+ only (future)
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  creator: {
    auto_cue_lifetime: 50,
    bpm_verify: false,
    loudness: false,
    timbral_similarity: false,
  },
  artist: {
    auto_cue_lifetime: 250,
    bpm_verify: false,
    loudness: false,
    timbral_similarity: false,
  },
  pro: {
    auto_cue_lifetime: null,
    bpm_verify: true,
    loudness: true,
    timbral_similarity: true,
  },
  road: {
    auto_cue_lifetime: null,
    bpm_verify: true,
    loudness: true,
    timbral_similarity: true,
  },
  management: {
    auto_cue_lifetime: null,
    bpm_verify: true,
    loudness: true,
    timbral_similarity: true,
  },
}

export interface AudioDnaUsage {
  user_id: string
  auto_cue_tracks_lifetime: number
  bpm_verify_tracks_lifetime: number
  loudness_tracks_lifetime: number
  last_analyzed_at: string | null
}

export interface QuotaCheck {
  allowed: boolean
  tier: Tier
  used: number
  limit: number | null
  remaining: number | null // null = unlimited
  reason?: string
}
