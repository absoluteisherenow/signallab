'use client'

/**
 * ApprovalGate — single source of truth for "nothing outbound fires without an
 * explicit human confirmation showing the full rendered preview."
 *
 * See HARD RULE: feedback_approve_before_send.md in auto-memory.
 *
 * USE THROUGH:
 *   - `useGatedSend()` from '@/lib/outbound' — wraps fetch() in the two-step
 *     preview → gate → confirm flow
 *   - `useApprovalGate()` directly only when you have a non-standard flow
 *
 * DO NOT fetch `/api/*\/send`, `/publish`, `/chase`, `/blast`, `/post` endpoints
 * from anywhere else. The CI check scripts/check-outbound-gated.sh enforces this.
 */

import { createContext, useContext, useRef, useState, ReactNode } from 'react'

export type GateKind = 'email' | 'post' | 'dm' | 'sms'

export interface GateConfig {
  kind: GateKind
  /** One-line human description, always shown. Required. */
  summary: string
  /** Recipient(s) — email address(es), @handle, phone */
  to?: string | string[]
  /** For email */
  subject?: string
  /** Rich HTML body (email) — rendered in sandboxed iframe */
  html?: string
  /** Plain text body (DM / SMS / post caption) */
  text?: string
  /** Media URLs to preview as thumbnails (post) */
  media?: string[]
  /** Platform label (post / DM) — e.g. "instagram", "tiktok" */
  platform?: string
  /** Extra labelled key/value rows shown above the body */
  meta?: Array<{ label: string; value: string }>
  // ── post-kind extras (rendered into the IG-styled preview card) ──
  /** If set, the post is being scheduled, not published now. Shown as a
   *  banner and flips the confirm button label to "Schedule →". */
  scheduledFor?: string
  /** Pre-written first comment (IG first-comment pattern for tags + hashtags). */
  firstComment?: string
  /** Location chip shown above the media. */
  locationName?: string
  /** @handles tagged on the media — rendered as pills on the preview. */
  tags?: string[]
  /** Aspect hint for the media preview: 'square' | 'portrait' | 'story'.
   *  Defaults to 'square'. */
  mediaAspect?: 'square' | 'portrait' | 'story'
  /** Label used in place of the signed-in account handle on the preview
   *  card (e.g. "@nightmanoeuvres"). Cosmetic — the real identity is
   *  server-determined by session. */
  accountHandle?: string
  /** Co-authors (IG Collab). Rendered as "with @x, @y" in the post header
   *  so the user sees exactly how the post will appear. */
  collaborators?: string[]
  /** Alt text for accessibility + IG search. Shown as a note under the
   *  media so the user can proofread before confirming. */
  altText?: string
  /** Reels-only: whether the reel also appears on the main grid. Default
   *  true on IG — shown as a banner if false so the user is aware. */
  shareToFeed?: boolean
}

export interface GateResult {
  confirmed: boolean
}

interface GateCtx {
  gate: (config: GateConfig) => Promise<GateResult>
}

const Ctx = createContext<GateCtx | null>(null)

export function useApprovalGate() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApprovalGate must be used within <ApprovalGateProvider>')
  return v.gate
}

export function ApprovalGateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    config: GateConfig
    resolve: (r: GateResult) => void
  } | null>(null)
  const resolvedRef = useRef(false)

  const gate = (config: GateConfig) =>
    new Promise<GateResult>((resolve) => {
      resolvedRef.current = false
      setState({ config, resolve })
    })

  const finish = (confirmed: boolean) => {
    if (!state || resolvedRef.current) return
    resolvedRef.current = true
    state.resolve({ confirmed })
    setState(null)
  }

  return (
    <Ctx.Provider value={{ gate }}>
      {children}
      {state && (
        <GateModal
          config={state.config}
          onCancel={() => finish(false)}
          onConfirm={() => finish(true)}
        />
      )}
    </Ctx.Provider>
  )
}

function recipientLabel(to: GateConfig['to']): string {
  if (!to) return ''
  if (Array.isArray(to)) {
    if (to.length === 0) return ''
    if (to.length === 1) return to[0]
    return `${to.length} recipients`
  }
  return to
}

function GateModal({
  config,
  onCancel,
  onConfirm,
}: {
  config: GateConfig
  onCancel: () => void
  onConfirm: () => void
}) {
  const [sending, setSending] = useState(false)
  const toLabel = recipientLabel(config.to)
  const hasRecipient = !!toLabel
  // A post to your own social account (IG, TikTok, X, Threads) has no
  // distinct recipient — the platform IS the surface. Requiring `to` here
  // silently locks the Publish button, which is exactly the bug the user
  // hit. Email/DM/SMS still require `to`; post + schedule-post don't.
  const recipientRequired = config.kind === 'email' || config.kind === 'dm' || config.kind === 'sms'
  const canConfirm = !sending && (hasRecipient || !recipientRequired)

  const kindLabel: Record<GateKind, string> = {
    email: 'Review email before send',
    post: 'Review post before publish',
    dm: 'Review DM before send',
    sms: 'Review SMS before send',
  }

  // Confirm label flips when a scheduled time is set — the user isn't
  // publishing now, they're queuing. Mislabelling the button was the kind
  // of ambiguity that erodes trust in the approve-before-send contract.
  const isScheduled = config.kind === 'post' && !!config.scheduledFor
  const confirmLabel: Record<GateKind, string> = {
    email: 'Send now →',
    post: isScheduled ? 'Schedule →' : 'Publish now →',
    dm: 'Send DM →',
    sms: 'Send SMS →',
  }

  async function handleConfirm() {
    if (sending) return
    setSending(true)
    // The caller owns the actual send — gate just resolves. Reset sending in
    // case the caller's send fails and they re-open the gate.
    try {
      onConfirm()
    } finally {
      // onConfirm unmounts us, but if it doesn't, re-enable.
      setTimeout(() => setSending(false), 300)
    }
  }

  return (
    <div
      onClick={() => !sending && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={kindLabel[config.kind]}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5,5,5,0.88)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border-dim)',
          width: 'min(900px, 100%)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid var(--border-dim)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.2em',
                color: 'var(--gold)',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {kindLabel[config.kind]}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 6, wordBreak: 'break-word' }}>
              {config.summary}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', letterSpacing: '0.06em' }}>
              {hasRecipient ? (
                <>To: <span style={{ color: 'var(--text-dim)' }}>{toLabel}</span></>
              ) : recipientRequired ? (
                <span style={{ color: 'var(--gold)' }}>NO RECIPIENT</span>
              ) : (
                // Post to own social account — show the platform as the
                // destination instead of a misleading "NO RECIPIENT" warning.
                <span style={{ color: 'var(--text-dim)' }}>
                  Posting to <span style={{ textTransform: 'capitalize' }}>{config.platform || 'social'}</span>
                </span>
              )}
              {config.subject ? <> · {config.subject}</> : null}
              {config.platform && hasRecipient ? <> · {config.platform}</> : null}
            </div>
            {config.meta && config.meta.length > 0 && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px' }}>
                {config.meta.map((m, i) => (
                  <div key={i} style={{ display: 'contents', fontSize: 11 }}>
                    <div style={{ color: 'var(--text-dimmer)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 9 }}>
                      {m.label}
                    </div>
                    <div style={{ color: 'var(--text-dim)' }}>{m.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => !sending && onCancel()}
            disabled={sending}
            aria-label="Cancel"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dimmer)',
              fontSize: 20,
              cursor: sending ? 'not-allowed' : 'pointer',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          {config.html ? (
            <iframe
              srcDoc={config.html}
              sandbox=""
              title="Preview"
              style={{ flex: 1, width: '100%', border: 'none', background: '#fff', minHeight: 300 }}
            />
          ) : config.kind === 'post' ? (
            <PostPreview config={config} />
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
              {config.media && config.media.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  {config.media.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`Media ${i + 1}`}
                      style={{
                        width: 120,
                        height: 120,
                        objectFit: 'cover',
                        border: '1px solid var(--border-dim)',
                      }}
                    />
                  ))}
                </div>
              )}
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {config.text || '(no body)'}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: '1px solid var(--border-dim)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.12em',
              color: 'var(--text-dimmer)',
              textTransform: 'uppercase',
            }}
          >
            Nothing sends until you confirm
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => !sending && onCancel()}
              disabled={sending}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                padding: '8px 18px',
                cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              style={{
                background: canConfirm ? 'var(--gold)' : 'var(--border)',
                color: canConfirm ? '#050505' : 'var(--text-dimmer)',
                border: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                fontWeight: 700,
                padding: '8px 22px',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                opacity: sending ? 0.5 : 1,
              }}
            >
              {sending ? 'Sending…' : confirmLabel[config.kind]}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * IG-styled post preview. Mirrors what the post will actually look like
 * on the feed: avatar header, location chip, full-aspect media, tag pills
 * overlayed on the image, caption below, first-comment bubble, scheduled
 * banner. Not pixel-perfect IG — just close enough that the user can
 * sanity-check the full post before confirming.
 */
function PostPreview({ config }: { config: GateConfig }) {
  const {
    media = [],
    text,
    platform = 'instagram',
    locationName,
    firstComment,
    scheduledFor,
    tags,
    mediaAspect = 'square',
    accountHandle,
    meta,
    collaborators,
    altText,
    shareToFeed,
  } = config
  const handle = accountHandle || '@nightmanoeuvres'
  const collabs = (collaborators || []).map(c => c.replace(/^@/, '')).filter(Boolean)
  const isReel = mediaAspect === 'story' || (meta || []).some(m => m.label === 'Format' && /reel|video/i.test(m.value))
  // Map aspect → paddingTop for the media box. Square 100%, portrait
  // 125% (4:5), story 177.78% (9:16).
  const aspectPT = mediaAspect === 'portrait' ? '125%' : mediaAspect === 'story' ? '177.78%' : '100%'
  // Non-content meta rows (Format, Variant, Voice aligned) still useful
  // to eyeball. Filter out the rows we're rendering natively so we don't
  // double-display.
  const hiddenLabels = new Set(['Tagged', 'Location', 'First comment', 'Hashtags', 'Scheduled for'])
  const extraMeta = (meta || []).filter(m => !hiddenLabels.has(m.label))

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--panel)' }}>
      {scheduledFor && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(255,42,26,0.08)',
            border: '1px solid var(--gold)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 11,
            letterSpacing: '0.2em',
            color: 'var(--gold)',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
          Queued for {scheduledFor} · nothing posts until this fires
        </div>
      )}

      <div style={{ fontSize: 9, letterSpacing: '0.3em', color: 'var(--text-dimmer)', fontWeight: 700, textTransform: 'uppercase' }}>
        ◉ Full preview — this is what goes online
      </div>

      {/* IG-styled post card */}
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          margin: '0 auto',
          background: '#0a0a0a',
          border: '1px solid #262626',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#f2f2f2',
        }}
      >
        {/* Post header — avatar, handle, location */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1a1a1a' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(45deg, #ff2a1a 0%, #ff5a47 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 800,
              color: '#050505',
              letterSpacing: '0.04em',
            }}
          >
            NM
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f2f2f2', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>{handle.replace(/^@/, '')}</span>
              {collabs.length > 0 && (
                <>
                  <span style={{ color: '#a8a8a8', fontWeight: 400 }}>with</span>
                  {collabs.map((c, i) => (
                    <span key={c} style={{ color: '#f2f2f2' }}>
                      {c}{i < collabs.length - 1 ? ',' : ''}
                    </span>
                  ))}
                </>
              )}
            </div>
            {locationName && (
              <div style={{ fontSize: 11, color: '#a8a8a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {locationName}
              </div>
            )}
          </div>
          <div style={{ fontSize: 18, color: '#a8a8a8', letterSpacing: 2 }}>⋯</div>
        </div>

        {/* Media — aspect-correct, tag pills overlayed on bottom-left.
            Carousel (media.length > 1): horizontal scroll-snap strip so the
            user can swipe through every slide in the preview, same as IG. */}
        <div style={{ position: 'relative', width: '100%', paddingTop: aspectPT, background: '#000' }}>
          {media.length > 1 ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                overflowX: 'auto',
                scrollSnapType: 'x mandatory',
              }}
            >
              {media.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`Slide ${i + 1}`}
                  style={{
                    flex: '0 0 100%',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    scrollSnapAlign: 'start',
                  }}
                />
              ))}
            </div>
          ) : media[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media[0]}
              alt="Preview"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#5a5a5a',
                fontSize: 12,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}
            >
              No media
            </div>
          )}
          {tags && tags.length > 0 && (
            <div style={{ position: 'absolute', left: 10, bottom: 10, display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 'calc(100% - 20px)' }}>
              {tags.map((t, i) => (
                <span
                  key={i}
                  style={{
                    padding: '4px 8px',
                    background: 'rgba(0,0,0,0.72)',
                    color: '#f2f2f2',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  @{t.replace(/^@/, '')}
                </span>
              ))}
            </div>
          )}
          {media.length > 1 && (
            <div
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                padding: '4px 10px',
                background: 'rgba(0,0,0,0.6)',
                color: '#f2f2f2',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 12,
              }}
            >
              1 / {media.length}
            </div>
          )}
        </div>

        {/* Reel-only: flag when it won't appear on the main grid */}
        {isReel && shareToFeed === false && (
          <div style={{ padding: '8px 14px', fontSize: 11, color: '#ffb020', background: '#1a1507', borderBottom: '1px solid #1a1a1a', letterSpacing: '0.04em' }}>
            ⚠ Reel will NOT appear on the main grid (share_to_feed is off)
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', gap: 14, padding: '10px 14px 4px', fontSize: 22, color: '#f2f2f2' }}>
          <span>♡</span>
          <span>◎</span>
          <span>↗</span>
          <span style={{ marginLeft: 'auto' }}>❏</span>
        </div>

        {/* Caption */}
        <div style={{ padding: '4px 14px 8px', fontSize: 13, lineHeight: 1.5, color: '#f2f2f2', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <span style={{ fontWeight: 700, marginRight: 6 }}>{handle.replace(/^@/, '')}</span>
          {text || <span style={{ color: '#5a5a5a' }}>(no caption)</span>}
        </div>

        {/* Alt text proofread — smaller annotation under caption */}
        {altText && (
          <div style={{ padding: '0 14px 10px', fontSize: 10, color: '#7a7a7a', letterSpacing: '0.08em' }}>
            <span style={{ color: '#a8a8a8', fontWeight: 700, marginRight: 6 }}>ALT TEXT:</span>
            {altText}
          </div>
        )}

        {/* First comment (IG convention: tags + hashtags live here) */}
        {firstComment && (
          <div style={{ padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: '#7a7a7a', letterSpacing: '0.08em' }}>
              Posts first comment as {handle.replace(/^@/, '')}:
            </div>
            <div
              style={{
                padding: '10px 12px',
                background: '#111',
                border: '1px solid #1a1a1a',
                fontSize: 13,
                lineHeight: 1.5,
                color: '#d8d8d8',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <span style={{ fontWeight: 700, marginRight: 6, color: '#f2f2f2' }}>{handle.replace(/^@/, '')}</span>
              {firstComment}
            </div>
          </div>
        )}
      </div>

      {/* Ops-level metadata (voice score, variant, format) — kept separate
          from the post card so the viewer knows it's not part of the post. */}
      {extraMeta.length > 0 && (
        <div
          style={{
            maxWidth: 520,
            width: '100%',
            margin: '0 auto',
            border: '1px dashed var(--border-dim)',
            padding: '10px 14px',
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 14px',
          }}
        >
          <div style={{ fontSize: 9, letterSpacing: '0.28em', color: 'var(--text-dimmer)', fontWeight: 700, textTransform: 'uppercase', gridColumn: '1 / -1' }}>
            ◉ Post metadata · {platform}
          </div>
          {extraMeta.map((m, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.24em', color: 'var(--text-dimmer)', textTransform: 'uppercase', fontWeight: 700 }}>{m.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
