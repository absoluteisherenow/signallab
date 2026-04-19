'use client'

import { useParams } from 'next/navigation'
import { ideas } from '@/lib/nm-plan-data'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'

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

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.dim, width: 110, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)' }}>
        <div style={{ width: `${value * 20}%`, height: '100%', background: scoreColor(value) }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(value), width: 16, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function IdeaPage() {
  const { slug } = useParams<{ slug: string }>()
  const idea = ideas.find(i => i.slug === slug)

  if (!idea) {
    return (
      <div style={{ minHeight: '100vh', background: s.bg, color: '#f2f2f2', fontFamily: s.font }}>
        <SignalLabHeader />
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: s.dimmest }}>Idea not found</div>
          <a href="/broadcast/ideas" style={{ fontSize: 11, color: s.gold, textDecoration: 'none', marginTop: 12, display: 'inline-block' }}>Back to all ideas</a>
        </div>
      </div>
    )
  }

  const avg = Math.round(((idea.brand5.reach + idea.brand5.authenticity + idea.brand5.culture + idea.brand5.visualIdentity + idea.brand5.shareableCore) / 5) * 20)

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: '#f2f2f2', fontFamily: s.font }}>
      <SignalLabHeader />
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px 120px' }}>

        {/* Back link */}
        <a href="/broadcast/ideas" style={{ fontSize: 12, color: s.dimmest, textDecoration: 'none', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-block', marginBottom: 24 }}>
          All ideas
        </a>

        {/* Title */}
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>{idea.title}</h1>
        <p style={{ fontSize: 14, color: s.dim, lineHeight: 1.6, marginBottom: 24 }}>{idea.kicker}</p>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, padding: '4px 10px', border: `1px solid ${s.gold}`, color: s.gold, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{idea.format}</span>
          <span style={{ fontSize: 12, padding: '4px 10px', border: `1px solid ${s.border}`, color: s.dim }}>{idea.length}</span>
          {idea.targetDate && <span style={{ fontSize: 12, padding: '4px 10px', border: `1px solid ${s.border}`, color: s.dim }}>{idea.targetDate}</span>}
          <span style={{ fontSize: 12, padding: '4px 10px', border: `1px solid ${s.border}`, color: s.dim }}>{idea.origin}</span>
        </div>

        {/* Scores */}
        <div style={{ padding: '20px 24px', background: s.panel, border: `1px solid ${s.border}`, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: s.dimmest }}>Content Score</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: scoreColor(Math.round(avg / 20)) }}>{avg}</span>
          </div>
          <ScoreBar label="Reach" value={idea.brand5.reach} />
          <ScoreBar label="Authenticity" value={idea.brand5.authenticity} />
          <ScoreBar label="Culture" value={idea.brand5.culture} />
          <ScoreBar label="Visual ID" value={idea.brand5.visualIdentity} />
          <ScoreBar label="Shareable" value={idea.brand5.shareableCore} />
        </div>

        {/* Why this works */}
        <Section title="Why this works">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {idea.why.map((point, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.6, color: s.dim }}>
                <span style={{ color: s.gold, flexShrink: 0, marginTop: 2 }}>+</span>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Shot list */}
        {idea.shotList && idea.shotList.length > 0 && (
          <Section title="Shot list">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {idea.shotList.map((shot, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.6, color: s.dim, padding: '10px 14px', background: '#1d1d1d', border: `1px solid ${s.border}` }}>
                  <span style={{ color: s.gold, flexShrink: 0, fontSize: 12, marginTop: 2 }}>{i + 1}.</span>
                  <span>{shot}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Slides */}
        {idea.slides && idea.slides.length > 0 && (
          <Section title="Slides">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {idea.slides.map((slide, i) => (
                <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: s.dim, padding: '10px 14px', background: '#1d1d1d', border: `1px solid ${s.border}` }}>{slide}</div>
              ))}
            </div>
          </Section>
        )}

        {/* Caption */}
        <Section title="Caption">
          <div style={{ fontSize: 14, lineHeight: 1.7, padding: '16px 20px', background: '#1d1d1d', border: `1px solid ${s.border}`, whiteSpace: 'pre-wrap' }}>{idea.caption}</div>
        </Section>

        {/* Text overlay */}
        {idea.textOverlay && (
          <Section title="Text overlay">
            <div style={{ fontSize: 13, color: s.dim, padding: '14px 18px', background: '#1d1d1d', border: `1px solid ${s.border}`, whiteSpace: 'pre-wrap' }}>{idea.textOverlay}</div>
          </Section>
        )}

        {/* Tags */}
        {idea.tags.length > 0 && (
          <Section title="Tags">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {idea.tags.map((tag, i) => (
                <span key={i} style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,42,26,0.08)', color: s.gold, letterSpacing: '0.06em' }}>{tag}</span>
              ))}
            </div>
          </Section>
        )}

        {/* Music bed */}
        {idea.musicBed && (
          <Section title="Music bed">
            <div style={{ fontSize: 12, color: s.dim }}>{idea.musicBed}</div>
          </Section>
        )}

        {/* Kill criteria */}
        {idea.killCriteria && (
          <Section title="Kill criteria">
            <div style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.6, color: '#ff6b6b', padding: '12px 16px', background: 'rgba(255,50,50,0.06)', border: '1px solid rgba(255,50,50,0.15)' }}>
              <span style={{ flexShrink: 0 }}>!</span>
              <span>{idea.killCriteria}</span>
            </div>
          </Section>
        )}

        {/* Risk notes */}
        {idea.riskNotes && (
          <Section title="Risk notes">
            <div style={{ fontSize: 12, color: s.dim, lineHeight: 1.6 }}>{idea.riskNotes}</div>
          </Section>
        )}

        {/* Drop media → Chain CTA. Chain reads ?idea= and pins the idea as
            caption-gen context. Old /post route is dead. */}
        <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
          <a href={`/broadcast?idea=${encodeURIComponent(idea.slug)}`}
            style={{ padding: '14px 28px', background: s.gold, color: s.bg, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, textDecoration: 'none', fontFamily: s.font }}>
            Drop media →
          </a>
          <a href="/broadcast/ideas" style={{ padding: '14px 20px', border: `1px solid ${s.border}`, color: s.dim, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: s.font }}>
            Back to all
          </a>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#ff2a1a', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
