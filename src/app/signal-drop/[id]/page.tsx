'use client'

import { useEffect, useState, use } from 'react'
import { WaveformDisplay } from '@/components/setlab/WaveformDisplay'
import { PageHeader } from '@/components/ui/PageHeader'

type TrackStat = {
  id: string
  title: string
  artist: string | null
  duration_sec: number | null
  waveform_peaks: number[] | null
  plays: number
  uniqueListeners: number
  avgPct: number
  completionRate: number
  furthestPoints: number[]
}

type Summary = {
  blast_id: string
  trackCount: number
  totalPlays: number
  perTrack: TrackStat[]
}

type BlastStats = {
  blast: {
    id: string
    track_title: string | null
    track_artist: string | null
    track_label: string | null
    message: string | null
    created_at: string
    contact_count: number
  }
  links: Array<{ code: string; clicks: number; contact: { name: string; handle: string | null } | null; first_clicked_at: string | null }>
  reactions: Array<{ reaction: string; contact: { name: string; handle: string | null } | null; notes: string | null }>
  summary: { totalClicks: number; uniqueOpens: number; openRate: number; reactions: Record<string, number> }
}

export default function DropDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [stats, setStats] = useState<BlastStats | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/promo/drop-summary?blast_id=${id}`).then(r => r.json()),
      fetch(`/api/promo-stats?blast_id=${id}`).then(r => r.json()),
    ]).then(([s, st]) => {
      setSummary(s)
      setStats(st)
    })
  }, [id])

  if (!summary || !stats) {
    return (
      <main style={page}>
        <div style={container}>
          <div style={{ padding: 40, color: '#7a7a7a', fontSize: 12, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>LOADING…</div>
        </div>
      </main>
    )
  }

  const b = stats.blast
  const metaLine = [
    b.track_artist || 'NIGHT manoeuvres',
    b.track_label,
    new Date(b.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }),
  ].filter(Boolean).join(' · ')
  return (
    <main style={page}>
      <PageHeader
        breadcrumb={[{ label: 'SIGNAL DROP', href: '/signal-drop' }, { label: b.track_title || 'UNTITLED' }]}
        section="PRIVATE STREAM"
        title={b.track_title || 'Untitled drop'}
        subtitle={metaLine}
      />
      <div style={container}>
        {/* Top stats */}
        <div style={statsRow}>
          <StatCell label="RECIPIENTS" value={String(b.contact_count)} />
          <StatCell label="OPENED" value={`${stats.summary.uniqueOpens}/${b.contact_count}`} sub={`${stats.summary.openRate}%`} />
          <StatCell label="CLICKS" value={String(stats.summary.totalClicks)} />
          <StatCell label="TRACKS" value={String(summary.trackCount)} />
          <StatCell label="TOTAL PLAYS" value={String(summary.totalPlays)} accent />
          <StatCell label="REACTED" value={String(stats.reactions.length)} />
        </div>

        {/* Per-track breakdown */}
        <section>
          <div style={sectionLabel}>TRACKS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {summary.perTrack.map((t, idx) => (
              <div key={t.id} style={trackCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, color: 'var(--gold)', width: 36, letterSpacing: '-0.02em' }}>{String(idx + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: 'var(--text)' }}>{t.title}</div>
                    {t.artist && <div style={{ fontSize: 11, color: '#7a7a7a', marginTop: 4, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t.artist}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 18 }}>
                    <MiniStat label="PLAYS" value={String(t.plays)} />
                    <MiniStat label="LISTENERS" value={String(t.uniqueListeners)} />
                    <MiniStat label="AVG LISTEN" value={`${t.avgPct}%`} accent />
                    <MiniStat label="COMPLETED" value={`${t.completionRate}%`} />
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <WaveformDisplay
                    peaks={t.waveform_peaks}
                    progress={t.duration_sec ? (t.avgPct / 100) : 0}
                    height={48}
                    color="rgba(255,42,26,0.15)"
                    progressColor="rgba(255,42,26,0.5)"
                  />
                  {/* Drop-off markers */}
                  {t.duration_sec && t.furthestPoints.length > 0 && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                      {t.furthestPoints.map((pt, i) => {
                        const left = (pt / Number(t.duration_sec)) * 100
                        return <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: 1, background: 'rgba(255,255,255,0.25)' }} />
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recipients */}
        <section>
          <div style={sectionLabel}>RECIPIENTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stats.links.map(l => {
              const reaction = stats.reactions.find(r => r.contact?.name === l.contact?.name)
              return (
                <div key={l.code} style={recipRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em', textTransform: 'uppercase', color: 'var(--text)' }}>{l.contact?.name || 'Unknown'}</div>
                    {l.contact?.handle && <div style={{ fontSize: 10, color: '#7a7a7a', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginTop: 2 }}>@{l.contact.handle}</div>}
                  </div>
                  <div style={{ fontSize: 10, color: l.clicks > 0 ? 'var(--gold)' : '#555', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {l.clicks > 0 ? `OPENED ${l.clicks}×` : 'NOT OPENED'}
                  </div>
                  {reaction && (
                    <div style={{ fontSize: 10, color: '#ff2a1a', letterSpacing: '0.2em', textTransform: 'uppercase', minWidth: 100, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {reaction.reaction.toUpperCase().replace('_', ' ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}

function StatCell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={statCell}>
      <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7a7a7a', fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 3.6vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 0.95, textTransform: 'uppercase', color: accent ? 'var(--gold)' : 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#7a7a7a', fontFamily: 'var(--font-mono)' }}>{sub}</div>}
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: accent ? 'var(--gold)' : 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 9, color: '#7a7a7a', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{label}</div>
    </div>
  )
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const container: React.CSSProperties = {
  padding: '32px 48px 64px',
  display: 'flex',
  flexDirection: 'column',
  gap: 32,
}

const statsRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 1,
  background: '#1d1d1d',
  border: '1px solid #1d1d1d',
}

const statCell: React.CSSProperties = {
  padding: '18px 20px',
  background: '#0e0e0e',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(20px, 2.2vw, 28px)',
  fontWeight: 900,
  letterSpacing: '-0.02em',
  textTransform: 'uppercase',
  color: 'var(--text)',
  marginBottom: 14,
}

const trackCard: React.CSSProperties = {
  padding: '18px 20px',
  background: '#0e0e0e',
  border: '1px solid #1d1d1d',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const recipRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 14px',
  background: '#0e0e0e',
  border: '1px solid #1d1d1d',
}
