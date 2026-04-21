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
  /** IG accounts tagged on the post itself (user_tags). Displayed as chips. */
  userTags?: string[]
  /** Single IG username invited as a collab co-author. */
  collabWith?: string | null
  /** First-comment free text (without hashtags). */
  firstComment?: string
  /** Hashtags (space-separated string or array). Shown appended to first comment preview. */
  hashtags?: string
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
  userTags,
  collabWith,
  firstComment,
  hashtags,
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

  const firstCommentPreview = (() => {
    const tagBlock = (hashtags || '')
      .split(/\s+/)
      .map(h => h.trim())
      .filter(Boolean)
      .map(h => (h.startsWith('#') ? h : '#' + h))
      .join(' ')
    const parts = [firstComment?.trim(), tagBlock].filter(Boolean) as string[]
    return parts.length ? parts.join('\n\n') : null
  })()

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: C.inkDim,
    fontWeight: 700,
    marginBottom: 8,
  }

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

        {collabWith && (
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${C.divide}`,
            background: C.surface,
            fontSize: 12,
            color: C.ink,
          }}>
            <span style={{ color: C.red, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 8 }}>
              Collab
            </span>
            @{collabWith.replace(/^@/, '')}
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

        {userTags && userTags.length > 0 && (
          <div style={{ padding: '0 16px 16px' }}>
            <div style={sectionLabel}>Tagged</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {userTags.map(u => (
                <span
                  key={u}
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    background: C.surface,
                    border: `1px solid ${C.divide}`,
                    color: C.ink,
                  }}
                >
                  @{u.replace(/^@/, '')}
                </span>
              ))}
            </div>
          </div>
        )}

        {firstCommentPreview && (
          <div style={{ padding: '0 16px 20px' }}>
            <div style={sectionLabel}>First comment</div>
            <div style={{
              padding: 12,
              background: C.surface,
              border: `1px solid ${C.divide}`,
              fontSize: 13,
              color: C.inkSoft,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {firstCommentPreview}
            </div>
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
