'use client'

/**
 * LivePostPanel — live-updating metrics panel for the pinned NM post.
 *
 * Fetches /api/nm-plan/live-post on mount + every 60s. Shows a pulsing LIVE
 * dot while connected. Graceful fallback if the DB row hasn't been populated.
 */

import { useEffect, useState } from 'react'

type LivePost = {
  id: string
  permalink: string | null
  mediaType: string | null
  postedAt: string | null
  minutesSincePosted: number | null
  caption: string | null
  metrics: {
    reach: number
    views: number
    likes: number
    comments: number
    saves: number
    engagementRate: number
  }
  baseline: {
    avgReach: number
    vsBaselinePct: number
  }
  collab: {
    isThreeWay: boolean
    accounts: string[]
    slotsUsed: number
    slotsTotal: number
  }
  syncedAt: string | null
}

const C = {
  bg: '#050505',
  panel: '#0e0e0e',
  panelAlt: '#111',
  border: '#1d1d1d',
  accent: '#ff2a1a',
  text: '#f2f2f2',
  dim: '#8a8780',
  dimmer: '#52504c',
  good: '#4a7a3a',
}

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'K'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function fmtSince(mins: number | null): string {
  if (mins == null) return '—'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return `${h}h ${m}m ago`
  return `${Math.floor(h / 24)}d ${h % 24}h ago`
}

function Metric({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{ padding: '14px 16px', background: C.panelAlt, border: `1px solid ${C.border}`, borderLeft: highlight ? `2px solid ${C.accent}` : `2px solid ${C.border}` }}>
      <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: C.dim, marginBottom: '6px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '26px', color: highlight ? C.accent : C.text, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 300, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '10px', color: C.dim, marginTop: '6px' }}>{sub}</div>}
    </div>
  )
}

export default function LivePostPanel() {
  const [post, setPost] = useState<LivePost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const res = await fetch('/api/nm-plan/live-post', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!alive) return
        setPost(json.post)
        setError(null)
        setLoading(false)
        setPulse(true)
        setTimeout(() => alive && setPulse(false), 600)
      } catch (e: unknown) {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'fetch failed')
        setLoading(false)
      }
    }

    load()
    const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '20px', background: C.panel, border: `1px solid ${C.border}`, fontSize: '11px', color: C.dim, letterSpacing: '0.15em' }}>
        LOADING LIVE POST…
      </div>
    )
  }

  if (error || !post) {
    return (
      <div style={{ padding: '20px', background: C.panel, border: `1px solid ${C.border}`, fontSize: '11px', color: C.dim }}>
        No live post pinned. {error && <span style={{ color: C.accent }}>({error})</span>}
      </div>
    )
  }

  const vsBase = post.baseline.vsBaselinePct
  const above = vsBase >= 100

  return (
    <div style={{ padding: '24px', background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}` }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: C.accent,
            boxShadow: pulse ? `0 0 12px ${C.accent}` : 'none',
            transition: 'box-shadow 0.3s',
          }} />
          <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: C.accent }}>
            LIVE · TODAY'S POST
          </div>
        </div>
        <div style={{ fontSize: '10px', color: C.dim, letterSpacing: '0.1em' }}>
          POSTED {fmtSince(post.minutesSincePosted).toUpperCase()} · AUTO-REFRESH 60s
        </div>
      </div>

      {/* Title */}
      <div style={{ fontSize: '18px', color: C.text, marginTop: '12px', marginBottom: '6px', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 300, lineHeight: 1.3 }}>
        3-way sunny carousel · @nightmanoeuvres + @absoluteishere + @dotmajor
      </div>
      <div style={{ fontSize: '11px', color: C.dim, marginBottom: '18px' }}>
        Heavy-artillery collab slot <strong style={{ color: C.accent }}>{post.collab.slotsUsed}/{post.collab.slotsTotal}</strong> used · 2 remaining for the runway
      </div>

      {/* Metric grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        <Metric
          label="Reach"
          value={fmtNum(post.metrics.reach)}
          sub={`${vsBase}% of ${fmtNum(post.baseline.avgReach)} baseline`}
          highlight={above}
        />
        <Metric label="Views" value={fmtNum(post.metrics.views)} />
        <Metric label="Likes" value={fmtNum(post.metrics.likes)} />
        <Metric label="Comments" value={fmtNum(post.metrics.comments)} />
        <Metric label="Saves" value={fmtNum(post.metrics.saves)} />
        <Metric
          label="Engagement"
          value={`${post.metrics.engagementRate.toFixed(1)}%`}
          sub="interactions ÷ reach"
        />
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', paddingTop: '14px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: '10px', color: C.dimmer, letterSpacing: '0.1em' }}>
          LAST SYNC {post.syncedAt ? new Date(post.syncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'} · POLL EVERY 2H
        </div>
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', letterSpacing: '0.15em', color: C.accent, textDecoration: 'none', border: `1px solid ${C.accent}`, padding: '6px 10px' }}>
            OPEN ON IG →
          </a>
        )}
      </div>
    </div>
  )
}
