'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMobile } from '@/hooks/useMobile'

type Release = {
  id: string
  title: string
  artist?: string
  type: string
  release_date: string
  label?: string
  streaming_url?: string
  artwork_url?: string
  notes?: string
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  single: 'Single', ep: 'EP', album: 'Album',
  remix: 'Remix', compilation: 'Compilation',
}

export default function ReleasesPage() {
  const mobile = useMobile()
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

    if (mobile) {
      return (
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
            {release.artwork_url && (
              <img src={release.artwork_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', color: s.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{release.title}</div>
              <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '2px' }}>
                {release.artist && `${release.artist} · `}{TYPE_LABELS[release.type] || release.type} · {formatDate(release.release_date)}
              </div>
            </div>
          </div>
          <Link href={`/releases/${release.id}/edit`}
            style={{ fontSize: '9px', color: s.dimmer, textDecoration: 'none', flexShrink: 0 }}>
            Edit
          </Link>
        </div>
      )
    }

    return (
      <div style={{
        display: 'grid', gridTemplateColumns: '120px 1fr 80px 120px 1fr auto',
        alignItems: 'center', gap: '16px',
        padding: '18px 24px', borderBottom: `1px solid ${s.border}`,
      }}>
        <div style={{ fontSize: '12px', color: isPast ? s.dimmer : s.text, fontVariantNumeric: 'tabular-nums' }}>
          {formatDate(release.release_date)}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {release.artwork_url && (
            <img src={release.artwork_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }} />
          )}
          <div>
            <div style={{ fontSize: '14px', color: s.text }}>{release.title}</div>
            <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '3px', display: 'flex', gap: '8px' }}>
              {release.artist && <span>{release.artist}</span>}
              {release.artist && release.label && <span style={{ color: s.border }}>·</span>}
              {release.label && <span>{release.label}</span>}
            </div>
          </div>
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
              style={{ fontSize: '10px', color: isPast ? s.goldBright : s.dimmer, textDecoration: 'none', letterSpacing: '0.1em' }}>
              {isPast ? '→ Stream / Buy' : '→ Private preview'}
            </a>
          ) : (
            <span style={{ fontSize: '10px', color: s.dimmer }}>{isPast ? 'No link' : '—'}</span>
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
        <div>
          <Link href={`/releases/${release.id}/edit`}
            style={{
              fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase',
              color: s.dimmer, textDecoration: 'none', padding: '5px 8px',
            }}>
            Edit
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ padding: mobile ? '20px 16px 16px' : '40px 48px 32px', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: mobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', flexDirection: mobile ? 'column' : 'row', gap: mobile ? '16px' : '0' }}>
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

      <div style={{ padding: mobile ? '16px' : '32px 48px' }}>

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
              {!mobile && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '120px 1fr 80px 120px 1fr auto',
                  gap: '16px', padding: '12px 24px',
                  borderBottom: `1px solid ${s.borderMid}`,
                  fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase',
                }}>
                  <div>Date</div>
                  <div>Title</div>
                  <div>Type</div>
                  <div>Links</div>
                  <div>Campaign</div>
                  <div></div>
                </div>
              )}
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
                display: 'grid', gridTemplateColumns: '120px 1fr 80px 120px 1fr auto',
                gap: '16px', padding: '12px 24px',
                borderBottom: `1px solid ${s.borderMid}`,
                fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase',
              }}>
                <div>Date</div>
                <div>Title</div>
                <div>Type</div>
                <div>Links</div>
                <div>Campaign</div>
                <div></div>
              </div>
              {past.map(r => <ReleaseRow key={r.id} release={r} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
