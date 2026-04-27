'use client'

/**
 * PulseLoader — the brand monogram, breathing.
 *
 * A square containing the Signal Lab pulse waveform that fades and
 * subtly scales like a slow breath. Used as the canonical loading
 * indicator across the app.
 */

interface PulseLoaderProps {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const dimensions = {
  sm: { box: 32, stroke: 2 },
  md: { box: 56, stroke: 2 },
  lg: { box: 88, stroke: 1.75 },
}

export function PulseLoader({ label, size = 'md', className }: PulseLoaderProps) {
  const d = dimensions[size]

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size === 'sm' ? '10px' : '16px',
      }}
    >
      <div
        style={{
          width: `${d.box}px`,
          height: `${d.box}px`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pulse-loader-breath 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          willChange: 'opacity, transform',
        }}
      >
        <svg
          width={d.box}
          height={d.box}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="6"
            y="6"
            width="52"
            height="52"
            rx="10"
            fill="none"
            stroke="#ff2a1a"
            strokeWidth="1.25"
            opacity="0.85"
          />
          <polyline
            points="12,32 22,32 26,18 32,46 36,26 40,34 44,30 50,32"
            stroke="#ff2a1a"
            strokeWidth={d.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      {label && (
        <div
          className="font-mono"
          style={{
            color: '#a09d95',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
      )}
      <style>{`
        @keyframes pulse-loader-breath {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.02); }
        }
      `}</style>
    </div>
  )
}
