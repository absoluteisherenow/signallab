// Shared types for the /promo hub (Releases + DJ Promo tabs).
// Extracted from src/app/releases/page.tsx during Phase 1 of the promo-hub migration.
// See docs/plans/promo-hub-migration.md.

export type Release = {
  id: string
  title: string
  artist?: string
  type: string
  release_date: string
  label?: string
  streaming_url?: string
  artwork_url?: string
  notes?: string
  created_at: string
}

export interface Contact {
  id: string
  name: string
  instagram_handle: string | null
  email: string | null
  whatsapp: string | null
  genre: string | null
  tier: string
  notes: string | null
  last_sent_at: string | null
  total_promos_sent: number
}

export interface TrackMeta {
  title: string | null
  author: string | null
  description: string | null
  artwork: string | null
}

export const TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
  remix: 'Remix',
  compilation: 'Compilation',
}

export const TIERS = ['priority', 'standard', 'new']

// Style token bag threaded through both tabs. `any` is preserved from the
// original code to avoid a behavior-changing refactor during extraction.
// Real typing happens in Phase 2 after gold→red token drift is resolved.
export type PromoStyles = any
