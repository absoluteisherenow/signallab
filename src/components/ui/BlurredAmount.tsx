'use client'

import { useState } from 'react'

interface BlurredAmountProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

/**
 * Wraps financial figures in a blur filter.
 * Tap/click to reveal, click again to re-blur.
 */
export function BlurredAmount({ children, style }: BlurredAmountProps) {
  const [revealed, setRevealed] = useState(false)

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setRevealed(r => !r) }}
      style={{
        filter: revealed ? 'none' : 'blur(6px)',
        transition: 'filter 0.2s ease',
        cursor: 'pointer',
        userSelect: revealed ? 'auto' : 'none',
        WebkitUserSelect: revealed ? 'auto' : 'none',
        ...style,
      }}
      title={revealed ? 'Click to hide' : 'Click to reveal'}
    >
      {children}
    </span>
  )
}
