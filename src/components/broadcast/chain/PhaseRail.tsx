'use client'

import { BRT } from '@/lib/design/brt'
import type { ChainPhase } from './types'

const STEPS: { key: ChainPhase | 'approve'; label: string }[] = [
  { key: 'drop', label: 'Drop' },
  { key: 'scanning', label: 'Scan' },
  { key: 'voice', label: 'Voice' },
  { key: 'approve', label: 'Approve' },
]

/**
 * Maps live phase state → which rail step is "active" and which are "done".
 * scanning/scanned both live under the Scan step.
 */
function stateFor(stepIdx: number, phase: ChainPhase): 'done' | 'active' | 'idle' {
  const phaseIdx = phaseIndex(phase)
  if (stepIdx < phaseIdx) return 'done'
  if (stepIdx === phaseIdx) return 'active'
  return 'idle'
}

function phaseIndex(phase: ChainPhase): number {
  switch (phase) {
    case 'drop': return 0
    case 'scanning': return 1
    case 'scanned': return 1
    case 'voice': return 2
  }
}

export function PhaseRail({ phase }: { phase: ChainPhase }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {STEPS.map((step, i) => {
        const s = stateFor(i, phase)
        const color = s === 'done' ? BRT.green : s === 'active' ? BRT.red : '#5a5a5a'
        const borderColor = s === 'done' ? BRT.green : s === 'active' ? BRT.red : BRT.borderBright
        const bg = s === 'done' ? BRT.green : 'transparent'
        const numColor = s === 'done' ? BRT.bg : color
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 10,
                letterSpacing: '0.2em',
                fontWeight: 700,
                textTransform: 'uppercase',
                color,
                animation: s === 'active' ? 'brt-pulse 1.4s ease-in-out infinite' : 'none',
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  border: `1px solid ${borderColor}`,
                  background: bg,
                  color: numColor,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              {step.label}
            </div>
            {i < STEPS.length - 1 && (
              <span style={{ color: BRT.dimmest, fontSize: 14 }}>→</span>
            )}
          </div>
        )
      })}
      <style jsx>{`
        @keyframes brt-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
