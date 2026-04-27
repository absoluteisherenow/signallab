'use client'

import { useState } from 'react'

interface Props {
  gigId: string
  token: string
  riderType: string
  gigTitle: string
  venue: string
  date: string
  to: string
  subject: string
  formUrl: string
}

export default function ApproveClient(props: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string>('')
  const [result, setResult] = useState<{ to?: string; cc?: string; sentFrom?: string } | null>(null)

  async function onSend() {
    setState('sending')
    setError('')
    try {
      const res = await fetch(`/api/advance/${props.gigId}/approve?t=${encodeURIComponent(props.token)}&rt=${encodeURIComponent(props.riderType)}`, { method: 'POST' })
      const body = await res.json() as { error?: string; message?: string; to?: string; cc?: string; sentFrom?: string; sent?: boolean }
      if (!res.ok || !body.sent) {
        setError(body.message || body.error || 'Send failed — try again or send from the dashboard.')
        setState('error')
        return
      }
      setResult({ to: body.to, cc: body.cc, sentFrom: body.sentFrom })
      setState('sent')
    } catch (err: any) {
      setError(err?.message || 'Network error')
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <Shell>
        <Heading>Advance sent</Heading>
        <Row label="From" value={result?.sentFrom || '—'} />
        <Row label="To" value={result?.to || props.to} />
        {result?.cc && <Row label="Cc" value={result.cc} />}
        <Row label="Subject" value={props.subject} />
        <div style={{ marginTop: 24, color: '#909090', fontSize: 13 }}>
          Promoter will fill in the form, you'll get an "advance received" notification when they're done. Close this tab.
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <Heading>Review &amp; send</Heading>
      <div style={{ color: '#909090', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
        This is the advance request the promoter will receive. Tap <em>Send now</em> when it looks right.
      </div>
      <Row label="To" value={props.to || '— no recipient on file —'} />
      <Row label="Subject" value={props.subject} />
      <Row label="Show" value={`${props.gigTitle} · ${props.venue}`} />
      {props.date && <Row label="Date" value={props.date} />}
      <Row label="Rider" value={props.riderType} highlight />

      <a
        href={props.formUrl}
        target="_blank"
        rel="noopener"
        style={{ display: 'block', marginTop: 28, padding: '24px 20px', border: '1px solid #222', background: '#0a0a0a', textDecoration: 'none', color: 'inherit' }}
      >
        <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#6a6a6a', marginBottom: 10 }}>Form the promoter will fill</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 16, color: '#f2f2f2', fontWeight: 500, marginBottom: 4 }}>Advance form</div>
            <div style={{ fontSize: 12, color: '#909090', wordBreak: 'break-all' }}>{props.formUrl}</div>
          </div>
          <div style={{ color: '#ff2a1a', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Open ↗</div>
        </div>
      </a>

      <div style={{ marginTop: 24, padding: 20, background: '#0a0a0a', border: '1px solid #222', fontSize: 13, color: '#c0c0c0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#6a6a6a', marginBottom: 12 }}>Email body (preview)</div>
        {`NIGHT MANOEUVRES — ADVANCE REQUEST

${props.gigTitle}
${props.venue}${props.date ? ` · ${props.date}` : ''}

Please complete the advance form for this show.

[ Complete advance form → ${props.formUrl} ]`}
      </div>

      {state === 'error' && (
        <div style={{ marginTop: 16, padding: 12, background: '#2a0a0a', border: '1px solid #ff2a1a', fontSize: 12, color: '#ff8a7a' }}>{error}</div>
      )}
      <button
        onClick={onSend}
        disabled={state === 'sending' || !props.to}
        style={{
          marginTop: 28, width: '100%', padding: '18px 24px',
          background: state === 'sending' ? '#333' : '#ff2a1a',
          color: '#050505', border: 'none', fontFamily: 'inherit',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
          cursor: state === 'sending' || !props.to ? 'not-allowed' : 'pointer',
        }}
      >
        {state === 'sending' ? 'Sending…' : 'Send now'}
      </button>
      <div style={{ marginTop: 16, fontSize: 11, color: '#6a6a6a', textAlign: 'center' }}>
        Link expires 48h after the SMS was sent. Nothing sends until you tap above.
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: '#f2f2f2', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", padding: '40px 24px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ color: '#ff2a1a', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 20 }}>Signal Lab OS · advance approval</div>
        {children}
      </div>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 20, letterSpacing: '-0.01em' }}>{children}</div>
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid #1a1a1a', alignItems: 'baseline' }}>
      <span style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6a6a6a', minWidth: 60 }}>{label}</span>
      <span style={{ fontSize: highlight ? 16 : 14, color: highlight ? '#f2f2f2' : '#c0c0c0', fontWeight: highlight ? 500 : 400, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}
