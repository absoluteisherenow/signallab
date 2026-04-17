'use client'

/**
 * ScanPulse — animated Signal Lab emblem for loading states.
 *
 * Sizes:
 *   "lg"  — 80px emblem with rings, for full-panel loading (scanner, etc.)
 *   "md"  — 48px emblem, for card-level loading
 *   "sm"  — 20px inline, for buttons (just the signal line, no rings)
 */

interface ScanPulseProps {
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

export function ScanPulse({ size = 'lg', color = 'var(--gold)' }: ScanPulseProps) {
  if (size === 'sm') {
    // Inline button spinner — just the animated signal line
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', flexShrink: 0 }}>
        <svg viewBox="0 0 64 64" fill="none" width="16" height="16">
          <polyline
            points="8,32 16,32 20,20 24,44 28,16 32,40 36,22 40,38 44,28 48,32 56,32"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            style={{
              strokeDasharray: '120',
              animation: 'scan-draw 1.4s ease-in-out infinite',
            }}
          />
        </svg>
        <style>{scanPulseCSS}</style>
      </span>
    )
  }

  const dim = size === 'md' ? 48 : 80
  const inset = size === 'md' ? '4px' : '8px'
  const svgSize = size === 'md' ? 40 : 64
  const outerRadius = size === 'md' ? '10px' : '16px'
  const innerRadius = size === 'md' ? '8px' : '12px'

  return (
    <div style={{ position: 'relative', width: `${dim}px`, height: `${dim}px` }}>
      {/* Outer ring — slow pulse */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: outerRadius,
        border: `1px solid ${color}`,
        opacity: 0.15,
        animation: 'scan-pulse 2s ease-in-out infinite',
      }} />
      {/* Inner ring — staggered pulse */}
      {size === 'lg' && (
        <div style={{
          position: 'absolute', inset: '8px', borderRadius: innerRadius,
          border: `1px solid ${color}`,
          opacity: 0.1,
          animation: 'scan-pulse 2s ease-in-out infinite 0.5s',
        }} />
      )}
      {/* Signal line SVG — animated draw */}
      <svg viewBox="0 0 64 64" fill="none" style={{
        position: 'absolute', inset, width: `${svgSize}px`, height: `${svgSize}px`,
      }}>
        <polyline
          points="8,32 16,32 20,20 24,44 28,16 32,40 36,22 40,38 44,28 48,32 56,32"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          style={{
            strokeDasharray: '120',
            strokeDashoffset: '0',
            animation: 'scan-draw 1.8s ease-in-out infinite',
            filter: `drop-shadow(0 0 4px ${color === 'var(--gold)' ? 'rgba(255,42,26,0.4)' : 'currentColor'})`,
          }}
        />
      </svg>
      <style>{scanPulseCSS}</style>
    </div>
  )
}

const scanPulseCSS = `
  @keyframes scan-pulse {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.04); }
  }
  @keyframes scan-draw {
    0% { stroke-dashoffset: 120; opacity: 0.3; }
    40% { stroke-dashoffset: 0; opacity: 1; }
    60% { stroke-dashoffset: 0; opacity: 1; }
    100% { stroke-dashoffset: -120; opacity: 0.3; }
  }
`
