'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'

type Drop = {
  id: string
  track_title: string | null
  track_artist: string | null
  track_label: string | null
  created_at: string
  contact_count: number
  totalClicks: number
  uniqueOpens: number
  reactionCount: number
  trackCount?: number
  totalPlays?: number
}

export default function SignalDropIndex() {
  const [drops, setDrops] = useState<Drop[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/promo-stats')
      .then(r => r.json())
      .then(async d => {
        const base: Drop[] = d.blasts || []
        // Enrich with track/play counts client-side
        const enriched = await Promise.all(base.map(async b => {
          try {
            const res = await fetch(`/api/promo/drop-summary?blast_id=${b.id}`)
            if (!res.ok) return b
            const j = await res.json()
            return { ...b, trackCount: j.trackCount, totalPlays: j.totalPlays }
          } catch {
            return b
          }
        }))
        setDrops(enriched)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <main style={page}>
      <PageHeader
        section="SIGNAL DROP"
        title="Private streams"
        subtitle="Unreleased music, promoters-only. Track who listened, how long, and what they said."
        right={<a href="/signal-drop/new" style={cta}>+ NEW DROP</a>}
      />
      <div style={container}>
        {loading ? (
          <div style={empty}>LOADING…</div>
        ) : drops.length === 0 ? (
          <div style={empty}>
            NO DROPS YET
            <a href="/signal-drop/new" style={{ ...cta, marginTop: 20, display: 'inline-block' }}>+ CREATE YOUR FIRST</a>
          </div>
        ) : (
          <div style={grid}>
            {drops.map(d => {
              const date = new Date(d.created_at)
              const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
              return (
                <a key={d.id} href={`/signal-drop/${d.id}`} style={card}>
                  <div style={cardHead}>
                    <span style={cardDate}>{dateStr.toUpperCase()}</span>
                    <span style={cardTracks}>{d.trackCount ?? '—'} TRK</span>
                  </div>
                  <div style={cardTitle}>{d.track_title || 'Untitled drop'}</div>
                  <div style={cardMeta}>
                    {d.track_artist || 'Night Manoeuvres'}
                    {d.track_label && <> · {d.track_label}</>}
                  </div>
                  <div style={cardStats}>
                    <div style={stat}>
                      <div style={statN}>{d.uniqueOpens}/{d.contact_count}</div>
                      <div style={statL}>OPENED</div>
                    </div>
                    <div style={stat}>
                      <div style={statN}>{d.totalPlays ?? 0}</div>
                      <div style={statL}>PLAYS</div>
                    </div>
                    <div style={stat}>
                      <div style={statN}>{d.reactionCount}</div>
                      <div style={statL}>REACTED</div>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--text)',
}

const container: React.CSSProperties = {
  padding: '32px 48px 64px',
  display: 'flex',
  flexDirection: 'column',
  gap: 32,
}

const cta: React.CSSProperties = {
  padding: '14px 20px',
  background: '#ff2a1a',
  color: '#000',
  fontSize: 11,
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  letterSpacing: '0.12em',
  fontWeight: 700,
  textDecoration: 'none',
  cursor: 'pointer',
}

const empty: React.CSSProperties = {
  padding: '80px 20px',
  textAlign: 'center',
  color: '#7a7a7a',
  fontSize: 12,
  letterSpacing: '0.12em',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  background: '#0e0e0e',
  border: '1px solid #1d1d1d',
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 14,
}

const card: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '20px 22px',
  background: '#0e0e0e',
  border: '1px solid #1d1d1d',
  textDecoration: 'none',
  color: '#f2f2f2',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  cursor: 'pointer',
  transition: 'border-color 150ms',
}

const cardHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 10,
  letterSpacing: '0.1em',
  color: '#7a7a7a',
}

const cardDate: React.CSSProperties = {}

const cardTracks: React.CSSProperties = {
  color: '#ff2a1a',
}

const cardTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: 28,
  letterSpacing: '-0.03em',
  textTransform: 'uppercase',
  color: 'var(--text)',
  lineHeight: 0.95,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
}

const cardMeta: React.CSSProperties = {
  fontSize: 11,
  color: '#a0a0a0',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

const cardStats: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  marginTop: 8,
  paddingTop: 12,
  borderTop: '1px solid #1d1d1d',
}

const stat: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const statN: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: '-0.02em',
  textTransform: 'uppercase',
  color: 'var(--text)',
  lineHeight: 1,
}

const statL: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: '#7a7a7a',
  fontFamily: 'var(--font-mono)',
  marginTop: 4,
}
