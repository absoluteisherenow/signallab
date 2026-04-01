'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Gig {
  id: string
  venue: string
  city: string
  date: string
  set_time?: string
  status?: string
  fee?: number
  promoter_email?: string
  al_name?: string
  al_phone?: string
  venue_address?: string
  hospitality?: string
  backline?: string
}

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  red: 'var(--red-brown, #8a4a3a)',
  font: 'var(--font-mono)',
}

export default function MobileGigs() {
  const [gigs, setGigs] = useState<Gig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/gigs').then(r => r.json()).then(d => {
      setGigs(d.gigs || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const now = new Date()
  const upcoming = gigs.filter(g => new Date(g.date) >= now).sort((a, b) => a.date.localeCompare(b.date))
  const past = gigs.filter(g => new Date(g.date) < now).sort((a, b) => b.date.localeCompare(a.date))

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function missingLogistics(gig: Gig): string[] {
    const missing: string[] = []
    const gigDate = new Date(gig.date)
    const daysOut = Math.floor((gigDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysOut > 90) return missing
    if (!gig.al_name && !gig.promoter_email) missing.push('contact')
    if (!gig.venue_address) missing.push('address')
    if (!gig.set_time) missing.push('set time')
    if (!gig.hospitality) missing.push('rider')
    return missing
  }

  function logisticsUrgency(gig: Gig): 'urgent' | 'warning' | 'ok' {
    const gigDate = new Date(gig.date)
    const daysOut = Math.floor((gigDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysOut <= 7) return 'urgent'
    if (daysOut <= 30) return 'warning'
    return 'ok'
  }

  function GigCard({ gig, dimmed }: { gig: Gig; dimmed?: boolean }) {
    const missing = !dimmed ? missingLogistics(gig) : []
    const urgency = logisticsUrgency(gig)
    return (
      <a href={`/api/gigs/${gig.id}/wallet`} style={{
        background: s.panel, border: `1px solid ${s.border}`, padding: '18px',
        textDecoration: 'none', display: 'block',
        opacity: dimmed ? 0.5 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: missing.length > 0 ? '10px' : 0 }}>
          <div>
            <div style={{ fontSize: '16px', color: s.text, marginBottom: '3px' }}>{gig.venue}</div>
            <div style={{ fontSize: '12px', color: s.dimmer, marginTop: '3px' }}>
              {gig.city}{gig.set_time ? ` · ${gig.set_time}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '13px', color: dimmed ? s.dimmer : s.dim }}>{formatDate(gig.date)}</div>
          </div>
        </div>
        {missing.length > 0 && (
          <div style={{
            padding: '8px 12px',
            background: urgency === 'urgent' ? 'rgba(138,74,58,0.1)' : 'rgba(176,141,87,0.06)',
            border: `1px solid ${urgency === 'urgent' ? 'rgba(138,74,58,0.25)' : 'rgba(176,141,87,0.15)'}`,
            fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase',
            color: urgency === 'urgent' ? s.red : s.gold,
          }}>
            {urgency === 'urgent' ? 'Missing' : 'Confirm'}: {missing.join(', ')}
          </div>
        )}
      </a>
    )
  }

  return (
    <div style={{ background: s.bg, minHeight: '100vh', fontFamily: s.font, color: s.text, paddingBottom: '72px' }}>
      <div style={{ padding: '20px 16px 16px' }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '26px', fontWeight: 300, marginBottom: '6px' }}>
          Tour
        </div>
        <div style={{ fontSize: '12px', color: s.dimmer }}>
          {upcoming.length} upcoming · {past.length} past
        </div>
      </div>

      {loading && (
        <div style={{ padding: '40px 16px', fontSize: '13px', color: s.dimmer }}>Loading...</div>
      )}

      {!loading && upcoming.length > 0 && (
        <div style={{ padding: '0 16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '12px' }}>
            Upcoming
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {upcoming.map(g => <GigCard key={g.id} gig={g} />)}
          </div>
        </div>
      )}

      {!loading && past.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '12px' }}>
            Past
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {past.slice(0, 10).map(g => <GigCard key={g.id} gig={g} dimmed />)}
          </div>
        </div>
      )}

      {!loading && gigs.length === 0 && (
        <div style={{ padding: '40px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: s.dimmer, marginBottom: '16px' }}>No gigs yet</div>
          <Link href="/gigs" style={{
            fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase',
            color: s.gold, textDecoration: 'none', border: `1px solid ${s.gold}40`, padding: '12px 24px',
          }}>
            Add gig on desktop
          </Link>
        </div>
      )}
    </div>
  )
}
