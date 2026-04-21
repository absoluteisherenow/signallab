'use client'

import { useEffect, useState } from 'react'
import { useGatedSend } from '@/lib/outbound'

const COLOR = {
  bg: '#050505',
  panel: '#0e0e0e',
  border: '#222',
  red: '#ff2a1a',
  text: '#f2f2f2',
  dim: '#d8d8d8',
  dimmer: '#b0b0b0',
  dimmest: '#909090',
  green: '#4ecb71',
}
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

interface GigLite {
  id: string
  title?: string
  venue?: string
  location?: string
  date?: string
  promoter_email?: string
  promoter_name?: string | null
}

interface AdvanceRecord {
  gig_id: string
  completed?: boolean
  status?: string
  subject?: string
  email_html?: string
  promoter_email?: string
  generated_at?: string
  sent_at?: string | null
}

type Phase = 'loading' | 'preview' | 'sending' | 'sent' | 'error' | 'readonly'

export default function MobileAdvanceSheet({
  gigId,
  onClose,
  onSent,
}: {
  gigId: string
  onClose: () => void
  onSent: () => void
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string>('')
  const [gig, setGig] = useState<GigLite | null>(null)
  const [existing, setExisting] = useState<AdvanceRecord | null>(null)
  const [subject, setSubject] = useState<string>('')
  const [html, setHtml] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const gatedSend = useGatedSend()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Fetch gig + any existing advance record in parallel
        const [gigRes, advRes] = await Promise.all([
          fetch(`/api/gigs/${gigId}`).then(r => r.json()),
          fetch(`/api/advance?gigId=${gigId}`).then(r => r.json()),
        ])
        if (cancelled) return
        const g: GigLite | null = gigRes?.gig || null
        setGig(g)
        const reqs: AdvanceRecord[] = advRes?.requests || []
        const existingRec = reqs.find(r => r.gig_id === gigId) || null

        if (existingRec && (existingRec.status === 'sent' || existingRec.completed || existingRec.email_html)) {
          setExisting(existingRec)
          setSubject(existingRec.subject || '')
          setHtml(existingRec.email_html || '')
          setTo(existingRec.promoter_email || g?.promoter_email || '')
          setPhase('readonly')
          return
        }

        if (!g) {
          setError('Gig not found.')
          setPhase('error')
          return
        }
        const promoterEmail = g.promoter_email || ''
        if (!promoterEmail) {
          setError('No promoter email on this gig. Add one before sending.')
          setPhase('error')
          return
        }
        setTo(promoterEmail)

        // Generate preview
        const prev = await fetch('/api/advance/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gigId,
            gigTitle: g.title || g.venue || 'Show',
            venue: g.venue || '',
            date: g.date || '',
            promoterEmail,
            promoterName: g.promoter_name || '',
            artistName: 'Night Manoeuvres',
            location: g.location || '',
          }),
        }).then(r => r.json())
        if (cancelled) return
        if (prev?.error) {
          setError(prev.error)
          setPhase('error')
          return
        }
        setSubject(prev.subject || '')
        setHtml(prev.html || '')
        setPhase('preview')
      } catch (err: any) {
        if (cancelled) return
        setError(err?.message || 'Failed to load preview.')
        setPhase('error')
      }
    })()
    return () => { cancelled = true }
  }, [gigId])

  async function handleSend() {
    if (!gig || !to || !subject || !html) return
    setPhase('sending')
    setError('')
    try {
      const result = await gatedSend<Record<string, unknown>, { success?: boolean; error?: string }>({
        endpoint: '/api/advance/send',
        previewBody: {
          gigId,
          gigTitle: gig.title || gig.venue || 'Show',
          venue: gig.venue || '',
          date: gig.date || '',
          promoterEmail: to,
          subject,
          html,
        },
        skipServerPreview: true,
        buildConfig: () => ({
          kind: 'email',
          summary: `Advance request — ${gig.title || gig.venue || 'Show'}`,
          to,
          subject,
          html,
          meta: [
            ...(gig.venue ? [{ label: 'Venue', value: gig.venue }] : []),
            ...(gig.date ? [{ label: 'Date', value: new Date(gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }] : []),
          ],
        }),
      })
      if (!result.confirmed) {
        // User cancelled the gate — return to preview
        setPhase('preview')
        if (result.error) setError(result.error)
        return
      }
      if (result.error || !result.data?.success) {
        setError(result.error || 'Send failed.')
        setPhase('error')
        return
      }
      setPhase('sent')
      setTimeout(() => {
        onSent()
      }, 700)
    } catch (err: any) {
      setError(err?.message || 'Network error.')
      setPhase('error')
    }
  }

  return (
    <SheetShell title="ADVANCE" gig={gig} onClose={onClose}>
      {phase === 'loading' && <LoadingBlock label="BUILDING PREVIEW" />}

      {(phase === 'preview' || phase === 'sending' || phase === 'sent' || phase === 'error' || phase === 'readonly') && (
        <>
          <MetaGrid
            rows={[
              { label: 'TO', value: to || '—' },
              { label: 'FROM', value: phase === 'readonly' ? 'Night Manoeuvres' : 'advance@signallabos.com' },
              { label: 'SUBJECT', value: subject || '—' },
              ...(phase === 'readonly' && existing?.sent_at
                ? [{ label: 'SENT', value: new Date(existing.sent_at).toLocaleString('en-GB') }]
                : []),
              ...(phase === 'readonly' && existing?.status
                ? [{ label: 'STATUS', value: existing.status.toUpperCase() }]
                : []),
            ]}
          />

          <div style={{ marginTop: 16, padding: 4, background: '#ffffff', border: `1px solid ${COLOR.border}` }}>
            {html ? (
              <iframe
                title="Advance preview"
                srcDoc={html}
                style={{ width: '100%', height: 480, border: 'none', background: '#fff' }}
                sandbox=""
              />
            ) : (
              <div style={{ padding: 20, color: '#050505', fontSize: 12 }}>No preview available.</div>
            )}
          </div>

          {phase === 'error' && error && <ErrorBar>{error}</ErrorBar>}

          {phase !== 'readonly' && (
            <BottomBar>
              <SendButton
                disabled={phase === 'sending' || phase === 'sent' || !to || !subject || !html}
                onClick={handleSend}
                label={
                  phase === 'sending' ? 'SENDING…'
                  : phase === 'sent' ? 'SENT'
                  : 'SEND'
                }
                tone={phase === 'sent' ? 'ok' : 'red'}
              />
            </BottomBar>
          )}
        </>
      )}

      {phase === 'error' && !html && (
        <>
          <ErrorBar>{error || 'Unable to build preview.'}</ErrorBar>
          <BottomBar>
            <SendButton disabled label="SEND" tone="red" onClick={() => {}} />
          </BottomBar>
        </>
      )}
    </SheetShell>
  )
}

// ── Shared sheet primitives ──

export function SheetShell({
  title, gig, onClose, children,
}: {
  title: string
  gig: { venue?: string; date?: string; title?: string } | null
  onClose: () => void
  children: React.ReactNode
}) {
  const gigLine = gig ? [gig.venue, gig.date ? fmtDate(gig.date) : null].filter(Boolean).join(' · ') : ''
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: COLOR.bg, color: COLOR.text,
        fontFamily: FONT,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px 14px',
        borderBottom: `1px solid ${COLOR.border}`,
        display: 'flex', alignItems: 'flex-start', gap: 12,
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'transparent', border: `1px solid ${COLOR.border}`,
            color: COLOR.text, padding: '6px 10px',
            fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
            textTransform: 'uppercase', cursor: 'pointer',
            fontFamily: FONT, WebkitTapHighlightColor: 'transparent',
            flexShrink: 0,
          }}
        >
          CLOSE
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 26, fontWeight: 800, letterSpacing: '-0.035em',
            textTransform: 'uppercase', lineHeight: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </div>
          {gigLine && (
            <div style={{
              marginTop: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
              color: COLOR.dimmer, textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {gigLine}
            </div>
          )}
        </div>
      </div>

      {/* Body (scrollable) */}
      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        padding: '16px 20px 120px',
      }}>
        {children}
      </div>
    </div>
  )
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div style={{
      padding: '40px 0',
      fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
      color: COLOR.dimmer, textTransform: 'uppercase',
      textAlign: 'center',
    }}>
      {label}
    </div>
  )
}

export function MetaGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'flex', gap: 12, padding: '10px 0',
          borderBottom: `1px solid ${COLOR.border}`,
          alignItems: 'baseline',
        }}>
          <div style={{
            width: 80, flexShrink: 0,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
            color: COLOR.dimmer, textTransform: 'uppercase',
          }}>
            {r.label}
          </div>
          <div style={{
            flex: 1, minWidth: 0,
            fontSize: 13, color: COLOR.text, wordBreak: 'break-word',
          }}>
            {r.value}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ErrorBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 14, padding: '10px 12px',
      background: '#2a0a0a', border: `1px solid ${COLOR.red}`,
      color: '#ff8a7a', fontSize: 12, lineHeight: 1.4,
    }}>
      {children}
    </div>
  )
}

export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
      background: COLOR.bg, borderTop: `1px solid ${COLOR.border}`,
      zIndex: 10001,
    }}>
      {children}
    </div>
  )
}

export function SendButton({
  label, disabled, onClick, tone,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  tone: 'red' | 'ok'
}) {
  const bg = disabled ? '#333' : (tone === 'ok' ? COLOR.green : COLOR.red)
  const color = disabled ? '#777' : '#050505'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', minHeight: 56,
        background: bg, color,
        border: 'none', fontFamily: FONT,
        fontSize: 12, fontWeight: 800, letterSpacing: '0.22em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  )
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()
  } catch { return iso }
}
