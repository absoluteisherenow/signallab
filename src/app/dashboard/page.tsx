'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const GIGS = [
  { id: 1, title: 'Electric Nights Festival', venue: 'Tresor Club', location: 'Berlin, Germany', date: '2026-04-15', time: '22:00', status: 'confirmed', fee: 5000, audience: 2500 },
  { id: 2, title: 'Summer Series', venue: 'Melkweg', location: 'Amsterdam, Netherlands', date: '2026-04-22', time: '20:00', status: 'confirmed', fee: 3500, audience: 1800 },
  { id: 3, title: 'Techno Sessions', venue: 'Ministry of Sound', location: 'London, UK', date: '2026-05-01', time: '23:00', status: 'pending', fee: 6000, audience: 3000 },
  { id: 4, title: 'Open Air Summer', venue: 'Kaserne', location: 'Basel, Switzerland', date: '2026-05-15', time: '19:00', status: 'confirmed', fee: 7500, audience: 4000 },
]

const URGENT = [
  { id: 1, text: 'Send advance request — Electric Nights Festival', type: 'advance', href: '/gigs', days: 24 },
  { id: 2, text: 'Invoice unpaid — Summer Series deposit', type: 'invoice', href: '/business/finances', days: 8 },
  { id: 3, text: 'Contract unsigned — Techno Sessions', type: 'contract', href: '/gigs', days: 40 },
]

const QUICK_ACTIONS = [
  { label: 'Add new gig', href: '/gigs', color: '#b08d57' },
  { label: 'Generate caption', href: '/broadcast', color: '#3d6b4a' },
  { label: 'Build a set', href: '/setlab', color: '#9a6a5a' },
  { label: 'Open Sonix Lab', href: '/sonix', color: '#6a7a9a' },
]

export default function Dashboard() {
  const [now] = useState(new Date())

  const nextGig = GIGS[0]
  const daysToNextGig = Math.ceil((new Date(nextGig.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const confirmedFees = GIGS.filter(g => g.status === 'confirmed').reduce((a, g) => a + g.fee, 0)
  const totalAudience = GIGS.reduce((a, g) => a + g.audience, 0)

  const urgentTypeColors: Record<string, string> = {
    advance: '#b08d57',
    invoice: '#8a4a3a',
    contract: '#6a5a3a',
  }

  return (
    <div style={{ fontFamily: "'DM Mono', monospace", color: '#f0ebe2', minHeight: '100vh', background: '#070706', padding: '40px 48px' }}>

      {/* HEADER */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: '#b08d57', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: '#b08d57' }} />
          Signal Lab — Command centre
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '32px', fontWeight: 200, letterSpacing: '0.04em', lineHeight: 1.1 }}>
              Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}.
            </div>
            <div style={{ fontSize: '13px', color: '#52504c', marginTop: '8px', letterSpacing: '0.05em' }}>
              {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <Link href="/gigs/new" style={{
            fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase',
            background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
            border: '1px solid #b08d57',
            color: '#b08d57',
            padding: '12px 24px',
            textDecoration: 'none',
            transition: 'all 0.2s',
          }}>
            + Add new gig
          </Link>
        </div>
      </div>

      {/* STATS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginBottom: '32px' }}>
        {[
          { label: 'Next show', value: `${daysToNextGig}d`, sub: nextGig.venue + ' · ' + nextGig.location },
          { label: 'Confirmed earnings', value: `€${confirmedFees.toLocaleString()}`, sub: `Next ${GIGS.filter(g => g.status === 'confirmed').length} shows` },
          { label: 'Total audience', value: totalAudience.toLocaleString(), sub: 'Across all upcoming' },
          { label: 'Pending action', value: URGENT.length.toString(), sub: 'Items need attention', alert: true },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#0e0d0b',
            border: `1px solid ${stat.alert ? '#8a4a3a40' : '#1a1917'}`,
            padding: '24px 28px',
          }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#52504c', textTransform: 'uppercase', marginBottom: '12px' }}>{stat.label}</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '32px', fontWeight: 200, color: stat.alert ? '#c9a46e' : '#f0ebe2', marginBottom: '6px' }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: '#3a3835', letterSpacing: '0.05em' }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

        {/* NEXT GIG */}
        <div style={{ background: '#0e0d0b', border: '1px solid #1a1917', padding: '28px 32px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#b08d57', textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            Next show
            <div style={{ flex: 1, height: '1px', background: '#1a1917' }} />
            <span style={{ color: '#52504c' }}>{daysToNextGig} days</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 300, letterSpacing: '0.05em', marginBottom: '6px' }}>{nextGig.title}</div>
          <div style={{ fontSize: '13px', color: '#52504c', marginBottom: '20px', letterSpacing: '0.04em' }}>{nextGig.venue} · {nextGig.location}</div>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
            {[
              { l: 'Date', v: new Date(nextGig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
              { l: 'Set time', v: nextGig.time },
              { l: 'Audience', v: nextGig.audience.toLocaleString() },
              { l: 'Fee', v: `€${nextGig.fee.toLocaleString()}` },
            ].map(f => (
              <div key={f.l}>
                <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: '#3a3835', textTransform: 'uppercase', marginBottom: '4px' }}>{f.l}</div>
                <div style={{ fontSize: '14px', color: '#8a8780' }}>{f.v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href={`/broadcast?gig=1&title=${encodeURIComponent(nextGig.title)}&venue=${encodeURIComponent(nextGig.venue)}&location=${encodeURIComponent(nextGig.location)}&date=${nextGig.date}`} style={{
              fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase',
              color: '#3d6b4a', border: '1px solid #3d6b4a40', padding: '8px 16px', textDecoration: 'none',
            }}>Create post</Link>
            <Link href="/gigs" style={{
              fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase',
              color: '#52504c', border: '1px solid #1a1917', padding: '8px 16px', textDecoration: 'none',
            }}>View gig</Link>
          </div>
        </div>

        {/* URGENT */}
        <div style={{ background: '#0e0d0b', border: '1px solid #1a1917', padding: '28px 32px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#c9a46e', textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            Needs attention
            <div style={{ flex: 1, height: '1px', background: '#1a1917' }} />
          </div>
          {URGENT.map((item, i) => (
            <Link key={item.id} href={item.href} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 0',
              borderBottom: i < URGENT.length - 1 ? '1px solid #1a1917' : 'none',
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: urgentTypeColors[item.type], flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: '#8a8780', letterSpacing: '0.04em' }}>{item.text}</div>
              </div>
              <div style={{ fontSize: '10px', color: '#3a3835', letterSpacing: '0.08em', flexShrink: 0, marginLeft: '12px' }}>
                in {item.days}d →
              </div>
            </Link>
          ))}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #1a1917' }}>
            <div style={{ fontSize: '10px', color: '#3a3835', letterSpacing: '0.08em' }}>
              Total confirmed: <span style={{ color: '#b08d57' }}>€{confirmedFees.toLocaleString()}</span> across next {GIGS.filter(g => g.status === 'confirmed').length} shows
            </div>
          </div>
        </div>
      </div>

      {/* UPCOMING GIGS */}
      <div style={{ background: '#0e0d0b', border: '1px solid #1a1917', padding: '28px 32px', marginBottom: '24px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#b08d57', textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          Forthcoming shows
          <div style={{ flex: 1, height: '1px', background: '#1a1917' }} />
          <Link href="/gigs" style={{ color: '#52504c', textDecoration: 'none', fontSize: '9px', letterSpacing: '0.1em' }}>View all →</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {GIGS.map((gig, i) => {
            const gigDate = new Date(gig.date)
            const days = Math.ceil((gigDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            return (
              <div key={gig.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 160px 100px 80px 100px auto',
                gap: '0',
                padding: '14px 0',
                borderBottom: i < GIGS.length - 1 ? '1px solid #1a1917' : 'none',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: '13px', color: '#f0ebe2', marginBottom: '2px' }}>{gig.title}</div>
                  <div style={{ fontSize: '11px', color: '#3a3835' }}>{gig.venue}</div>
                </div>
                <div style={{ fontSize: '12px', color: '#52504c' }}>{gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                <div style={{ fontSize: '12px', color: '#52504c' }}>{gig.location.split(',')[1]?.trim()}</div>
                <div>
                  <span style={{
                    fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: gig.status === 'confirmed' ? '#3d6b4a' : '#8a6a3a',
                    background: gig.status === 'confirmed' ? '#3d6b4a20' : '#8a6a3a20',
                    padding: '3px 8px',
                  }}>{gig.status}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#8a8780' }}>€{gig.fee.toLocaleString()}</div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '10px', letterSpacing: '0.1em' }}>
                  <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&venue=${encodeURIComponent(gig.venue)}&location=${encodeURIComponent(gig.location)}&date=${gig.date}`}
                    style={{ color: '#3d6b4a', textDecoration: 'none' }}>Post</Link>
                  <Link href="/gigs" style={{ color: '#52504c', textDecoration: 'none' }}>View</Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px' }}>
        {QUICK_ACTIONS.map(action => (
          <Link key={action.label} href={action.href} style={{
            background: '#0e0d0b',
            border: `1px solid #1a1917`,
            padding: '20px 24px',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'all 0.15s',
            fontSize: '12px',
            letterSpacing: '0.06em',
            color: action.color,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1a1917'; e.currentTarget.style.borderColor = action.color + '40' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#0e0d0b'; e.currentTarget.style.borderColor = '#1a1917' }}
          >
            {action.label}
            <span style={{ opacity: 0.4 }}>→</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
