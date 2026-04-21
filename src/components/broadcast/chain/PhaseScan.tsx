'use client'

import { useEffect, useRef, useState } from 'react'
import { BRT } from '@/lib/design/brt'
import { scanSingleFile, type ChainScanResult } from '@/lib/chainScan'

interface Props {
  file: File
  onComplete: (res: ChainScanResult, composite: number, thumbnail: string | null) => void
  onError?: (msg: string) => void
}

type Step = { key: string; label: string; state: 'queued' | 'running' | 'done' }

// Real pipeline stages. No audio transcription (scanner is vision-only) and
// "vibe" / "hooks" were never independent steps — they're fields inside the
// single Sonnet JSON response. What actually runs: sample frames → Sonnet
// vision read → Opus editorial polish (wow_note, editorial_angle, caption
// context, post rec) → client-side composite score.
const INITIAL_STEPS: Step[] = [
  { key: 'frames',    label: 'Frames sampled',  state: 'running' },
  { key: 'vision',    label: 'Vision read',     state: 'queued' },
  { key: 'editorial', label: 'Editorial pass',  state: 'queued' },
  { key: 'score',     label: 'Scored',          state: 'queued' },
]

/**
 * PhaseScan — drives the scan pipeline and shows a 5-step progress UI.
 * When the Claude vision call resolves, `onComplete` fires.
 */
export function PhaseScan({ file, onComplete, onError }: Props) {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS)
  const [progress, setProgress] = useState(0)
  // Live elapsed clock so the scan feels like a scope readout, not a
  // generic loading spinner. Ticks every 80ms (mm:ss.t format).
  const [elapsed, setElapsed] = useState(0)
  const startedRef = useRef(false)

  const currentStepIndex = Math.max(
    0,
    steps.findIndex(s => s.state === 'running'),
  )

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const startedAt = Date.now()
    const clock = setInterval(() => setElapsed(Date.now() - startedAt), 80)

    let stepIdx = 0
    const tickStep = () => {
      setSteps(prev => {
        const next = [...prev]
        if (stepIdx < next.length) {
          if (stepIdx > 0) next[stepIdx - 1] = { ...next[stepIdx - 1], state: 'done' }
          next[stepIdx] = { ...next[stepIdx], state: 'running' }
        }
        return next
      })
      setProgress(Math.min(100, (stepIdx / INITIAL_STEPS.length) * 100))
      stepIdx++
    }
    // Animate steps 1-4 while the network call runs. Step 5 flips done on success.
    tickStep()
    const tick = setInterval(() => {
      if (stepIdx < INITIAL_STEPS.length - 1) tickStep()
    }, 900)

    scanSingleFile(file)
      .then(({ result, composite, frames }) => {
        clearInterval(tick)
        clearInterval(clock)
        setSteps(prev => prev.map(s => ({ ...s, state: 'done' as const })))
        setProgress(100)
        // Always hand the downstream phase a base-64 data URL (never a blob:
        // URL) so PhaseVoice can forward it into the caption vision call.
        // For images extractImageFrame produced a single jpeg data URL;
        // for video we pick the hero frame by scan verdict.
        const heroIdx = (result.best_moment?.frame_number ?? 1) - 1
        const finalThumb = (frames[heroIdx] || frames[0])?.dataUrl ?? null
        // Small beat so the "done" state is visible before advancing
        setTimeout(() => onComplete(result, composite, finalThumb), 420)
      })
      .catch((err: Error) => {
        clearInterval(tick)
        clearInterval(clock)
        onError?.(err.message || 'Scan failed')
      })

    return () => {
      clearInterval(tick)
      clearInterval(clock)
    }
  }, [file, onComplete, onError])

  const activeStepLabel = steps[currentStepIndex]?.label ?? 'Analysing'

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        padding: '40px 18px',
        background: BRT.ticket,
        border: `1px solid ${BRT.red}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient scanline — subtle vertical gradient sweep behind the
          composition. Reads like a scope, not a spinner. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(255,42,26,0.08) 0%, rgba(255,42,26,0) 22%, rgba(255,42,26,0) 78%, rgba(255,42,26,0.06) 100%)',
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

      {/* Header composition: eyebrow + heavy display title + mono readout.
          Display title uses BRT.red tinted through opacity layering instead
          of flat white — feels like a marquee panel, not a status message. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
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
          Scan sequence · 0{Math.min(currentStepIndex + 1, INITIAL_STEPS.length)} / 0{INITIAL_STEPS.length}
        </div>
        <div
          style={{
            fontSize: 48,
            lineHeight: 0.95,
            fontWeight: 900,
            letterSpacing: '-0.045em',
            textTransform: 'lowercase',
            color: BRT.ink,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          <span style={{ position: 'relative', display: 'inline-block' }}>
            reading<span style={{ color: BRT.red }}>.</span>
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
          <span>{activeStepLabel}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 460, maxWidth: '100%', position: 'relative', zIndex: 1 }}>
        {steps.map((s, i) => {
          const active = s.state === 'running'
          const done = s.state === 'done'
          // All-red tonal ladder: queued sits at low alpha, active is full,
          // done steps fade to a muted brand tint. No grey — keeps the panel
          // reading as a single chromatic system.
          const labelColor = active ? BRT.ink : done ? 'rgba(255,90,71,0.75)' : 'rgba(255,90,71,0.28)'
          const statusColor = active ? BRT.red : done ? 'rgba(255,90,71,0.55)' : 'rgba(255,90,71,0.3)'
          return (
            <div
              key={s.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 14px',
                border: `1px solid ${active ? BRT.red : done ? 'rgba(255,42,26,0.22)' : 'rgba(255,42,26,0.1)'}`,
                background: active
                  ? 'linear-gradient(90deg, rgba(255,42,26,0.14) 0%, rgba(255,42,26,0.03) 100%)'
                  : done
                    ? 'rgba(255,42,26,0.025)'
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
                0{i + 1}
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
              <span style={{ flex: 1 }}>{s.label}</span>
              <span
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                  fontSize: 10,
                  letterSpacing: '0.24em',
                  color: statusColor,
                }}
              >
                {done ? '✓ locked' : active ? 'running' : 'queued'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Progress bar with trailing bright dot + soft red glow under it.
          Reads more like a synth meter than a CSS loading bar. */}
      <div style={{ width: 460, maxWidth: '100%', position: 'relative', zIndex: 1 }}>
        <div style={{ width: '100%', height: 2, background: 'rgba(255,42,26,0.14)', position: 'relative', overflow: 'visible' }}>
          <div
            style={{
              position: 'absolute',
              left: 0, top: 0, bottom: 0,
              width: `${progress}%`,
              background: `linear-gradient(90deg, rgba(255,42,26,0.4) 0%, ${BRT.red} 100%)`,
              transition: 'width .35s ease',
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
              transition: 'left .35s ease',
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
          <span>signal ▸ claude vision</span>
          <span style={{ color: BRT.red }}>{Math.round(progress)}%</span>
        </div>
        {/* Reassurance copy fades in after 8s — VIDEO ONLY. Video scans run
            20–30s because Sonnet reads 6 frames + Opus polish hits sequentially.
            Image scans finish in 2–4s so this threshold rarely trips anyway,
            but gating by mime type keeps the "every frame" copy honest. */}
        {file.type.startsWith('video/') && elapsed > 8000 && (
          <div
            style={{
              marginTop: 14,
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              color: BRT.inkSoft,
              textTransform: 'uppercase',
              textAlign: 'center',
              animation: 'brt-fade-in .45s ease-out',
            }}
          >
            {elapsed > 22000
              ? 'almost there — heavy frames take a beat'
              : 'typically 20–30s · Claude reads every frame carefully'}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes brt-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.85); }
        }
        @keyframes brt-fade-in {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/** mm:ss.t — mono counter under the display title. */
function formatElapsed(ms: number): string {
  const totalTenths = Math.floor(ms / 100)
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor((totalTenths % 600) / 10)
  const tenths = totalTenths % 10
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(minutes)}:${pad(seconds)}.${tenths}`
}
