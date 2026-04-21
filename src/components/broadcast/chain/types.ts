/**
 * Shared types for the Broadcast chain flow.
 */

export type ChainPhase = 'drop' | 'scanning' | 'scanned' | 'voice'

export type CaptionVariant = 'long' | 'safe' | 'loose' | 'raw'

export type Platform = 'instagram' | 'tiktok' | 'threads' | 'x'

/**
 * The deep-dive payload written by /api/artist-scan into artist_profiles.
 * Every field is optional because (a) older profiles may be missing newer
 * columns, (b) the self-ref has a nullable profile until NM scans their own
 * feed. When absent, caption gen falls back to minimal metadata rather than
 * fabricating voice data.
 */
export interface VoiceRefProfile {
  handle?: string | null
  biography?: string | null
  style_rules?: string | null
  chips?: string[] | null
  lowercase_pct?: number | null
  short_caption_pct?: number | null
  no_hashtags_pct?: number | null
  brand_positioning?: string | null
  content_strategy_notes?: string | null
  visual_aesthetic?: {
    mood?: string
    palette?: string
    subjects?: string[]
    signature_visual?: string
    avoid?: string
  } | null
  content_performance?: {
    best_type?: string
    best_subject?: string
    engagement_rate?: string
    posting_frequency?: string
    peak_content?: string
  } | null
}

export interface VoiceRef {
  id: string
  name: string
  weight: number
  kind: 'self' | 'artist'
  artist_profile_id?: string | null
  /** Full deep-dive profile (style_rules, visual_aesthetic, etc). Loaded by
   *  BroadcastChain on mount + after drawer edits, consumed by chainCaptionGen
   *  to give Claude actual voice evidence instead of just a name + weight. */
  profile?: VoiceRefProfile | null
}

export interface VoiceCheckResult {
  em_dash: boolean
  cliches: boolean
  specific: boolean
  human: boolean
  on_voice: boolean
}

export const PLATFORM_LIMITS: Record<Platform, number> = {
  instagram: 2200,
  tiktok: 2200,
  threads: 500,
  x: 280,
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  threads: 'Threads',
  x: 'X',
}
