// ── Enrichment orchestrator ──────────────────────────────────────────────────
// Per-track cascade: Rekordbox/ID3 baseline → Discogs → MusicBrainz → Deezer.
// Each stage fills ONLY fields the previous stages left empty. The cascade's
// primary job is getting a track past the embeddability threshold
// (title + artist + genre + bpm). Once there, we compute the Workers AI
// embedding and stop.
//
// Everything else each source returns (label, catalogue, ISRC, year, URLs,
// image candidates) is preserved verbatim in `enrichment_sources[i].data`
// so we can promote it to dedicated columns later without re-running the API
// cascade. This keeps `dj_tracks` schema tight now and future-proof.
//
// bliss-rs is intentionally not here — it's a Tauri-only last-resort for
// the desktop app, not a server-side cascade source.
// ─────────────────────────────────────────────────────────────────────────────

import { discogsLookup, DiscogsHit } from './discogs'
import { musicbrainzLookup, MBLookup } from './musicbrainz'
import { deezerLookup, DeezerHit } from './deezer'
import {
  composeEmbeddingInput,
  embedText,
  isEmbeddable,
  TrackLike,
} from '../trackEmbedding'

export type EnrichmentSourceName =
  | 'rekordbox'
  | 'id3'
  | 'discogs'
  | 'musicbrainz'
  | 'deezer'
  | 'bliss'
  | 'essentia'

export interface EnrichmentSource {
  source: EnrichmentSourceName
  fields: string[] // column names filled by this source
  at: string
  external_id?: string | number | null
  data?: Record<string, unknown> // raw source payload (label, ISRC, etc.)
}

// Columns that actually exist on dj_tracks and that the cascade may touch.
export interface CascadeTrack extends TrackLike {
  id?: string
  title: string
  artist: string
  album_art?: string | null
  embedding?: number[] | null
  embedding_input?: string | null
  embedding_updated_at?: string | null
  enrichment_sources?: EnrichmentSource[]
}

export interface EnrichmentResult {
  track: CascadeTrack
  embedded: boolean
  reason_not_embedded?: string
  sources: EnrichmentSource[]
}

export interface OrchestratorOptions {
  skip?: Array<'discogs' | 'musicbrainz' | 'deezer'>
  stopWhenEmbeddable?: boolean
  embed?: boolean
}

function isEmptyLike(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && v === 0)
}

function fillIfEmpty<T extends Record<string, unknown>>(
  t: T,
  key: keyof T,
  value: T[keyof T] | null | undefined,
): boolean {
  if (value === null || value === undefined || value === ('' as unknown as T[keyof T])) return false
  if (!isEmptyLike(t[key])) return false
  t[key] = value as T[keyof T]
  return true
}

export async function enrichTrack(
  input: CascadeTrack,
  opts: OrchestratorOptions = {},
): Promise<EnrichmentResult> {
  const { skip = [], stopWhenEmbeddable = true, embed = true } = opts
  const track: CascadeTrack = { ...input }
  const sources: EnrichmentSource[] = []

  // Baseline provenance — note what was already on the row coming in.
  const baseline: string[] = []
  if (track.bpm && track.bpm > 0) baseline.push('bpm')
  if (track.key) baseline.push('key')
  if (track.camelot) baseline.push('camelot')
  if (track.energy && track.energy > 0) baseline.push('energy')
  if (track.genre) baseline.push('genre')
  if (baseline.length) {
    sources.push({
      source: track.bpm && track.camelot ? 'rekordbox' : 'id3',
      fields: baseline,
      at: new Date().toISOString(),
    })
  }

  const finalizeEmbedding = async (): Promise<boolean> => {
    if (!isEmbeddable(track)) return false
    if (!embed) return true
    const descriptor = composeEmbeddingInput(track)
    if (!descriptor) return false
    track.embedding = await embedText(descriptor)
    track.embedding_input = descriptor
    track.embedding_updated_at = new Date().toISOString()
    return true
  }

  const finish = async (): Promise<EnrichmentResult> => {
    track.enrichment_sources = sources
    const embedded = await finalizeEmbedding()
    if (embedded) return { track, embedded: true, sources }
    const missing: string[] = []
    if (!track.title) missing.push('title')
    if (!track.artist) missing.push('artist')
    if (!track.genre) missing.push('genre')
    if (!track.bpm || track.bpm <= 0) missing.push('bpm')
    return {
      track,
      embedded: false,
      reason_not_embedded: missing.length
        ? `missing required fields: ${missing.join(', ')}`
        : 'embedding disabled',
      sources,
    }
  }

  if (stopWhenEmbeddable && isEmbeddable(track)) return finish()

  // ── Discogs: genre/styles, plus raw label/year/catno into sources.data ───
  if (!skip.includes('discogs')) {
    try {
      const d: DiscogsHit | null = await discogsLookup({ title: track.title, artist: track.artist })
      if (d) {
        const filled: string[] = []
        const genreCandidate = d.styles?.[0] ?? d.genre ?? null
        if (fillIfEmpty(track as unknown as Record<string, unknown>, 'genre', genreCandidate)) filled.push('genre')
        if (fillIfEmpty(track as unknown as Record<string, unknown>, 'album_art', d.thumb)) filled.push('album_art')
        sources.push({
          source: 'discogs',
          fields: filled,
          at: new Date().toISOString(),
          external_id: d.release_id,
          data: {
            master_id: d.master_id,
            label: d.label,
            label_id: d.label_id,
            catalog_number: d.catalog_number,
            year: d.year,
            country: d.country,
            format: d.format,
            styles: d.styles,
            genre: d.genre,
            discogs_url: d.discogs_url,
          },
        })
      }
    } catch {
      // Rate-limited or unreachable — cascade continues.
    }
  }

  if (stopWhenEmbeddable && isEmbeddable(track)) return finish()

  // ── MusicBrainz: producer/remixer info; canonical artist into sources ────
  if (!skip.includes('musicbrainz')) {
    try {
      const m: MBLookup | null = await musicbrainzLookup({ title: track.title, artist: track.artist })
      if (m) {
        const filled: string[] = []
        // producer_style is a free-text column on dj_tracks — we can safely
        // fill it with MB's resolved producer list when empty.
        if (m.producers.length && fillIfEmpty(track as unknown as Record<string, unknown>, 'producer_style', m.producers.join(', '))) {
          filled.push('producer_style')
        }
        if (m.remixers.length && fillIfEmpty(track as unknown as Record<string, unknown>, 'similar_to', `remix: ${m.remixers.join(', ')}`)) {
          filled.push('similar_to')
        }
        sources.push({
          source: 'musicbrainz',
          fields: filled,
          at: new Date().toISOString(),
          external_id: m.mbid,
          data: {
            canonical_artist: m.artist,
            artist_sort: m.artist_sort,
            canonical_artists: m.canonical_artists,
            producers: m.producers,
            remixers: m.remixers,
            release_year: m.release_year,
            first_release_date: m.first_release_date,
            isrc: m.isrc,
            musicbrainz_url: m.musicbrainz_url,
          },
        })
      }
    } catch {
      // Rate-limited — continue.
    }
  }

  if (stopWhenEmbeddable && isEmbeddable(track)) return finish()

  // ── Deezer: BPM (the cascade's key payoff), album art ────────────────────
  if (!skip.includes('deezer')) {
    try {
      const dz: DeezerHit | null = await deezerLookup({ title: track.title, artist: track.artist })
      if (dz) {
        const filled: string[] = []
        if (dz.bpm && fillIfEmpty(track as unknown as Record<string, unknown>, 'bpm', dz.bpm)) filled.push('bpm')
        if (fillIfEmpty(track as unknown as Record<string, unknown>, 'album_art', dz.album_art)) filled.push('album_art')
        sources.push({
          source: 'deezer',
          fields: filled,
          at: new Date().toISOString(),
          external_id: dz.id,
          data: {
            title: dz.title,
            artist: dz.artist,
            duration: dz.duration,
            release_date: dz.release_date,
            preview_url: dz.preview_url,
            album_title: dz.album_title,
            deezer_url: dz.deezer_url,
          },
        })
      }
    } catch {
      // Undocumented endpoint — best-effort only.
    }
  }

  return finish()
}
