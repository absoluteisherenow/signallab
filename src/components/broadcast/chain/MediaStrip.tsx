'use client'

import { BRT } from '@/lib/design/brt'

interface Props {
  name: string
  meta: string            // e.g. "1080×1920 · 24MB · REEL · 9:16"
  duration?: string        // e.g. "0:18"
  thumbnail?: string | null
  /** when set, shows a status line instead of the Replace button */
  status?: string
  onReplace?: () => void
}

export function MediaStrip({ name, meta, duration, thumbnail, status, onReplace }: Props) {
  const handleReplace = () => {
    if (!onReplace) return
    if (window.confirm('Replace media? This will restart the scan.')) onReplace()
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        background: BRT.ticket,
        border: `1px solid ${BRT.borderBright}`,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          background: thumbnail
            ? `url(${thumbnail}) center/cover no-repeat`
            : `linear-gradient(135deg, #141414 0%, #070707 100%)`,
          border: `1px solid ${BRT.borderBright}`,
          position: 'relative',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {!thumbnail && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'repeating-linear-gradient(135deg, #141414 0 6px, #0b0b0b 6px 12px)',
            }}
          />
        )}
        {duration && (
          <span
            style={{
              position: 'absolute',
              bottom: 3,
              right: 3,
              fontSize: 8,
              letterSpacing: '0.14em',
              color: BRT.red,
              fontWeight: 700,
              zIndex: 1,
            }}
          >
            {duration}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: BRT.ink,
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.22em',
            color: '#9a9a9a',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {meta}
        </div>
      </div>
      {status ? (
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.22em',
            color: BRT.red,
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          ● {status}
        </div>
      ) : (
        onReplace && (
          <button
            onClick={handleReplace}
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: `1px solid ${BRT.borderBright}`,
              color: '#9a9a9a',
              fontSize: 9,
              letterSpacing: '0.22em',
              fontWeight: 700,
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Replace
          </button>
        )
      )}
    </div>
  )
}
