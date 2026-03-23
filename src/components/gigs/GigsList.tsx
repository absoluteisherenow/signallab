'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  promoter_email?: string
}

const FALLBACK: Gig[] = [
  { id: '1', title: 'Electric Nights Festival', venue: 'Tresor Club', location: 'Berlin, Germany', date: '2026-04-15', time: '22:00', fee: 5000, currency: 'EUR', audience: 2500, status: 'confirmed' },
  { id: '2', title: 'Summer Series', venue: 'Melkweg', location: 'Amsterdam, Netherlands', date: '2026-04-22', time: '20:00', fee: 3500, currency: 'EUR', audience: 1800, status: 'confirmed' },
  { id: '3', title: 'Techno Sessions', venue: 'Ministry of Sound', location: 'London, UK', date: '2026-05-01', time: '23:00', fee: 6000, currency: 'EUR', audience: 3000, status: 'pending' },
  { id: '4', title: 'Open Air Summer', venue: 'Kaserne', location: 'Basel, Switzerland', date: '2026-05-15', time: '19:00', fee: 7500, currency: 'EUR', audience: 4000, status: 'confirmed' },
]

const f = {
  bg: '#070706', panel: '#0e0d0b', border: '#1a1917', mid: '#2e2c29',
  gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c', dimmest: '#2e2c29',
  green: '#3d6b4a', font: "'DM Mono', monospace",
}

export function GigsList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const openId = searchParams.get('open')

  const [gigs, setGigs] = useState<Gig[]>(FALLBACK)
  const [selected, setSelected] = useState<string | null>(openId)
  const [advanceStatus, setAdvanceStatus] = useState<Record<string, string>>({ '1': 'complete', '2': 'sent' })
  const [showEmailInput, setShowEmailInput] = useState<string | null>(null)
  const [promoterEmail, setPromoterEmail] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch('/api/gigs').then(r => r.json()).then(d => { if (d.gigs?.length > 0) setGigs(d.gigs) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (openId) {
      setSelected(openId)
      setTimeout(() => document.getElementById(`gig-${openId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400)
    }
  }, [openId])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function sendAdvance(gig: Gig, email: string) {
    if (!email) return
    setSending(gig.id)
    try {
      const res = await fetch('/api/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gigId: gig.id, gigTitle: gig.title, venue: gig.venue, date: gig.date, promoterEmail: email }),
      })
      const data = await res.json()
      if (data.success || data.id) {
        setAdvanceStatus(prev => ({ ...prev, [gig.id]: 'sent' }))
        setShowEmailInput(null)
        setPromoterEmail('')
        showToast(`Advance request sent to ${email}`)
      } else showToast('Error: ' + (data.error || 'Failed'))
    } catch { showToast('Failed to send') }
    finally { setSending(null) }
  }

  const aColor = (s: string) => s === 'complete' ? f.green : s === 'sent' ? f.gold : f.dimmer
  const aLabel = (s: string) => s === 'complete' ? 'Advance complete' : s === 'sent' ? 'Sent — awaiting' : 'Not sent'
  const totalFees = gigs.filter(g => g.status === 'confirmed').reduce((a, g) => a + g.fee, 0)

  return (
    <div style={{ background: f.bg, color: f.text, fontFamily: f.font, minHeight: '100vh', padding: '48px 56px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: f.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <span style={{ display: 'block', width: '28px', height: '1px', background: f.gold }} />Signal Lab — Gigs
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '36px', fontWeight: 200 }}>Gigs</div>
          <div style={{ fontSize: '13px', color: f.dimmer, marginTop: '6px' }}>{gigs.filter(g => g.status === 'confirmed').length} confirmed · €{totalFees.toLocaleString()} total · Click any row to expand</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href="/contracts" style={{ textDecoration: 'none', border: `1px solid ${f.border}`, color: f.dimmer, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 20px', display: 'inline-block' }}>Upload contract</Link>
          <button onClick={() => router.push('/gigs/new')} style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: `1px solid ${f.gold}`, color: f.gold, fontFamily: f.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '12px 24px', cursor: 'pointer' }}>
            + Add new gig
          </button>
        </div>
      </div>

      {/* HEADERS */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 150px 100px 80px 100px 160px', padding: '10px 24px', fontSize: '9px', letterSpacing: '0.18em', color: f.dimmer, textTransform: 'uppercase' }}>
        {['Show', 'Date', 'Location', 'Status', 'Cap.', 'Fee', 'Advance'].map(h => <div key={h}>{h}</div>)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {gigs.map(gig => {
          const isOpen = selected === gig.id
          const gigDate = new Date(gig.date)
          const daysTo = Math.ceil((gigDate.getTime() - Date.now()) / 86400000)
          const advStatus = advanceStatus[gig.id] || 'not_sent'

          return (
            <div key={gig.id} id={`gig-${gig.id}`}>
              <div onClick={() => setSelected(isOpen ? null : gig.id)} style={{
                display: 'grid', gridTemplateColumns: '2fr 120px 150px 100px 80px 100px 160px',
                padding: '18px 24px', background: isOpen ? '#141310' : f.panel,
                border: `1px solid ${isOpen ? f.gold + '40' : f.border}`,
                cursor: 'pointer', alignItems: 'center', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#111009' }}
                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = f.panel }}
              >
                <div>
                  <div style={{ fontSize: '14px', color: f.text, marginBottom: '3px' }}>{gig.title}</div>
                  <div style={{ fontSize: '11px', color: f.dimmer }}>{gig.venue}</div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: f.dim }}>{gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  <div style={{ fontSize: '10px', color: f.dimmest }}>{daysTo > 0 ? `${daysTo}d` : 'past'}</div>
                </div>
                <div style={{ fontSize: '12px', color: f.dimmer }}>{gig.location?.split(',')[0]}</div>
                <div>
                  <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: gig.status === 'confirmed' ? f.green : '#8a6a3a', background: gig.status === 'confirmed' ? '#3d6b4a18' : '#8a6a3a18', padding: '4px 10px' }}>
                    {gig.status}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: f.dim }}>{gig.audience?.toLocaleString()}</div>
                <div style={{ fontSize: '14px', color: f.text }}>€{gig.fee?.toLocaleString()}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: aColor(advStatus), flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: aColor(advStatus) }}>{aLabel(advStatus)}</span>
                </div>
              </div>

              {isOpen && (
                <div style={{ background: '#0a0906', border: `1px solid ${f.gold}20`, borderTop: 'none', padding: '28px 24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '28px' }}>

                    {/* DETAILS */}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: f.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Show details</div>
                      {[
                        { l: 'Venue', v: gig.venue },
                        { l: 'Location', v: gig.location },
                        { l: 'Date', v: gigDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
                        { l: 'Set time', v: gig.time },
                        { l: 'Fee', v: `€${gig.fee?.toLocaleString()}` },
                        { l: 'Audience', v: gig.audience?.toLocaleString() },
                      ].map(item => (
                        <div key={item.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${f.border}`, fontSize: '12px' }}>
                          <span style={{ color: f.dimmer }}>{item.l}</span>
                          <span style={{ color: f.dim }}>{item.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* ADVANCE */}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: f.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Advance request</div>
                      {advStatus === 'complete' && (
                        <div>
                          <div style={{ fontSize: '13px', color: f.green, marginBottom: '14px' }}>✓ Advance received</div>
                          <Link href={`/advance/${gig.id}`} target="_blank" style={{ fontSize: '10px', letterSpacing: '0.12em', color: f.gold, textDecoration: 'none', textTransform: 'uppercase', border: `1px solid ${f.gold}40`, padding: '10px 18px', display: 'inline-block' }}>View advance sheet →</Link>
                        </div>
                      )}
                      {advStatus === 'sent' && (
                        <div>
                          <div style={{ fontSize: '13px', color: f.gold, marginBottom: '10px' }}>Sent — awaiting response</div>
                          <button onClick={() => setShowEmailInput(showEmailInput === gig.id ? null : gig.id)} style={{ background: 'transparent', border: `1px solid ${f.border}`, color: f.dimmer, fontFamily: f.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>Resend</button>
                        </div>
                      )}
                      {(advStatus === 'not_sent' || showEmailInput === gig.id) && (
                        <div>
                          {advStatus === 'not_sent' && !showEmailInput && <div style={{ fontSize: '13px', color: f.dimmer, marginBottom: '14px' }}>No advance sent yet</div>}
                          {showEmailInput === gig.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <input value={promoterEmail} onChange={e => setPromoterEmail(e.target.value)} placeholder="promoter@venue.com"
                                style={{ background: f.bg, border: `1px solid ${f.mid}`, color: f.text, fontFamily: f.font, fontSize: '13px', padding: '10px 14px', outline: 'none' }} />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => sendAdvance(gig, promoterEmail)} disabled={sending === gig.id || !promoterEmail} style={{ background: promoterEmail ? f.gold : 'transparent', color: promoterEmail ? '#070706' : f.dimmer, border: `1px solid ${promoterEmail ? f.gold : f.border}`, fontFamily: f.font, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {sending === gig.id && <div style={{ width: '8px', height: '8px', border: '1px solid #070706', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                                  {sending === gig.id ? 'Sending...' : 'Send →'}
                                </button>
                                <button onClick={() => { setShowEmailInput(null); setPromoterEmail('') }} style={{ background: 'transparent', color: f.dimmer, border: `1px solid ${f.border}`, fontFamily: f.font, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 16px', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setShowEmailInput(gig.id)} style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: `1px solid ${f.gold}`, color: f.gold, fontFamily: f.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 22px', cursor: 'pointer' }}>
                              Send advance request →
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ACTIONS */}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: f.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Quick actions</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&venue=${encodeURIComponent(gig.venue)}&location=${encodeURIComponent(gig.location)}&date=${gig.date}`}
                          style={{ fontSize: '12px', color: f.green, textDecoration: 'none', padding: '12px 16px', border: `1px solid ${f.green}30`, display: 'block' }}>Create post →</Link>
                        <Link href="/contracts" style={{ fontSize: '12px', color: f.gold, textDecoration: 'none', padding: '12px 16px', border: `1px solid ${f.gold}30`, display: 'block' }}>Upload contract →</Link>
                        <Link href="/business/finances" style={{ fontSize: '12px', color: f.dimmer, textDecoration: 'none', padding: '12px 16px', border: `1px solid ${f.border}`, display: 'block' }}>View invoices →</Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', right: '32px', background: 'rgba(14,13,11,0.97)', border: `1px solid ${f.border}`, padding: '16px 24px', fontSize: '13px', color: f.text, zIndex: 9999, backdropFilter: 'blur(16px)' }}>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: f.gold, marginBottom: '5px', textTransform: 'uppercase' }}>Gigs</div>
          {toast}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
