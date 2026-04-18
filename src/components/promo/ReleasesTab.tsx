'use client'

// Releases tab for the /promo hub.
// Extracted verbatim from src/app/releases/page.tsx during Phase 1 of the
// promo-hub migration. No behavior changes — the gold token drift and the
// `any` on `s` are carried over intentionally. See docs/plans/promo-hub-migration.md.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Release, PromoStyles } from './types'
import { TYPE_LABELS } from './types'

export function ReleasesTab({ s, mobile, onSendPromo }: { s: PromoStyles; mobile: boolean; onSendPromo: (url: string) => void }) {
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [campaignData, setCampaignData] = useState<Record<string, { total: number; scheduled: number }>>({})

  useEffect(() => {
    fetch('/api/releases').then(r => r.json()).then(d => { setReleases(d.releases || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Fetch campaign data for all releases once they load
  useEffect(() => {
    if (releases.length === 0) return
    releases.forEach(r => {
      fetch(`/api/releases/${r.id}/campaign`)
        .then(res => res.json())
        .then(d => {
          const posts = d.posts || []
          if (posts.length > 0) {
            setCampaignData(prev => ({ ...prev, [r.id]: { total: posts.length, scheduled: posts.filter((p: any) => p.status === 'scheduled').length } }))
          }
        })
        .catch(() => {})
    })
  }, [releases])

  const now = new Date()
  const upcoming = releases.filter(r => new Date(r.release_date) >= now).sort((a, b) => a.release_date.localeCompare(b.release_date))
  const past = releases.filter(r => new Date(r.release_date) < now).sort((a, b) => b.release_date.localeCompare(a.release_date))

  function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }

  function daysUntil(d: string) {
    const diff = Math.ceil((new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'today'
    if (diff === 1) return 'tomorrow'
    return `in ${diff} days`
  }

  function ReadinessDots({ release }: { release: Release }) {
    const isUpcoming = new Date(release.release_date) >= now
    if (!isUpcoming) return null
    const checks = [
      { label: 'Artwork', ok: !!release.artwork_url },
      { label: 'Link', ok: !!release.streaming_url },
      { label: 'Campaign', ok: !!(campaignData[release.id]?.total) },
    ]
    const ready = checks.filter(c => c.ok).length
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '3px' }}>
          {checks.map((c, i) => (
            <span key={i} title={c.label} style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.ok ? 'var(--green)' : 'var(--border-dim)', display: 'inline-block' }} />
          ))}
        </div>
        <span style={{ fontSize: '9px', color: ready === checks.length ? 'var(--green)' : s.dimmer, letterSpacing: '0.06em' }}>
          {ready}/{checks.length}
        </span>
      </div>
    )
  }

  function CampaignBadge({ release }: { release: Release }) {
    const data = campaignData[release.id]
    if (data && data.total > 0) {
      return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
            <span style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'var(--green)' }}>
              {data.scheduled > 0 ? `${data.scheduled} scheduled` : 'Campaign live'}
            </span>
          </div>
          <Link href={`/releases/${release.id}/campaign`} style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dim, textDecoration: 'none' }}>
            View →
          </Link>
        </div>
      )
    }
    return (
      <Link href={`/releases/${release.id}/campaign`} style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.gold, border: `1px solid ${s.gold}40`, padding: '5px 12px', textDecoration: 'none', display: 'inline-block' }}>
        Build campaign →
      </Link>
    )
  }

  function ReleaseRow({ release }: { release: Release }) {
    const isPast = new Date(release.release_date) < now
    const isUpcoming = !isPast
    if (mobile) return (
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
          {release.artwork_url && <img src={release.artwork_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: s.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{release.title}</span>
              {isUpcoming && <ReadinessDots release={release} />}
            </div>
            <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '2px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              {release.artist && <span>{release.artist} · </span>}{TYPE_LABELS[release.type] || release.type} · {formatDate(release.release_date)}
              {isUpcoming && <span style={{ color: s.gold, fontWeight: 500 }}>{daysUntil(release.release_date)}</span>}
            </div>
            {campaignData[release.id]?.total > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                <span style={{ fontSize: '9px', color: 'var(--green)' }}>
                  {campaignData[release.id].scheduled > 0 ? `${campaignData[release.id].scheduled} scheduled` : 'Campaign live'}
                </span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          {release.streaming_url && (
            <button onClick={() => onSendPromo(release.streaming_url!)} style={{ fontSize: '9px', color: s.gold, background: 'transparent', border: `1px solid ${s.gold}40`, padding: '4px 10px', fontFamily: s.font, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Promo →
            </button>
          )}
          <Link href={`/releases/${release.id}/edit`} style={{ fontSize: '9px', color: s.dimmer, textDecoration: 'none', flexShrink: 0 }}>Edit</Link>
        </div>
      </div>
    )
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px 120px 1fr auto', alignItems: 'center', gap: '16px', padding: '18px 24px', borderBottom: `1px solid ${s.border}` }}>
        <div>
          <div style={{ fontSize: '12px', color: isPast ? s.dimmer : s.text, fontVariantNumeric: 'tabular-nums' }}>{formatDate(release.release_date)}</div>
          {isUpcoming && <div style={{ fontSize: '10px', color: s.gold, marginTop: '3px', fontWeight: 500 }}>{daysUntil(release.release_date)}</div>}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {release.artwork_url && <img src={release.artwork_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }} />}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', color: s.text }}>{release.title}</span>
              {isUpcoming && <ReadinessDots release={release} />}
            </div>
            <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '3px', display: 'flex', gap: '8px' }}>
              {release.artist && <span>{release.artist}</span>}
              {release.artist && release.label && <span style={{ color: s.border }}>·</span>}
              {release.label && <span>{release.label}</span>}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.gold, background: `${s.gold}18`, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', width: 'fit-content' }}>
          {TYPE_LABELS[release.type] || release.type}
        </div>
        <div>
          {release.streaming_url ? (
            <a href={release.streaming_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: isPast ? s.goldBright : s.dimmer, textDecoration: 'none', letterSpacing: '0.1em' }}>
              {isPast ? '→ Stream / Buy' : '→ Private preview'}
            </a>
          ) : <span style={{ fontSize: '10px', color: s.dimmer }}>{isPast ? 'No link' : '—'}</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <CampaignBadge release={release} />
          {release.streaming_url && (
            <button onClick={() => onSendPromo(release.streaming_url!)} style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dim, border: `1px solid ${s.border}`, padding: '5px 12px', background: 'transparent', fontFamily: s.font, cursor: 'pointer' }}>
              Send promo →
            </button>
          )}
        </div>
        <div>
          <Link href={`/releases/${release.id}/edit`} style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, textDecoration: 'none', padding: '5px 8px' }}>Edit</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: mobile ? '16px' : '32px 48px' }}>
      {loading && <div style={{ color: s.dimmer, fontSize: '12px', padding: '40px 0' }}>Loading…</div>}
      {!loading && releases.length === 0 && (
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '48px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: s.dim, marginBottom: '16px' }}>No releases yet</div>
          <Link href="/releases/new" style={{ background: s.gold, color: '#050505', textDecoration: 'none', padding: '0 28px', height: '40px', display: 'inline-flex', alignItems: 'center', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            + Add your first release
          </Link>
        </div>
      )}
      {!loading && upcoming.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Upcoming</div>
          <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
            {!mobile && (
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px 120px 1fr auto', gap: '16px', padding: '12px 24px', borderBottom: `1px solid ${s.borderMid}`, fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase' }}>
                <div>Date</div><div>Title</div><div>Type</div><div>Links</div><div>Campaign</div><div></div>
              </div>
            )}
            {upcoming.map(r => <ReleaseRow key={r.id} release={r} />)}
          </div>
        </div>
      )}
      {!loading && past.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '16px' }}>Past releases</div>
          <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
            {!mobile && (
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px 120px 1fr auto', gap: '16px', padding: '12px 24px', borderBottom: `1px solid ${s.borderMid}`, fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase' }}>
                <div>Date</div><div>Title</div><div>Type</div><div>Links</div><div>Campaign</div><div></div>
              </div>
            )}
            {past.map(r => <ReleaseRow key={r.id} release={r} />)}
          </div>
        </div>
      )}
    </div>
  )
}
