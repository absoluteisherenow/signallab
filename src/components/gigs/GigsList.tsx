'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
  promoter_email?: string
}

const FALLBACK_GIGS: Gig[] = [
  { id: '1', title: 'Electric Nights Festival', venue: 'Tresor Club', location: 'Berlin, Germany', date: '2026-04-15', time: '22:00', fee: 5000, currency: 'EUR', audience: 2500, status: 'confirmed' },
  { id: '2', title: 'Summer Series', venue: 'Melkweg', location: 'Amsterdam, Netherlands', date: '2026-04-22', time: '20:00', fee: 3500, currency: 'EUR', audience: 1800, status: 'confirmed' },
  { id: '3', title: 'Techno Sessions', venue: 'Ministry of Sound', location: 'London, UK', date: '2026-05-01', time: '23:00', fee: 6000, currency: 'EUR', audience: 3000, status: 'pending' },
  { id: '4', title: 'Open Air Summer', venue: 'Kaserne', location: 'Basel, Switzerland', date: '2026-05-15', time: '19:00', fee: 7500, currency: 'EUR', audience: 4000, status: 'confirmed' },
]

export function GigsList() {
  const router = useRouter()
  const [gigs, setGigs] = useState<Gig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadGigs() }, [])

  async function loadGigs() {
    try {
      const res = await fetch('/api/gigs')
      const data = await res.json()
      setGigs(data.gigs?.length > 0 ? data.gigs : FALLBACK_GIGS)
    } catch {
      setGigs(FALLBACK_GIGS)
    } finally {
      setLoading(false)
    }
  }

  const totalFee = gigs.filter(g => g.status === 'confirmed').reduce((a, g) => a + g.fee, 0)

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '40px 48px' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
            Signal Lab — Gigs
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '28px', fontWeight: 200, letterSpacing: '0.04em' }}>Gigs</div>
          <div style={{ fontSize: '13px', color: s.dimmer, marginTop: '6px' }}>
            {gigs.filter(g => g.status === 'confirmed').length} confirmed · €{totalFee.toLocaleString()} total
          </div>
        </div>
        <button onClick={() => router.push('/gigs/new')} style={{
          background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
          border: `1px solid ${s.gold}`, color: s.gold, fontFamily: s.font,
          fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase',
          padding: '12px 24px', cursor: 'pointer',
        }}>
          + Add new gig
        </button>
      </div>

      {/* TABLE */}
      {loading ? (
        <div style={{ fontSize: '13px', color: s.dimmer, padding: '40px 0' }}>Loading gigs...</div>
      ) : (
        <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
          {/* Headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 160px 100px 80px 100px 120px', padding: '12px 24px', borderBottom: `1px solid ${s.border}` }}>
            {['Show', 'Date', 'Location', 'Status', 'Audience', 'Fee', ''].map(h => (
              <div key={h} style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {gigs.map((gig, i) => {
            const gigDate = new Date(gig.date)
            const isPast = gigDate < new Date()
            return (
              <div key={gig.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 120px 160px 100px 80px 100px 120px',
                padding: '18px 24px',
                borderBottom: i < gigs.length - 1 ? `1px solid ${s.border}` : 'none',
                alignItems: 'center',
                opacity: isPast ? 0.5 : 1,
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#1a1917'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: '14px', color: s.text, marginBottom: '3px' }}>{gig.title}</div>
                  <div style={{ fontSize: '11px', color: s.dimmer }}>{gig.venue}</div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: s.dim }}>{gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  <div style={{ fontSize: '11px', color: s.dimmer }}>{gig.time}</div>
                </div>
                <div style={{ fontSize: '13px', color: s.dim }}>{gig.location}</div>
                <div>
                  <span style={{
                    fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: gig.status === 'confirmed' ? '#3d6b4a' : '#8a6a3a',
                    background: gig.status === 'confirmed' ? '#3d6b4a20' : '#8a6a3a20',
                    padding: '4px 10px',
                  }}>{gig.status}</span>
                </div>
                <div style={{ fontSize: '13px', color: s.dim }}>{gig.audience?.toLocaleString()}</div>
                <div style={{ fontSize: '14px', color: s.text }}>€{gig.fee?.toLocaleString()}</div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', letterSpacing: '0.08em' }}>
                  <button onClick={() => router.push(`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&venue=${encodeURIComponent(gig.venue)}&location=${encodeURIComponent(gig.location)}&date=${gig.date}`)}
                    style={{ background: 'transparent', border: 'none', color: '#3d6b4a', fontFamily: s.font, fontSize: '11px', cursor: 'pointer', padding: 0, letterSpacing: '0.08em' }}>
                    Post
                  </button>
                  <button onClick={() => router.push('/logistics')}
                    style={{ background: 'transparent', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', cursor: 'pointer', padding: 0, letterSpacing: '0.08em' }}>
                    Advance
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
