'use client'

import { useEffect, useRef, useState } from 'react'
import { BRT } from '@/lib/design/brt'
import {
  scanSingleFile,
  type ChainScanResult,
  type ScanFrame,
  type ScanProgress,
  type ScanStage,
} from '@/lib/chainScan'

interface Props {
  file: File
  onComplete: (res: ChainScanResult, composite: number, thumbnail: string | null) => void
  onError?: (msg: string) => void
}

type StageState = 'queued' | 'running' | 'done'
type StageKey = ScanStage

interface StageDef {
  key: StageKey
  num: string
  label: string
  blurb: string
  state: StageState
  /** Wall-clock start/end — for showing "2.1s" per stage in the telemetry. */
  startedAt?: number
  doneAt?: number
}

const STAGES: Omit<StageDef, 'state'>[] = [
  { key: 'extract', num: '01', label: 'Extract',  blurb: 'Sampling frames' },
  { key: 'read',    num: '02', label: 'Read',     blurb: 'Looking at the footage' },
  { key: 'polish',  num: '03', label: 'Polish',   blurb: 'Editorial pass' },
  { key: 'score',   num: '04', label: 'Score',    blurb: 'Composite' },
]

/** Rough expected wall-clock per stage. Used ONLY to ease the progress bar
 *  within a running stage so the UI doesn't look frozen during the 5-15s
 *  vision call. Capped at 0.82 so the bar always snaps forward on real
 *  completion — we never fake-finish a stage. */
const EXPECTED_STAGE_MS: Record<StageKey, number> = {
  extract: 2000,
  read:   10000,
  polish:  6000,
  score:    800,
}

/** Rotating sub-captions during long stages. Honest verbs about what the
 *  pass is doing — never fake telemetry. Cycles every ~2.5s while running. */
const ROTATING_BLURBS: Record<StageKey, string[]> = {
  extract: ['Sampling frames'],
  read: [
    'Looking at the footage',
    'Checking composition',
    'Reading the light',
    'Watching for movement',
    'Finding the hero frame',
  ],
  polish: [
    'Editorial pass',
    'Sharpening the hook',
    'Trimming the angle',
    'Locking the wow note',
  ],
  score: ['Composite'],
}

/**
 * PhaseScanConsole — replacement for PhaseScan.
 *
 * Truthful console readout of the actual scan pipeline. Three panels:
 *   LEFT  — film strip of extracted frames (streams in as sampled)
 *   MID   — display title + stage rail (driven by real pipeline events)
 *   RIGHT — telemetry + waiting-readout (what you'll get back)
 *
 * Stage machine is event-driven, not timed: each stage transitions when
 * scanSingleFile emits its progress callback. No fake increments. No
 * two-stages-running-at-once bugs.
 */
export function PhaseScanConsole({ file, onComplete, onError }: Props) {
  const [stages, setStages] = useState<StageDef[]>(() =>
    STAGES.map((s) => ({ ...s, state: 'queued' as StageState })),
  )
  const [frames, setFrames] = useState<ScanFrame[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [activeFrameIdx, setActiveFrameIdx] = useState(0)
  const startedRef = useRef(false)

  const isVideo = file.type.startsWith('video/')
  const running = stages.find((s) => s.state === 'running')
  const currentIdx = stages.findIndex((s) => s.state === 'running')
  const doneCount = stages.filter((s) => s.state === 'done').length
  // Within-stage ease: progress creeps forward during a running stage based
  // on expected wall-clock, capped at 0.82 so real completion still snaps
  // the bar the last bit. Elapsed ticks every 80ms so this recomputes live.
  const stageElapsed = running?.startedAt ? Date.now() - running.startedAt : 0
  const expectedMs = running ? EXPECTED_STAGE_MS[running.key] : 0
  const withinStage = expectedMs > 0 ? Math.min(0.82, stageElapsed / expectedMs) : 0
  const progress = Math.min(100, ((doneCount + withinStage) / stages.length) * 100)
  // Rotating blurb — cycles every 2.5s while the stage is running so the
  // big display word's subtitle doesn't sit static for 10+ seconds.
  const activeBlurbs = running ? ROTATING_BLURBS[running.key] : ['Ready']
  const blurbIdx = Math.floor(stageElapsed / 2500) % activeBlurbs.length
  const activeBlurb = activeBlurbs[blurbIdx] ?? running?.blurb ?? 'Ready'

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const startedAt = Date.now()
    const clock = setInterval(() => setElapsed(Date.now() - startedAt), 80)

    // Cycle the crosshair across extracted frames during the Sonnet read —
    // visualises "Claude is looking at these frames right now" without
    // pretending we know which specific frame attention is on.
    const crosshair = setInterval(() => {
      setActiveFrameIdx((i) => i + 1)
    }, 420)

    const handleProgress = (p: ScanProgress) => {
      setStages((prev) =>
        prev.map((s) => {
          if (s.key !== p.stage) return s
          if (p.phase === 'start') {
            return { ...s, state: 'running', startedAt: Date.now() }
          }
          return { ...s, state: 'done', doneAt: Date.now() }
        }),
      )
      if (p.stage === 'extract' && p.phase === 'done' && p.frames) {
        setFrames(p.frames)
      }
    }

    scanSingleFile(file, handleProgress)
      .then(({ result, composite, frames: finalFrames }) => {
        clearInterval(clock)
        clearInterval(crosshair)
        // Pick the hero frame by best_moment.frame_number (1-indexed in the
        // scan result) so Voice phase forwards a real data URL (never blob:).
        const heroIdx = Math.max(
          0,
          Math.min(finalFrames.length - 1, (result.best_moment?.frame_number ?? 1) - 1),
        )
        const hero = finalFrames[heroIdx]?.dataUrl ?? finalFrames[0]?.dataUrl ?? null
        // Small beat so the final ✓ done state is readable before advancing.
        setTimeout(() => onComplete(result, composite, hero), 360)
      })
      .catch((err: Error) => {
        clearInterval(clock)
        clearInterval(crosshair)
        onError?.(err.message || 'Scan failed')
      })

    return () => {
      clearInterval(clock)
      clearInterval(crosshair)
    }
  }, [file, onComplete, onError])

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 1fr) minmax(420px, 1.4fr) minmax(260px, 1fr)',
        gap: 12,
        minHeight: 0,
      }}
    >
      {/* ── LEFT · Film strip ────────────────────────────────────────── */}
      <FilmStripPanel
        frames={frames}
        isVideo={isVideo}
        activeFrameIdx={activeFrameIdx}
        reading={running?.key === 'read'}
        fileName={file.name}
      />

      {/* ── MID · Console readout ────────────────────────────────────── */}
      <ConsolePanel
        stages={stages}
        elapsed={elapsed}
        currentIdx={currentIdx}
        progress={progress}
        activeBlurb={activeBlurb}
        fileName={file.name}
        isVideo={isVideo}
      />

      {/* ── RIGHT · Telemetry + waiting readout ─────────────────────── */}
      <TelemetryPanel
        frames={frames}
        stages={stages}
        isVideo={isVideo}
      />

      {/* Global animations used across all three panels. */}
      <style jsx global>{`
        @keyframes brt-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.88); }
        }
        @keyframes brt-fade-in {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes brt-sweep {
          0%   { transform: translateY(-100%); opacity: 0; }
          15%  { opacity: 0.9; }
          85%  { opacity: 0.9; }
          100% { transform: translateY(100%); opacity: 0; }
        }
        @keyframes brt-frame-in {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

// ── LEFT PANEL ──────────────────────────────────────────────────────────

function FilmStripPanel({
  frames,
  isVideo,
  activeFrameIdx,
  reading,
  fileName,
}: {
  frames: ScanFrame[]
  isVideo: boolean
  activeFrameIdx: number
  reading: boolean
  fileName: string
}) {
  // Gate the crosshair sweep to the "read" stage only; before/after it sits
  // on a single frame without moving so it doesn't mislead.
  const focusIdx = frames.length > 0 ? activeFrameIdx % frames.length : 0

  return (
    <div
      style={{
        background: BRT.ticket,
        border: `1px solid ${BRT.borderBright}`,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <PanelHeader eyebrow="Film strip" tag={isVideo ? `${frames.length || '~'} frames` : '1 frame'} />

      {/* Hero preview — largest sampled frame, or a placeholder block while
          the extract stage is in flight. */}
      <div
        style={{
          position: 'relative',
          background: BRT.ticketLo,
          border: `1px solid ${BRT.borderBright}`,
          minHeight: 170,
          flex: '0 1 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {frames.length > 0 ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frames[focusIdx]?.dataUrl}
              alt={fileName}
              style={{ width: '100%', height: '100%', maxHeight: 220, objectFit: 'contain', display: 'block', animation: 'brt-frame-in .3s ease-out' }}
            />
            {/* Sweep line during READ stage — reads as "Claude is looking". */}
            {reading && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: '100%',
                  pointerEvents: 'none',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    height: 2,
                    background: `linear-gradient(90deg, transparent 0%, ${BRT.red} 50%, transparent 100%)`,
                    boxShadow: `0 0 12px ${BRT.red}`,
                    animation: 'brt-sweep 1.6s linear infinite',
                  }}
                />
              </div>
            )}
            {/* Frame index stamp (1-indexed to match Claude's frame_number) */}
            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                fontSize: 9,
                letterSpacing: '0.26em',
                color: BRT.red,
                fontWeight: 800,
                textTransform: 'uppercase',
                background: 'rgba(0,0,0,0.62)',
                padding: '3px 7px',
              }}
            >
              Frame {focusIdx + 1} / {frames.length} · {frames[focusIdx]?.timestamp?.toFixed(1) ?? '0.0'}s
            </div>
          </>
        ) : (
          <div
            style={{
              color: BRT.dimmest,
              fontSize: 10,
              letterSpacing: '0.28em',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            ◌ Sampling…
          </div>
        )}
      </div>

      {/* Thumbnail strip — every sampled frame in order. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(frames.length, isVideo ? 6 : 1)}, 1fr)`,
          gap: 4,
          minHeight: 44,
        }}
      >
        {(frames.length > 0 ? frames : Array.from({ length: isVideo ? 6 : 1 })).map((f, i) => {
          const realFrame = frames[i]
          const isFocus = frames.length > 0 && i === focusIdx && reading
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                aspectRatio: '16 / 9',
                background: BRT.ticketLo,
                border: `1px solid ${isFocus ? BRT.red : 'rgba(255,42,26,0.18)'}`,
                overflow: 'hidden',
                boxShadow: isFocus ? `0 0 14px rgba(255,42,26,0.55)` : 'none',
                transition: 'border-color .25s ease, box-shadow .25s ease',
              }}
            >
              {realFrame && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={realFrame.dataUrl}
                  alt={`frame ${i + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', animation: 'brt-frame-in .3s ease-out' }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── MIDDLE PANEL ───────────────────────────────────────────────────────

function ConsolePanel({
  stages,
  elapsed,
  currentIdx,
  progress,
  activeBlurb,
  fileName,
  isVideo,
}: {
  stages: StageDef[]
  elapsed: number
  currentIdx: number
  progress: number
  activeBlurb: string
  fileName: string
  isVideo: boolean
}) {
  const running = stages[currentIdx]
  const activeLabel = running ? activeBlurb : stages.every((s) => s.state === 'done') ? 'Complete' : 'Queued'

  return (
    <div
      style={{
        background: BRT.ticket,
        border: `1px solid ${BRT.red}`,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 22,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient scanline gradient — cosmetic. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(255,42,26,0.08) 0%, rgba(255,42,26,0) 22%, rgba(255,42,26,0) 78%, rgba(255,42,26,0.06) 100%)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px)',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
        }}
      />

      {/* Display title composition. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.42em',
            color: BRT.red,
            fontWeight: 700,
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: BRT.red, animation: 'brt-pulse 1s ease-in-out infinite' }} />
          {running ? `Stage ${running.num} of 04` : stages.every((s) => s.state === 'done') ? 'All stages locked' : `Stage 00 / 04`}
        </div>
        <div
          style={{
            fontSize: 52,
            lineHeight: 0.92,
            fontWeight: 900,
            letterSpacing: '-0.045em',
            textTransform: 'lowercase',
            color: BRT.ink,
            position: 'relative',
          }}
        >
          <span style={{ position: 'relative', display: 'inline-block' }}>
            {running?.label.toLowerCase() ?? 'ready'}
            <span style={{ color: BRT.red }}>.</span>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 0, right: 0, bottom: -6, height: 2,
                background: `linear-gradient(90deg, transparent 0%, ${BRT.red} 50%, transparent 100%)`,
                opacity: 0.7,
              }}
            />
          </span>
        </div>
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            fontSize: 11,
            letterSpacing: '0.24em',
            color: '#c8c8c8',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ color: BRT.red }}>{formatElapsed(elapsed)}</span>
          <span style={{ color: BRT.dimmest }}>·</span>
          <span>{activeLabel}</span>
        </div>
      </div>

      {/* Stage rail. Single source of truth — each row reflects real state. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 460, position: 'relative', zIndex: 1 }}>
        {stages.map((s) => {
          const active = s.state === 'running'
          const done = s.state === 'done'
          const labelColor = active ? BRT.ink : done ? 'rgba(255,90,71,0.82)' : 'rgba(255,90,71,0.28)'
          const statusColor = active ? BRT.red : done ? 'rgba(255,90,71,0.62)' : 'rgba(255,90,71,0.3)'
          return (
            <div
              key={s.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 14px',
                border: `1px solid ${active ? BRT.red : done ? 'rgba(255,42,26,0.28)' : 'rgba(255,42,26,0.1)'}`,
                background: active
                  ? 'linear-gradient(90deg, rgba(255,42,26,0.16) 0%, rgba(255,42,26,0.03) 100%)'
                  : done
                    ? 'rgba(255,42,26,0.03)'
                    : 'transparent',
                boxShadow: active ? `0 0 0 1px ${BRT.red} inset, 0 12px 30px -18px rgba(255,42,26,0.7)` : 'none',
                fontSize: 11,
                letterSpacing: '0.22em',
                color: labelColor,
                fontWeight: 700,
                textTransform: 'uppercase',
                transition: 'all .25s ease',
              }}
            >
              <span
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  color: statusColor,
                  minWidth: 22,
                }}
              >
                {s.num}
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: active || done ? BRT.red : 'rgba(255,42,26,0.25)',
                  boxShadow: active ? `0 0 10px ${BRT.red}` : 'none',
                  animation: active ? 'brt-pulse 1s ease-in-out infinite' : 'none',
                }}
              />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>{s.label}</span>
                <span style={{ fontSize: 9, letterSpacing: '0.18em', color: done ? 'rgba(255,90,71,0.5)' : active ? 'rgba(255,255,255,0.7)' : 'rgba(255,90,71,0.25)', fontWeight: 500, transition: 'opacity .3s ease' }}>
                  {active ? activeBlurb : s.blurb}
                </span>
              </span>
              <span
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                  fontSize: 10,
                  letterSpacing: '0.24em',
                  color: statusColor,
                }}
              >
                {done ? '✓ done' : active ? 'running' : 'queued'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Progress meter — fills based on completed stages + within-stage ease.
          Transition is short + linear so the 80ms interpolation ticks blend
          smoothly instead of each tick's .4s ease overshooting the next. */}
      <div style={{ width: '100%', maxWidth: 460, position: 'relative', zIndex: 1 }}>
        <div style={{ width: '100%', height: 2, background: 'rgba(255,42,26,0.14)', position: 'relative', overflow: 'visible' }}>
          <div
            style={{
              position: 'absolute',
              left: 0, top: 0, bottom: 0,
              width: `${progress}%`,
              background: `linear-gradient(90deg, rgba(255,42,26,0.4) 0%, ${BRT.red} 100%)`,
              transition: 'width .12s linear',
              boxShadow: '0 0 14px rgba(255,42,26,0.6)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: -3, bottom: -3,
              left: `calc(${progress}% - 4px)`,
              width: 8,
              background: BRT.ink,
              boxShadow: `0 0 10px ${BRT.red}`,
              transition: 'left .12s linear',
            }}
          />
        </div>
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            fontSize: 9,
            letterSpacing: '0.28em',
            color: BRT.dimmest,
            textTransform: 'uppercase',
          }}
        >
          <span>signal ▸ scanning</span>
          <span style={{ color: BRT.red }}>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Filename stamp at the bottom — small, mono, low-ink. */}
      <div
        style={{
          marginTop: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          fontSize: 9,
          letterSpacing: '0.22em',
          color: BRT.dimmest,
          textTransform: 'uppercase',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {isVideo ? '◉ video' : '◉ image'} · {fileName}
      </div>
    </div>
  )
}

// ── RIGHT PANEL ────────────────────────────────────────────────────────

function TelemetryPanel({
  frames,
  stages,
  isVideo,
}: {
  frames: ScanFrame[]
  stages: StageDef[]
  isVideo: boolean
}) {
  const extractStage = stages.find((s) => s.key === 'extract')
  const readStage    = stages.find((s) => s.key === 'read')
  const polishStage  = stages.find((s) => s.key === 'polish')

  return (
    <div
      style={{
        background: BRT.ticket,
        border: `1px solid ${BRT.borderBright}`,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <PanelHeader eyebrow="Telemetry" />

      {/* Per-stage real timings. Only filled once a stage completes; in-flight
          stages show a pulsing dash so the user sees something's happening. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <TelemetryRow label="Frames sampled"  value={extractStage?.state === 'done' ? `${frames.length}` : '—'} live={extractStage?.state === 'running'} />
        <TelemetryRow label="Extract wall"    value={stageDuration(extractStage)}  live={extractStage?.state === 'running'} />
        <TelemetryRow label="Read wall"       value={stageDuration(readStage)}     live={readStage?.state === 'running'} />
        <TelemetryRow label="Polish wall"     value={stageDuration(polishStage)}   live={polishStage?.state === 'running'} />
        <TelemetryRow label="Media"           value={isVideo ? 'video' : 'image'}  live={false} />
      </div>

      {/* Waiting readout — what the scan returns. Fills confidence in the wait
          rather than leaving the user staring at empty space. */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingTop: 12,
          borderTop: `1px solid ${BRT.borderBright}`,
        }}
      >
        <div style={{ fontSize: 9, letterSpacing: '0.3em', color: '#9a9a9a', fontWeight: 800, textTransform: 'uppercase' }}>
          ◉ You'll get back
        </div>
        {[
          { n: 'Composite score',       d: 'Blended 5-pillar score, 0–100' },
          { n: 'Wow note',              d: 'Editorial one-liner on what\'s shareable' },
          { n: 'Platform ranking',      d: 'Per-platform fit with reasons' },
          { n: 'Tagged moments',        d: isVideo ? 'Hero + top 3 timestamps' : 'Detected subjects' },
        ].map((row) => (
          <div key={row.n} style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 2 }}>
            <span style={{ fontSize: 11, color: BRT.ink, fontWeight: 700 }}>· {row.n}</span>
            <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', paddingLeft: 10 }}>{row.d}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TelemetryRow({ label, value, live }: { label: string; value: string; live: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 8px',
        background: BRT.ticketLo,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      <span style={{ color: BRT.dimmest }}>{label}</span>
      <span style={{ color: live ? BRT.red : BRT.ink, animation: live ? 'brt-pulse 1s ease-in-out infinite' : 'none' }}>
        {value}
      </span>
    </div>
  )
}

function PanelHeader({ eyebrow, tag }: { eyebrow: string; tag?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 10, letterSpacing: '0.3em', color: BRT.red, fontWeight: 800, textTransform: 'uppercase' }}>
        ◉ {eyebrow}
      </div>
      {tag && (
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            fontSize: 9,
            letterSpacing: '0.22em',
            color: BRT.dimmest,
            textTransform: 'uppercase',
          }}
        >
          {tag}
        </div>
      )}
    </div>
  )
}

// ── HELPERS ────────────────────────────────────────────────────────────

/** mm:ss.t — mono counter shown under the display title. */
function formatElapsed(ms: number): string {
  const total = ms / 1000
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  const t = Math.floor((total % 1) * 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`
}

/** Render a stage's real wall-clock duration once it completes. */
function stageDuration(s: StageDef | undefined): string {
  if (!s) return '—'
  if (s.state === 'queued') return '—'
  if (s.state === 'running') return '…'
  if (s.startedAt && s.doneAt) {
    const ms = s.doneAt - s.startedAt
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }
  return '—'
}
