'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Gig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  time: string
  fee: number
  currency: string
  audience: number
  status: string
}

const FALLBACK_GIGS: Gig[] = [
  { id: '1', title: 'Electric Nights Festival', venue: 'Tresor Club', location: 'Berlin, Germany', date: '2026-04-15', time: '22:00', fee: 5000, currency: 'EUR', audience: 2500, status: 'confirmed' },
  { id: '2', title: 'Summer Series', venue: 'Melkweg', location: 'Amsterdam, Netherlands', date: '2026-04-22', time: '20:00', fee: 3500, currency: 'EUR', audience: 1800, status: 'confirmed' },
  { id: '3', title: 'Techno Sessions', venue: 'Ministry of Sound', location: 'London, UK', date: '2026-05-01', time: '23:00', fee: 6000, currency: 'EUR', audience: 3000, status: 'pending' },
  { id: '4', title: 'Open Air Summer', venue: 'Kaserne', location: 'Basel, Switzerland', date: '2026-05-15', time: '19:00', fee: 7500, currency: 'EUR', audience: 4000, status: 'confirmed' },
]

const URGENT = [
  { text: 'Send advance — Electric Nights Festival', type: 'advance', href: '/logistics', due: '24d' },
  { text: 'Invoice unpaid — Summer Series deposit', type: 'invoice', href: '/business/finances', due: '8d' },
  { text: 'Contract unsigned — Techno Sessions', type: 'contract', href: '/gigs', due: '40d' },
]

export default function Dashboard() {
  const [gigs, setGigs] = useState<Gig[]>([])
  const [loading, setLoading] = useState(true)
  const now = new Date()

  useEffect(() => {
    fetch('/api/gigs')
      .then(r => r.json())
      .then(d => setGigs(d.gigs?.length > 0 ? d.gigs : FALLBACK_GIGS))
      .catch(() => setGigs(FALLBACK_GIGS))
      .finally(() => setLoading(false))
  }, [])

  const nextGig = gigs[0]
  const daysToNext = nextGig ? Math.ceil((new Date(nextGig.date).getTime() - now.getTime()) / 86400000) : 0
  const confirmed = gigs.filter(g => g.status === 'confirmed')
  const confirmedFees = confirmed.reduce((a, g) => a + g.fee, 0)
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917', borderMid: '#2e2c29',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c', dimmest: '#2e2c29',
    green: '#3d6b4a', font: "'DM Mono', monospace",
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>

      {/* HERO HEADER */}
      <div style={{ padding: '56px 56px 48px', borderBottom: `1px solid ${s.border}` }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          Signal Lab — Command centre
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(32px, 3.5vw, 52px)', fontWeight: 200, letterSpacing: '0.02em', lineHeight: 1.0 }}>
              {greeting}.
            </div>
            <div style={{ fontSize: '14px', color: s.dimmer, marginTop: '10px', letterSpacing: '0.06em' }}>
              {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <Link href="/gigs/new" style={{
            display: 'inline-block', textDecoration: 'none',
            background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
            border: `1px solid ${s.gold}`, color: s.gold,
            fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase',
            padding: '14px 28px',
          }}>
            + New gig
          </Link>
        </div>
      </div>

      <div style={{ padding: '48px 56px' }}>

        {/* STATS ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginBottom: '48px' }}>
          {[
            { label: 'Next show', value: nextGig ? `${daysToNext}d` : '—', sub: nextGig ? `${nextGig.venue} · ${nextGig.location}` : 'No upcoming shows' },
            { label: 'Confirmed income', value: `€${confirmedFees.toLocaleString()}`, sub: `${confirmed.length} confirmed shows` },
            { label: 'Total audience', value: gigs.reduce((a, g) => a + (g.audience || 0), 0).toLocaleString(), sub: 'Across all upcoming' },
            { label: 'Needs attention', value: URGENT.length.toString(), sub: 'Action required', alert: true },
          ].map(stat => (
            <div key={stat.label} style={{ background: s.panel, border: `1px solid ${stat.alert ? '#8a4a3a30' : s.border}`, padding: '28px 32px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '14px' }}>{stat.label}</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '38px', fontWeight: 200, color: stat.alert ? s.gold : s.text, letterSpacing: '-0.01em', lineHeight: 1, marginBottom: '8px' }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: s.dimmest, letterSpacing: '0.05em' }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '48px' }}>

          {/* NEXT GIG */}
          {nextGig && (
            <div style={{ background: s.panel, border: `1px solid ${s.borderMid}`, padding: '32px 36px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase' }}>Next show</div>
                <div style={{ fontSize: '11px', color: s.dimmer }}>{daysToNext} days away</div>
              </div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 200, letterSpacing: '0.04em', marginBottom: '6px', lineHeight: 1.2 }}>{nextGig.title}</div>
              <div style={{ fontSize: '14px', color: s.dimmer, marginBottom: '28px' }}>{nextGig.venue} · {nextGig.location}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0', borderTop: `1px solid ${s.border}`, paddingTop: '20px', marginBottom: '24px' }}>
                {[
                  { l: 'Date', v: new Date(nextGig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
                  { l: 'Time', v: nextGig.time },
                  { l: 'Capacity', v: nextGig.audience?.toLocaleString() },
                  { l: 'Fee', v: `€${nextGig.fee?.toLocaleString()}` },
                ].map(f => (
                  <div key={f.l}>
                    <div style={{ fontSize: '8px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '6px' }}>{f.l}</div>
                    <div style={{ fontSize: '15px', color: s.dim }}>{f.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link href={`/broadcast?gig=${nextGig.id}&title=${encodeURIComponent(nextGig.title)}&venue=${encodeURIComponent(nextGig.venue)}&date=${nextGig.date}`}
                  style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: s.green, border: `1px solid ${s.green}40`, padding: '10px 18px', textDecoration: 'none' }}>
                  Create post
                </Link>
                <Link href="/logistics"
                  style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: s.dimmer, border: `1px solid ${s.border}`, padding: '10px 18px', textDecoration: 'none' }}>
                  Advance sheet
                </Link>
              </div>
            </div>
          )}

          {/* URGENT */}
          <div style={{ background: s.panel, border: `1px solid ${s.borderMid}`, padding: '32px 36px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: '#c9a46e', textTransform: 'uppercase', marginBottom: '24px' }}>Needs attention</div>
            {URGENT.map((item, i) => (
              <Link key={i} href={item.href} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 0', borderBottom: i < URGENT.length - 1 ? `1px solid ${s.border}` : 'none',
                textDecoration: 'none', transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.type === 'invoice' ? '#8a4a3a' : item.type === 'contract' ? '#8a6a3a' : s.gold, flexShrink: 0 }} />
                  <div style={{ fontSize: '13px', color: s.dim }}>{item.text}</div>
                </div>
                <div style={{ fontSize: '11px', color: s.dimmer, flexShrink: 0, marginLeft: '16px' }}>in {item.due}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* UPCOMING SHOWS */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase' }}>Forthcoming shows</div>
            <div style={{ flex: 1, height: '1px', background: s.border }} />
            <Link href="/gigs" style={{ fontSize: '10px', color: s.dimmer, textDecoration: 'none', letterSpacing: '0.1em' }}>View all →</Link>
          </div>

          <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
            {loading ? (
              <div style={{ padding: '32px', fontSize: '13px', color: s.dimmer }}>Loading...</div>
            ) : gigs.map((gig, i) => {
              const gigDate = new Date(gig.date)
              const days = Math.ceil((gigDate.getTime() - now.getTime()) / 86400000)
              return (
                <div key={gig.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 140px 160px 100px 90px 110px auto',
                  padding: '20px 28px', borderBottom: i < gigs.length - 1 ? `1px solid ${s.border}` : 'none',
                  alignItems: 'center', transition: 'background 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#111009'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <div style={{ fontSize: '14px', color: s.text, marginBottom: '3px' }}>{gig.title}</div>
                    <div style={{ fontSize: '11px', color: s.dimmer }}>{gig.venue}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: s.dim }}>{gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                    <div style={{ fontSize: '11px', color: s.dimmer }}>{days}d away</div>
                  </div>
                  <div style={{ fontSize: '13px', color: s.dimmer }}>{gig.location?.split(',')[1]?.trim()}</div>
                  <div>
                    <span style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: gig.status === 'confirmed' ? s.green : '#8a6a3a', background: gig.status === 'confirmed' ? '#3d6b4a18' : '#8a6a3a18', padding: '4px 10px' }}>
                      {gig.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: s.dim }}>{gig.audience?.toLocaleString()}</div>
                  <div style={{ fontSize: '14px', color: s.text }}>€{gig.fee?.toLocaleString()}</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&venue=${encodeURIComponent(gig.venue)}&date=${gig.date}`}
                      style={{ fontSize: '11px', color: s.green, textDecoration: 'none', letterSpacing: '0.08em' }}>Post</Link>
                    <Link href="/logistics"
                      style={{ fontSize: '11px', color: s.dimmer, textDecoration: 'none', letterSpacing: '0.08em' }}>Advance</Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginTop: '24px' }}>
          {[
            { label: 'Generate caption', href: '/broadcast', color: '#3d6b4a' },
            { label: 'Build a set', href: '/setlab', color: '#9a6a5a' },
            { label: 'Open Sonix Lab', href: '/sonix', color: '#6a7a9a' },
            { label: 'View finances', href: '/business/finances', color: '#b08d57' },
          ].map(a => (
            <Link key={a.label} href={a.href} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: s.panel, border: `1px solid ${s.border}`,
              padding: '20px 24px', textDecoration: 'none',
              fontSize: '12px', letterSpacing: '0.06em', color: a.color,
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#141310'; e.currentTarget.style.borderColor = a.color + '40' }}
              onMouseLeave={e => { e.currentTarget.style.background = s.panel; e.currentTarget.style.borderColor = s.border }}
            >
              {a.label}
              <span style={{ opacity: 0.4, fontSize: '14px' }}>→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
