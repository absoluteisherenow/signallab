'use client'

import { ideas } from '@/lib/nm-plan-data'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'
import { PlanSubNav } from '@/components/broadcast/PlanSubNav'

const s = {
  gold: '#ff2a1a',
  dim: '#c0bdb5',
  dimmest: '#8a8782',
  panel: '#0e0e0e',
  border: 'rgba(255,255,255,0.08)',
  bg: '#050505',
  font: "var(--font-mono, 'Helvetica Neue', monospace)",
}

function scoreColor(n: number) {
  return n >= 5 ? '#44cc66' : n >= 4 ? s.gold : n >= 3 ? '#9a6a5a' : '#5a5852'
}

export default function IdeasPage() {
  const avg = (idea: typeof ideas[0]) => {
    const b = idea.brand5
    return Math.round(((b.reach + b.authenticity + b.culture + b.visualIdentity + b.shareableCore) / 5) * 20)
  }

  const sorted = [...ideas].sort((a, b) => avg(b) - avg(a))

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: '#f2f2f2', fontFamily: s.font }}>
      <SignalLabHeader />
      <PlanSubNav />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 120px' }}>
        <div style={{ fontSize: 11, color: s.dimmest, letterSpacing: '0.1em', marginBottom: 24 }}>
          {ideas.length} content briefs with scores, shot lists, and captions
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(idea => (
            <div
              key={idea.slug}
              style={{ display: 'flex', alignItems: 'stretch', background: s.panel, border: `1px solid ${s.border}`, transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = s.gold)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            >
              <a
                href={`/broadcast/ideas/${idea.slug}`}
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', textDecoration: 'none', color: '#f2f2f2' }}
              >
                <span style={{ fontSize: 24, fontWeight: 700, color: scoreColor(Math.round(avg(idea) / 20)), lineHeight: 1, minWidth: 36 }}>{avg(idea)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.title}</div>
                  <div style={{ fontSize: 11, color: s.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.kicker}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, padding: '3px 8px', border: `1px solid ${s.border}`, color: s.dim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{idea.format}</span>
                  {idea.targetDate && <span style={{ fontSize: 12, padding: '3px 8px', border: `1px solid ${s.border}`, color: s.dimmest, letterSpacing: '0.06em' }}>{idea.targetDate.split(',')[0]}</span>}
                </div>
              </a>
              {/* Drop-to-chain shortcut — skips the brief detail view. */}
              <a
                href={`/broadcast?idea=${encodeURIComponent(idea.slug)}`}
                onClick={e => e.stopPropagation()}
                title="Drop media into chain with this idea pinned"
                style={{ display: 'flex', alignItems: 'center', padding: '0 18px', borderLeft: `1px solid ${s.border}`, color: s.gold, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, textDecoration: 'none', fontFamily: s.font, flexShrink: 0 }}
              >
                Drop →
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
