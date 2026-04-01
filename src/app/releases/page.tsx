'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Release = {
  id: string
  title: string
  type: string
  release_date: string
  label?: string
  streaming_url?: string
  notes?: string
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  single: 'Single', ep: 'EP', album: 'Album',
  remix: 'Remix', compilation: 'Compilation',
}

export default function ReleasesPage() {
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)

  const s = {
    bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)', borderMid: 'var(--border)',
    gold: 'var(--gold)', goldBright: 'var(--gold-bright)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
    font: 'var(--font-mono)',
  }

  useEffect(() => {
    fetch('/api/releases')
      .then(r => r.json())
      .then(d => { setReleases(d.releases || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const now = new Date()
  const upcoming = releases.filter(r => new Date(r.release_date) >= now).sort((a, b) => a.release_date.localeCompare(b.release_date))
  const past = releases.filter(r => new Date(r.release_date) < now).sort((a, b) => b.release_date.localeCompare(a.release_date))

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function ReleaseRow({ release }: { release: Release }) {
    const isPast = new Date(release.release_date) < now
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: '140px 1fr 100px 140px 1fr',
        alignItems: 'center', gap: '16px',
        padding: '18px 24px', borderBottom: `1px solid ${s.border}`,
      }}>
        <div style={{ fontSize: '12px', color: isPast ? s.dimmer : s.text, fontVariantNumeric: 'tabular-nums' }}>
          {formatDate(release.release_date)}
        </div>
        <div>
          <div style={{ fontSize: '14px', color: s.text }}>{release.title}</div>
          {release.label && <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '3px' }}>{release.label}</div>}
        </div>
        <div style={{
          fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase',
          color: s.gold, background: `${s.gold}18`, padding: '3px 8px',
          display: 'inline-flex', alignItems: 'center', width: 'fit-content',
        }}>
          {TYPE_LABELS[release.type] || release.type}
        </div>
        <div>
          {release.streaming_url ? (
            <a href={release.streaming_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '10px', color: s.goldBright, textDecoration: 'none', letterSpacing: '0.1em' }}>
              → Stream / Buy
            </a>
          ) : (
            <span style={{ fontSize: '10px', color: s.dimmer }}>No link yet</span>
          )}
        </div>
        <div>
          <Link href={`/releases/${release.id}/campaign`}
            style={{
              fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase',
              color: s.gold, border: `1px solid ${s.gold}40`, padding: '5px 12px',
              textDecoration: 'none', display: 'inline-block',
            }}>
            Build campaign →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ padding: '40px 48px 32px', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
            Drop Lab
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1 }}>
            Your catalogue
          </div>
          <div style={{ fontSize: '12px', color: s.dim, marginTop: '8px' }}>
            {releases.length} release{releases.length !== 1 ? 's' : ''} · {upcoming.length} upcoming
          </div>
        </div>
        <Link href="/releases/new" style={{
          background: s.gold, color: '#070706', textDecoration: 'none',
          padding: '0 24px', height: '36px', display: 'flex', alignItems: 'center',
          fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase',
        }}>
          + New release
        </Link>
      </div>

      <div style={{ padding: '32px 48px' }}>

        {loading && (
          <div style={{ color: s.dimmer, fontSize: '12px', padding: '40px 0' }}>Loading…</div>
        )}

        {!loading && releases.length === 0 && (
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '48px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: s.dim, marginBottom: '16px' }}>No releases yet</div>
            <Link href="/releases/new" style={{
              background: s.gold, color: '#070706', textDecoration: 'none',
              padding: '0 28px', height: '40px', display: 'inline-flex', alignItems: 'center',
              fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase',
            }}>
              + Add your first release
            </Link>
          </div>
        )}

        {!loading && upcoming.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
              Upcoming
            </div>
            <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '140px 1fr 100px 140px 1fr',
                gap: '16px', padding: '12px 24px',
                borderBottom: `1px solid ${s.borderMid}`,
                fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase',
              }}>
                <div>Date</div>
                <div>Title</div>
                <div>Type</div>
                <div>Links</div>
                <div>Campaign</div>
              </div>
              {upcoming.map(r => <ReleaseRow key={r.id} release={r} />)}
            </div>
          </div>
        )}

        {!loading && past.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '16px' }}>
              Past releases
            </div>
            <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '140px 1fr 100px 140px 1fr',
                gap: '16px', padding: '12px 24px',
                borderBottom: `1px solid ${s.borderMid}`,
                fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase',
              }}>
                <div>Date</div>
                <div>Title</div>
                <div>Type</div>
                <div>Links</div>
                <div>Campaign</div>
              </div>
              {past.map(r => <ReleaseRow key={r.id} release={r} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
