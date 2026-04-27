'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Per-gig SMS approval gate UI.
 * - Shows pending queued SMSes (full preview: recipient + body)
 * - Approve = flip flag + flush queue (auto-fires future SMSes for this gig)
 * - Skip a single pending row, or unapprove to re-gate future sends
 *
 * HARD RULE: nothing fires without explicit approval here.
 */

interface OutboxRow {
  id: string
  recipient_phone: string
  body: string
  template_kind: 'discount' | 'guestlist'
  status: string
  error?: string
  sent_at?: string
  created_at: string
}

interface State {
  approved_at: string | null
  pending: OutboxRow[]
  recent_sent: OutboxRow[]
  recent_failed: OutboxRow[]
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export function SmsApprovalGate({ gigId }: { gigId: string }) {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const headers = await authHeaders()
    const res = await fetch(`/api/gigs/${gigId}/sms-approval`, { headers })
    if (res.ok) setState(await res.json())
  }

  useEffect(() => { load() }, [gigId])

  async function approve() {
    if (!confirm('Approve all pending SMSes and enable auto-send for this gig? Future RSVPs will receive their SMS immediately.')) return
    setBusy(true); setMsg('')
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
    const res = await fetch(`/api/gigs/${gigId}/sms-approval`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'approve' }),
    })
    const data = await res.json()
    if (res.ok) setMsg(`Approved. Sent ${data.sent || 0}, failed ${data.failed || 0}.`)
    else setMsg(data.error || 'Failed')
    await load()
    setBusy(false)
  }

  async function unapprove() {
    if (!confirm('Disable auto-send for this gig? Future SMSes will be queued for review again.')) return
    setBusy(true)
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
    await fetch(`/api/gigs/${gigId}/sms-approval`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'unapprove' }),
    })
    await load()
    setBusy(false)
  }

  async function skip(id: string) {
    if (!confirm('Skip this SMS without sending?')) return
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
    await fetch(`/api/gigs/${gigId}/sms-approval`, {
      method: 'DELETE', headers, body: JSON.stringify({ id }),
    })
    await load()
  }

  if (!state) return null

  const isApproved = !!state.approved_at
  const hasPending = state.pending.length > 0

  return (
    <div style={{ marginTop: '16px', border: '1px solid var(--border-dim)', padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
          SMS approval {isApproved ? '· auto-send on' : '· gated'}
        </div>
        {isApproved ? (
          <button onClick={unapprove} disabled={busy}
            style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
            Re-gate
          </button>
        ) : null}
      </div>

      {!isApproved && (
        <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '10px', lineHeight: 1.5 }}>
          SMSes for this gig are queued until you approve. Once approved, future RSVPs auto-send.
        </div>
      )}

      {hasPending && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            {state.pending.length} pending
          </div>
          <div style={{ border: '1px solid var(--border-dim)' }}>
            {state.pending.map((row, i) => (
              <div key={row.id} style={{ padding: '10px 12px', borderBottom: i < state.pending.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '4px' }}>
                      {row.template_kind} · {row.recipient_phone}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.4 }}>
                      {row.body}
                    </div>
                  </div>
                  <button onClick={() => skip(row.id)}
                    style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}>
                    Skip
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isApproved && (
        <button onClick={approve} disabled={busy}
          style={{ background: 'none', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 16px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
          {hasPending ? `Approve & send ${state.pending.length}` : 'Approve auto-send'}
        </button>
      )}

      {state.recent_failed.length > 0 && (
        <div style={{ marginTop: '10px', fontSize: '10px', color: '#ff6b6b' }}>
          {state.recent_failed.length} recent failure{state.recent_failed.length !== 1 ? 's' : ''}
        </div>
      )}

      {msg && <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-dim)' }}>{msg}</div>}
    </div>
  )
}
