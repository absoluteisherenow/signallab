// ── Tauri sidecar client (browser side) ──────────────────────────────────────
// Thin wrapper around the Rust `analyze_tracks` command. Only callable from
// the Tauri desktop build — the web build ships without Essentia, and callers
// must branch on `isTauri()` before invoking this. If we later run Essentia
// server-side we'll add a parallel module; keep this file desktop-only.
// ─────────────────────────────────────────────────────────────────────────────
import type { AnalysisProgressEvent, EssentiaSummary, HotCue } from './types'

export interface TrackToAnalyze {
  track_id: string
  title: string
  artist: string
  file_path: string
  duration_ms?: number
}

export interface AnalyzedTrack {
  track_id: string
  summary: EssentiaSummary
  hot_cues: HotCue[]
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

// Dynamic import so the web bundle doesn't pull in @tauri-apps/api.
async function tauri() {
  const core = await import('@tauri-apps/api/core')
  const event = await import('@tauri-apps/api/event')
  return { core, event }
}

export async function analyzeTracks(tracks: TrackToAnalyze[]): Promise<AnalyzedTrack[]> {
  if (!isTauri()) {
    throw new Error('Essentia analysis is desktop-only')
  }
  const { core } = await tauri()
  return core.invoke<AnalyzedTrack[]>('analyze_tracks', { tracks })
}

// Subscribe to the `essentia://progress` event bus. Returns an unlisten fn.
export async function onAnalysisProgress(
  handler: (e: AnalysisProgressEvent) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { event } = await tauri()
  const un = await event.listen<AnalysisProgressEvent>('essentia://progress', (ev) => {
    handler(ev.payload)
  })
  return () => un()
}
