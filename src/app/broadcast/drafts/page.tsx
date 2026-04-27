'use client'

// /broadcast/drafts — focused review surface for caption drafts.
//
// The /today anticipation banner used to deep-link to /broadcast/calendar
// with ?status=draft, but the calendar ignored the param and only renders
// posts on the date they're scheduled for. Drafts queued for next week
// were effectively invisible from the dashboard.
//
// This page is the simplest viable answer: a flat list of every draft
// across every date, grouped/sortable by scheduled date, with one-click
// approve and a link into the calendar for full edit.

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Draft {
  id: string
  caption: string | null
  platform: string
  scheduled_at: string | null
  media_url: string | null
  media_urls: string[] | null
  status: string
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Unscheduled'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unscheduled'
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000))
  const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (days === 0) return `TODAY · ${time}`
  if (days === 1) return `TOMORROW · ${time}`
  if (days > 1 && days <= 7) return `IN ${days} DAYS · ${dateLabel} · ${time}`
  return `${dateLabel} · ${time}`
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<Record<string, boolean>>({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/schedule?status=draft', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      const rows: Draft[] = (j.posts || j.scheduled_posts || j || []).filter((p: any) => p.status === 'draft')
      // Sort by scheduled_at ascending; nulls last
      rows.sort((a, b) => {
        if (!a.scheduled_at && !b.scheduled_at) return 0
        if (!a.scheduled_at) return 1
        if (!b.scheduled_at) return -1
        return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      })
      setDrafts(rows)
    } catch {
      setDrafts([])
    } finally {
      setLoading(false)
    }
  }

  async function approve(id: string) {
    setWorking(w => ({ ...w, [id]: true }))
    try {
      await fetch('/api/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'approved', approved_at: new Date().toISOString() }),
      })
      setDrafts(prev => prev.filter(d => d.id !== id))
    } finally {
      setWorking(w => { const n = { ...w }; delete n[id]; return n })
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'block', width: 28, height: 1, background: 'var(--gold)' }} />
          Broadcast Lab · Drafts
        </div>
        <h1 style={{ fontFamily: 'var(--font-display, var(--font-mono))', fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.92, textTransform: 'uppercase', margin: '0 0 8px' }}>
          {loading ? 'Loading…' : drafts.length === 0 ? 'No drafts.' : `${drafts.length} draft${drafts.length === 1 ? '' : 's'}`}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-dimmer)', margin: '0 0 32px' }}>
          {drafts.length === 0
            ? 'When the planner queues new captions they\'ll appear here for review.'
            : 'Approve to hand off to the publish cron, or open in calendar to edit first.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {drafts.map(d => {
            const thumb = d.media_urls?.[0] || d.media_url || null
            const busy = !!working[d.id]
            return (
              <div key={d.id} style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto auto',
                gap: 16,
                alignItems: 'center',
                padding: 14,
                border: '1px solid var(--border-dim)',
                background: 'var(--panel)',
              }}>
                {thumb ? (
                  <img src={thumb} alt="" style={{ width: 56, height: 56, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: 56, height: 56, background: '#161616', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', color: 'var(--text-dimmest)' }}>
                    {d.platform.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-dimmer)', fontWeight: 700, marginBottom: 4 }}>
                    {formatWhen(d.scheduled_at)} · {d.platform.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {d.caption || <span style={{ color: 'var(--text-dimmest)' }}>No caption</span>}
                  </div>
                </div>
                <Link
                  href={d.scheduled_at ? `/broadcast/calendar?date=${d.scheduled_at.slice(0, 10)}` : '/broadcast/calendar'}
                  style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none', border: '1px solid var(--border-dim)', padding: '8px 14px', whiteSpace: 'nowrap' }}
                >
                  Edit →
                </Link>
                <button
                  onClick={() => approve(d.id)}
                  disabled={busy}
                  style={{
                    fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
                    color: '#050505', background: 'var(--gold)', border: 'none', padding: '8px 16px',
                    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, fontWeight: 800, whiteSpace: 'nowrap',
                  }}
                >
                  {busy ? '…' : 'Approve'}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 32, fontSize: 11, color: 'var(--text-dimmest)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          <Link href="/broadcast/calendar" style={{ color: 'var(--text-dimmer)', textDecoration: 'none' }}>
            ← Back to calendar
          </Link>
        </div>
      </div>
    </div>
  )
}
