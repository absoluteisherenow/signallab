'use client'

import { useState } from 'react'

interface Props {
  invoiceId: string
  token: string
  artistName: string
  invoiceNumber: string
  to: string
  cc: string
  subject: string
  amount: string
  dueDate: string
  type: string
  venue: string
  from: string
  greeting: string
  signoff: string
}

export default function ApproveClient(props: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string>('')
  const [result, setResult] = useState<{ to?: string; cc?: string; sentFrom?: string } | null>(null)

  async function onSend() {
    setState('sending')
    setError('')
    try {
      const res = await fetch(`/api/invoices/${props.invoiceId}/approve?t=${encodeURIComponent(props.token)}`, { method: 'POST' })
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
        <Heading>Invoice sent</Heading>
        <Row label="From" value={result?.sentFrom || props.from} />
        <Row label="To" value={result?.to || props.to} />
        {(result?.cc || props.cc) && <Row label="Cc" value={result?.cc || props.cc} />}
        <Row label="Subject" value={props.subject} />
        <Row label="Amount" value={props.amount} />
        <div style={{ marginTop: 24, color: '#909090', fontSize: 13 }}>You'll get a confirmation in the app. Close this tab — nothing else to do.</div>
      </Shell>
    )
  }

  return (
    <Shell>
      <Heading>Review &amp; send</Heading>
      <div style={{ color: '#909090', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
        This is the exact email your recipient will see. Tap <em>Send now</em> when it looks right.
      </div>
      <Row label="From" value={props.from} highlight />
      <Row label="To" value={props.to || '— no recipient on file —'} />
      {props.cc && <Row label="Cc" value={props.cc} />}
      <Row label="Subject" value={props.subject} />
      <Row label="Amount" value={props.amount} highlight />
      <Row label="Due" value={props.dueDate} />
      <Row label="Type" value={labelForType(props.type)} />
      {props.venue && <Row label="Venue" value={props.venue} />}
      <Row label="Ref" value={props.invoiceNumber} />
      <Row label="Attach" value={`${props.invoiceNumber}.pdf`} />

      <div style={{ marginTop: 28, border: '1px solid #222', background: '#0a0a0a' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1a1a1a', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#6a6a6a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Invoice PDF (attachment)</span>
          <a href={`/api/invoices/${props.invoiceId}/pdf`} target="_blank" rel="noopener" style={{ color: '#ff2a1a', textDecoration: 'none', letterSpacing: '0.2em' }}>Open ↗</a>
        </div>
        <div style={{ position: 'relative' }}>
          <iframe
            src={`/api/invoices/${props.invoiceId}/pdf#toolbar=0&navpanes=0&view=FitH`}
            style={{ width: '100%', height: 560, border: 'none', background: '#050505', display: 'block', pointerEvents: 'none' }}
            title="Invoice PDF preview"
            scrolling="no"
          />
          <a
            href={`/api/invoices/${props.invoiceId}/pdf`}
            target="_blank"
            rel="noopener"
            aria-label="Open invoice PDF in a new tab"
            style={{ position: 'absolute', inset: 0, display: 'block' }}
          />
        </div>
      </div>

      <div style={{ marginTop: 24, padding: 20, background: '#0a0a0a', border: '1px solid #222', fontSize: 13, color: '#c0c0c0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#6a6a6a', marginBottom: 12 }}>Email copy (exact)</div>
        {`${props.greeting}

${bodyPreview(props)}

${props.amount} · due ${props.dueDate}
Ref: ${props.invoiceNumber}

Let me know if you have any questions.

${props.signoff}`}
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

function labelForType(t: string): string {
  if (t === 'deposit') return 'Deposit'
  if (t === 'balance') return 'Balance'
  return 'Full fee'
}

function bodyPreview(props: Props): string {
  if (props.type === 'deposit') return `Great to have the${props.venue ? ` ${props.venue}` : ''} booking locked in. Deposit invoice below.`
  return `Thanks again for having us${props.venue ? ` at ${props.venue}` : ''}. Invoice for the night is attached below.`
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: '#f2f2f2', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", padding: '40px 24px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ color: '#ff2a1a', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 20 }}>Signal Lab OS · invoice approval</div>
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
