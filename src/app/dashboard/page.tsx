'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const FALLBACK = [
  { id: '1', title: 'Electric Nights Festival', venue: 'Tresor Club', location: 'Berlin, Germany', date: '2026-04-15', time: '22:00', fee: 5000, currency: 'EUR', audience: 2500, status: 'confirmed' },
  { id: '2', title: 'Summer Series', venue: 'Melkweg', location: 'Amsterdam, Netherlands', date: '2026-04-22', time: '20:00', fee: 3500, currency: 'EUR', audience: 1800, status: 'confirmed' },
  { id: '3', title: 'Techno Sessions', venue: 'Ministry of Sound', location: 'London, UK', date: '2026-05-01', time: '23:00', fee: 6000, currency: 'EUR', audience: 3000, status: 'pending' },
  { id: '4', title: 'Open Air Summer', venue: 'Kaserne', location: 'Basel, Switzerland', date: '2026-05-15', time: '19:00', fee: 7500, currency: 'EUR', audience: 4000, status: 'confirmed' },
]

const URGENT = [
  { text: 'Send advance — Electric Nights Festival', href: '/logistics', due: '24d', dot: '#b08d57' },
  { text: 'Invoice unpaid — Summer Series deposit', href: '/business/finances', due: '8d', dot: '#8a4a3a' },
  { text: 'Contract unsigned — Techno Sessions', href: '/contracts', due: '40d', dot: '#8a6a3a' },
]

const QUICK = [
  { label: 'Generate caption', href: '/broadcast', color: '#3d6b4a' },
  { label: 'Build a set', href: '/setlab', color: '#9a6a5a' },
  { label: 'Sonix Lab', href: '/sonix', color: '#6a7a9a' },
  { label: 'Finances', href: '/business/finances', color: '#b08d57' },
]

export default function Dashboard() {
  const [gigs, setGigs] = useState(FALLBACK)
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    fetch('/api/gigs').then(r => r.json()).then(d => { if (d.gigs?.length > 0) setGigs(d.gigs) }).catch(() => {})
  }, [])

  const next = gigs[0]
  const daysTo = next ? Math.ceil((new Date(next.date).getTime() - now.getTime()) / 86400000) : 0
  const confirmed = gigs.filter(g => g.status === 'confirmed')
  const totalFees = confirmed.reduce((a, g) => a + (g.fee || 0), 0)

  const f = { bg: '#070706', panel: '#0e0d0b', border: '#1a1917', mid: '#2e2c29', gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c', dimmest: '#2e2c29', green: '#3d6b4a' }

  return (
    <div style={{ background: f.bg, color: f.text, fontFamily: "'DM Mono', monospace", minHeight: '100vh' }}>
      <div style={{ padding: '52px 56px 44px', borderBottom: `1px solid ${f.border}` }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: f.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: f.gold }} />Signal Lab — Command centre
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 200, lineHeight: 1.0 }}>{greeting}.</div>
            <div style={{ fontSize: '13px', color: f.dimmer, marginTop: '10px' }}>{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <Link href="/gigs/new" style={{ textDecoration: 'none', background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: `1px solid ${f.gold}`, color: f.gold, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '14px 28px' }}>+ New gig</Link>
        </div>
      </div>

      <div style={{ padding: '44px 56px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginBottom: '44px' }}>
          {[
            { label: 'Next show', value: next ? `${daysTo}d` : '—', sub: next ? `${next.venue}` : 'No upcoming shows' },
            { label: 'Confirmed income', value: `€${totalFees.toLocaleString()}`, sub: `${confirmed.length} shows` },
            { label: 'Total audience', value: gigs.reduce((a, g) => a + (g.audience || 0), 0).toLocaleString(), sub: 'All upcoming' },
            { label: 'Needs attention', value: '3', sub: 'Actions required', alert: true },
          ].map(stat => (
            <div key={stat.label} style={{ background: f.panel, border: `1px solid ${stat.alert ? '#8a4a3a30' : f.border}`, padding: '28px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: f.dimmer, textTransform: 'uppercase', marginBottom: '14px' }}>{stat.label}</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '38px', fontWeight: 200, color: stat.alert ? f.gold : f.text, lineHeight: 1, marginBottom: '8px' }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: f.dimmest }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '44px' }}>
          {next && (
            <div style={{ background: f.panel, border: `1px solid ${f.mid}`, padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: f.gold, textTransform: 'uppercase' }}>Next show</div>
                <div style={{ fontSize: '11px', color: f.dimmer }}>{daysTo} days</div>
              </div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 200, marginBottom: '6px', lineHeight: 1.2 }}>{next.title}</div>
              <div style={{ fontSize: '14px', color: f.dimmer, marginBottom: '24px' }}>{next.venue} · {next.location}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: `1px solid ${f.border}`, paddingTop: '20px', marginBottom: '24px' }}>
                {[
                  { l: 'Date', v: new Date(next.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
                  { l: 'Time', v: next.time },
                  { l: 'Cap', v: (next.audience || 0).toLocaleString() },
                  { l: 'Fee', v: `€${(next.fee || 0).toLocaleString()}` },
                ].map(item => (
                  <div key={item.l}>
                    <div style={{ fontSize: '8px', letterSpacing: '0.18em', color: f.dimmer, textTransform: 'uppercase', marginBottom: '6px' }}>{item.l}</div>
                    <div style={{ fontSize: '15px', color: f.dim }}>{item.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link href={`/broadcast?gig=${next.id}&title=${encodeURIComponent(next.title)}&date=${next.date}`} style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: f.green, border: `1px solid ${f.green}40`, padding: '10px 18px', textDecoration: 'none' }}>Create post</Link>
                <Link href="/gigs?open=1" style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: f.dimmer, border: `1px solid ${f.border}`, padding: '10px 18px', textDecoration: 'none' }}>Advance</Link>
              </div>
            </div>
          )}

          <div style={{ background: f.panel, border: `1px solid ${f.mid}`, padding: '32px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: '#c9a46e', textTransform: 'uppercase', marginBottom: '24px' }}>Needs attention</div>
            {URGENT.map((item, i) => (
              <Link key={i} href={item.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: i < 2 ? `1px solid ${f.border}` : 'none', textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.6'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.dot, flexShrink: 0 }} />
                  <div style={{ fontSize: '13px', color: f.dim }}>{item.text}</div>
                </div>
                <div style={{ fontSize: '11px', color: f.dimmer, flexShrink: 0, marginLeft: '16px' }}>in {item.due}</div>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: f.gold, textTransform: 'uppercase' }}>Forthcoming shows</div>
            <div style={{ flex: 1, height: '1px', background: f.border }} />
            <Link href="/gigs" style={{ fontSize: '10px', color: f.dimmer, textDecoration: 'none' }}>View all →</Link>
          </div>
          <div style={{ background: f.panel, border: `1px solid ${f.border}` }}>
            {gigs.map((gig, i) => {
              const d = new Date(gig.date)
              const days = Math.ceil((d.getTime() - now.getTime()) / 86400000)
              return (
                <div key={gig.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 150px 100px 90px 110px auto', padding: '18px 24px', borderBottom: i < gigs.length - 1 ? `1px solid ${f.border}` : 'none', alignItems: 'center', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#111009'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div>
                    <div style={{ fontSize: '14px', color: f.text, marginBottom: '2px' }}>{gig.title}</div>
                    <div style={{ fontSize: '11px', color: f.dimmer }}>{gig.venue}</div>
                  </div>
                  <div style={{ fontSize: '13px', color: f.dim }}>{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  <div style={{ fontSize: '13px', color: f.dimmer }}>{gig.location?.split(',')[1]?.trim()}</div>
                  <div><span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: gig.status === 'confirmed' ? f.green : '#8a6a3a', background: gig.status === 'confirmed' ? '#3d6b4a18' : '#8a6a3a18', padding: '4px 10px' }}>{gig.status}</span></div>
                  <div style={{ fontSize: '13px', color: f.dim }}>{(gig.audience || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '14px', color: f.text }}>€{(gig.fee || 0).toLocaleString()}</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&date=${gig.date}`} style={{ fontSize: '11px', color: f.green, textDecoration: 'none' }}>Post</Link>
                    <Link href="/gigs?open=1" style={{ fontSize: '11px', color: f.dimmer, textDecoration: 'none' }}>Advance</Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px' }}>
          {QUICK.map(a => (
            <Link key={a.label} href={a.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: f.panel, border: `1px solid ${f.border}`, padding: '20px 24px', textDecoration: 'none', fontSize: '12px', color: a.color, transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#141310'; e.currentTarget.style.borderColor = a.color + '40' }}
              onMouseLeave={e => { e.currentTarget.style.background = f.panel; e.currentTarget.style.borderColor = f.border }}>
              {a.label}<span style={{ opacity: 0.4 }}>→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
