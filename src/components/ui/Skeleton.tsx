'use client'

const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--border-dim) 25%, var(--border) 50%, var(--border-dim) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
  borderRadius: 2,
}

export function SkeletonLine({ width = '60%', height = 12 }: { width?: string; height?: number }) {
  return <div style={{ ...shimmerStyle, width, height }} />
}

export function SkeletonRow() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '14px 1fr auto',
      alignItems: 'center',
      gap: '14px',
      padding: '13px 20px',
      borderBottom: '1px solid var(--border-dim)',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
      <SkeletonLine width="70%" />
      <div style={{ ...shimmerStyle, height: 10, width: 70 }} />
    </div>
  )
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border-dim)',
      padding: '28px 32px',
      height,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <SkeletonLine width="40%" height={10} />
      <SkeletonLine width="80%" height={14} />
      <SkeletonLine width="55%" height={14} />
    </div>
  )
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', overflow: 'hidden' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}
