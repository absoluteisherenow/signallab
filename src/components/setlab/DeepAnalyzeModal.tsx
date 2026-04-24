'use client'

// ── Deep Analyze modal ───────────────────────────────────────────────────────
// Single entry point for the Audio DNA flow:
//   • Shows the user how many tracks will be analyzed, how many fit in their
//     tier's remaining quota, and what happens to overflow (silently skipped
//     or prompted for upgrade).
//   • Reserves quota via POST /api/tracks/analyze { reserve }.
//   • Kicks the Tauri sidecar via analyzeTracks().
//   • Streams AnalysisProgressEvent rows into the table.
//   • Submits results via POST /api/tracks/analyze { results } on completion.
//
// The modal is desktop-only — it exits gracefully if `isTauri()` is false.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  analyzeTracks,
  isTauri,
  onAnalysisProgress,
  type AnalyzedTrack,
  type TrackToAnalyze,
} from '@/lib/audioDna/sidecar'
import type { AnalysisProgressEvent, QuotaCheck } from '@/lib/audioDna/types'

export interface DeepAnalyzeModalProps {
  open: boolean
  onClose: () => void
  tracks: TrackToAnalyze[]
  onComplete?: (results: AnalyzedTrack[]) => void
}

type Row = {
  track_id: string
  title: string
  artist: string
  state: AnalysisProgressEvent['state']
  error?: string
  cues_found?: number
}

export function DeepAnalyzeModal({ open, onClose, tracks, onComplete }: DeepAnalyzeModalProps) {
  const [quota, setQuota] = useState<QuotaCheck | null>(null)
  const [granted, setGranted] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [error, setError] = useState<string | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)

  const reset = useCallback(() => {
    setGranted(null)
    setRunning(false)
    setRows({})
    setError(null)
  }, [])

  useEffect(() => {
    if (!open) return
    reset()
    // Fetch current quota on open so the user sees what they have.
    fetch('/api/tracks/analyze', { method: 'GET' })
      .then((r) => r.json())
      .then((j) => setQuota(j.quota ?? null))
      .catch(() => setQuota(null))
  }, [open, reset])

  useEffect(() => {
    return () => {
      if (unlistenRef.current) unlistenRef.current()
    }
  }, [])

  const start = useCallback(async () => {
    if (!isTauri()) {
      setError('Deep analysis requires the Set Lab desktop app.')
      return
    }
    setError(null)
    setRunning(true)

    // 1. Reserve quota. The server returns how many of `requested` fit.
    const reserveRes = await fetch('/api/tracks/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reserve: { requested: tracks.length } }),
    })
    const reserveJson = (await reserveRes.json()) as { granted?: number; quota?: QuotaCheck; error?: string }
    if (reserveJson.error) {
      setError(reserveJson.error)
      setRunning(false)
      return
    }
    setQuota(reserveJson.quota ?? null)
    const grantedCount = Math.min(reserveJson.granted ?? 0, tracks.length)
    setGranted(grantedCount)
    if (grantedCount === 0) {
      setRunning(false)
      return
    }

    const batch = tracks.slice(0, grantedCount)

    // 2. Listen for progress events and paint rows as they land.
    const un = await onAnalysisProgress((e) => {
      setRows((prev) => ({
        ...prev,
        [e.track_id]: {
          track_id: e.track_id,
          title: e.title,
          artist: e.artist,
          state: e.state,
          error: e.error,
          cues_found: e.cues_found,
        },
      }))
    })
    unlistenRef.current = un

    // 3. Kick the sidecar. This resolves when ALL tracks have completed
    //    (or errored) — the progress listener handles per-track state.
    try {
      const results = await analyzeTracks(batch)

      // 4. Submit successful results for persistence + usage increment.
      if (results.length > 0) {
        const submit = await fetch('/api/tracks/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ results }),
        })
        const submitJson = (await submit.json()) as { persisted?: number; quota?: QuotaCheck; error?: string }
        if (submitJson.error) setError(submitJson.error)
        if (submitJson.quota) setQuota(submitJson.quota)
      }
      onComplete?.(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'analysis failed')
    } finally {
      setRunning(false)
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [tracks, onComplete])

  if (!open) return null

  const rowList = Object.values(rows)
  const doneCount = rowList.filter((r) => r.state === 'done').length
  const errorCount = rowList.filter((r) => r.state === 'error').length
  const willAnalyze = granted ?? Math.min(tracks.length, quota?.remaining ?? tracks.length)
  const overflow = Math.max(0, tracks.length - (willAnalyze ?? 0))

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={() => { if (!running) onClose() }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640, maxWidth: '90vw', maxHeight: '85vh',
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, display: 'flex', flexDirection: 'column',
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', opacity: 0.5 }}>AUDIO DNA</div>
          <div style={{ fontSize: 22, color: '#fff', marginTop: 4 }}>Deep analyze</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Detects drops, breakdowns, loudness and verified BPM for {tracks.length} track{tracks.length === 1 ? '' : 's'}.
          </div>
        </div>

        <div style={{ padding: '16px 22px', display: 'flex', gap: 16, fontSize: 12 }}>
          <QuotaBadge quota={quota} />
          {overflow > 0 && (
            <div style={{
              padding: '6px 10px', border: '1px solid #F59E0B', color: '#F59E0B',
              borderRadius: 3, fontSize: 11,
            }}>
              {overflow} over your limit — upgrade to analyze all.
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 22px 16px' }}>
          {rowList.length === 0 && !running && (
            <div style={{ opacity: 0.5, fontSize: 12 }}>
              Ready. Click <strong style={{ color: '#fff' }}>Start</strong> to begin.
            </div>
          )}
          {rowList.map((r) => (
            <div
              key={r.track_id}
              style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.artist} — {r.title}
              </span>
              <StateBadge state={r.state} error={r.error} cues={r.cues_found} />
            </div>
          ))}
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 11, opacity: 0.6 }}>
            {running ? `${doneCount}/${willAnalyze} done` : error ? <span style={{ color: '#EF4444' }}>{error}</span> : `${willAnalyze} will analyze`}
            {errorCount > 0 && <span style={{ color: '#EF4444', marginLeft: 8 }}>{errorCount} failed</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={running}
              style={{
                padding: '6px 14px', background: 'transparent',
                color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 3, cursor: running ? 'default' : 'pointer',
                opacity: running ? 0.4 : 1,
                fontFamily: 'inherit', fontSize: 12,
              }}
            >
              {running ? 'Running…' : 'Close'}
            </button>
            {!running && doneCount === 0 && (
              <button
                onClick={start}
                disabled={(granted ?? 1) === 0}
                style={{
                  padding: '6px 14px', background: '#FF2A1A', color: '#fff',
                  border: 'none', borderRadius: 3, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                }}
              >
                Start
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function QuotaBadge({ quota }: { quota: QuotaCheck | null }) {
  if (!quota) return null
  if (quota.limit === null) {
    return (
      <div style={{ padding: '6px 10px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 3 }}>
        <span style={{ opacity: 0.6 }}>Quota: </span>
        <strong style={{ color: '#fff' }}>Unlimited</strong>
      </div>
    )
  }
  return (
    <div style={{ padding: '6px 10px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 3 }}>
      <span style={{ opacity: 0.6 }}>Remaining: </span>
      <strong style={{ color: quota.remaining === 0 ? '#EF4444' : '#fff' }}>
        {quota.remaining}/{quota.limit}
      </strong>
    </div>
  )
}

function StateBadge({ state, error, cues }: { state: Row['state']; error?: string; cues?: number }) {
  const map: Record<Row['state'], { label: string; color: string }> = {
    queued: { label: 'queued', color: 'rgba(255,255,255,0.4)' },
    running: { label: 'running…', color: '#3B82F6' },
    done: { label: `${cues ?? 0} cues`, color: '#22C55E' },
    error: { label: error ?? 'error', color: '#EF4444' },
  }
  const s = map[state]
  return <span style={{ color: s.color, fontSize: 11, minWidth: 80, textAlign: 'right' }}>{s.label}</span>
}
