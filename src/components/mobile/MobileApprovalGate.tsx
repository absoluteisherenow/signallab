'use client'

/**
 * MobileApprovalGate — mobile variant of the unified Approval Gate.
 * Full-screen modal. Preview fills the top 70%. Cancel top-right.
 * 56px red approve button sticks to the bottom (one-hand reachable).
 */

import { useEffect } from 'react'
import { BRT } from '@/lib/design/brt'

const C = BRT

interface Props {
  title: string
  summary: string
  mediaUrl?: string | null
  mediaType?: 'image' | 'video'
  caption?: string
  sending?: boolean
  approveLabel?: string
  onApprove: () => void
  onCancel: () => void
}

export function MobileApprovalGate({
  title,
  summary,
  mediaUrl,
  mediaType = 'image',
  caption,
  sending = false,
  approveLabel = 'Approve',
  onApprove,
  onCancel,
}: Props) {
  // Esc to cancel, Enter to approve
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && !sending) onApprove()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onApprove, onCancel, sending])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      color: C.ink,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: `1px solid ${C.divide}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: C.inkDim,
            fontWeight: 700,
            marginBottom: 4,
          }}>
            Review before send
          </div>
          <div style={{
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {title}
          </div>
          <div style={{
            fontSize: 11,
            color: C.inkDim,
            marginTop: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {summary}
          </div>
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'none',
            border: `1px solid ${C.divide}`,
            color: C.ink,
            fontFamily: 'inherit',
            fontSize: 20,
            width: 44,
            height: 44,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label="Cancel"
        >
          ×
        </button>
      </div>

      {/* Preview (scrollable, fills remaining space above the footer) */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        background: C.ticketLo,
      }}>
        {mediaUrl && (
          <div style={{ background: '#000', display: 'flex', justifyContent: 'center' }}>
            {mediaType === 'video' ? (
              <video src={mediaUrl} controls style={{ maxWidth: '100%', maxHeight: '60vh' }} />
            ) : (
              <img src={mediaUrl} alt="" style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
            )}
          </div>
        )}
        {caption && (
          <div style={{
            padding: '16px',
            fontSize: 14,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            color: C.ink,
          }}>
            {caption}
          </div>
        )}
        {!mediaUrl && !caption && (
          <div style={{
            padding: '40px 16px',
            textAlign: 'center',
            fontSize: 13,
            color: C.inkDim,
          }}>
            Nothing to preview
          </div>
        )}
      </div>

      {/* Footer — sticky approve button */}
      <div style={{
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom)) 16px',
        borderTop: `1px solid ${C.divide}`,
        background: C.bg,
      }}>
        <button
          onClick={onApprove}
          disabled={sending}
          style={{
            width: '100%',
            minHeight: 56,
            background: C.red,
            border: 'none',
            color: C.bg,
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            cursor: sending ? 'default' : 'pointer',
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? 'Sending...' : approveLabel}
        </button>
      </div>
    </div>
  )
}
