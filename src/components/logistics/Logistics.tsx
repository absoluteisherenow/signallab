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
  status: string
  fee: number
  promoter_email?: string
}

const FALLBACK: Gig[] = [
  { id: '1', title: 'Electric Nights Festival', venue: 'Tresor Club', location: 'Berlin, Germany', date: '2026-04-15', time: '22:00', status: 'confirmed', fee: 5000, promoter_email: '' },
  { id: '2', title: 'Summer Series', venue: 'Melkweg', location: 'Amsterdam, Netherlands', date: '2026-04-22', time: '20:00', status: 'confirmed', fee: 3500, promoter_email: '' },
  { id: '3', title: 'Techno Sessions', venue: 'Ministry of Sound', location: 'London, UK', date: '2026-05-01', time: '23:00', status: 'pending', fee: 6000, promoter_email: '' },
  { id: '4', title: 'Open Air Summer', venue: 'Kaserne', location: 'Basel, Switzerland', date: '2026-05-15', time: '19:00', status: 'confirmed', fee: 7500, promoter_email: '' },
]

const s = {
  bg: '#070706', panel: '#0e0d0b', border: '#1a1917', borderMid: '#2e2c29',
  gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c', dimmest: '#2e2c29',
  green: '#3d6b4a', font: "'DM Mono', monospace",
}

export default function Logistics() {
  const [gigs, setGigs] = useState<Gig[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [promoterEmail, setPromoterEmail] = useState('')
  const [showEmailInput, setShowEmailInput] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [advanceStatus, setAdvanceStatus] = useState<Record<string, string>>({ '1': 'complete', '2': 'sent' })
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch('/api/gigs')
      .then(r => r.json())
      .then(d => setGigs(d.gigs?.length > 0 ? d.gigs : FALLBACK))
      .catch(() => setGigs(FALLBACK))
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function sendAdvance(gig: Gig, email: string) {
    if (!email) return
    setSending(gig.id)
    try {
      const res = await fetch('/api/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gigId: gig.id,
          gigTitle: gig.title,
          venue: gig.venue,
          date: gig.date,
          promoterEmail: email,
        }),
      })
      const data = await res.json()
      if (data.success || data.id) {
        setAdvanceStatus(prev => ({ ...prev, [gig.id]: 'sent' }))
        setShowEmailInput(null)
        setPromoterEmail('')
        showToast(`Advance request sent to ${email}`)
      } else {
        showToast('Error: ' + (data.error || 'Failed to send'))
      }
    } catch {
      showToast('Failed to send advance request')
    } finally {
      setSending(null)
    }
  }

  const statusColor = (s: string) => s === 'complete' ? '#3d6b4a' : s === 'sent' ? '#b08d57' : '#52504c'
  const statusLabel = (s: string) => s === 'complete' ? 'Advance complete' : s === 'sent' ? 'Sent — awaiting' : 'Not sent'

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '48px 56px' }}>

      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          Signal Lab — Gigs
        </div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '36px', fontWeight: 200, letterSpacing: '0.03em', marginBottom: '8px' }}>
          Gigs
        </div>
        <div style={{ fontSize: '14px', color: s.dimmer }}>All shows, advance requests and logistics</div>
      </div>

      {/* ADVANCE STATUS SUMMARY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', marginBottom: '32px' }}>
        {[
          { label: 'Advances complete', value: Object.values(advanceStatus).filter(v => v === 'complete').length, color: s.green },
          { label: 'Awaiting response', value: Object.values(advanceStatus).filter(v => v === 'sent').length, color: s.gold },
          { label: 'Not yet sent', value: gigs.length - Object.keys(advanceStatus).length, color: s.dimmer },
        ].map(stat => (
          <div key={stat.label} style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '10px' }}>{stat.label}</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '32px', fontWeight: 200, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* GIG LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {gigs.map(gig => {
          const advStatus = advanceStatus[gig.id] || 'not_sent'
          const isOpen = selected === gig.id
          const gigDate = new Date(gig.date)
          const daysTo = Math.ceil((gigDate.getTime() - Date.now()) / 86400000)

          return (
            <div key={gig.id}>
              {/* ROW */}
              <div onClick={() => setSelected(isOpen ? null : gig.id)} style={{
                background: isOpen ? '#141310' : s.panel,
                border: `1px solid ${isOpen ? s.gold + '40' : s.border}`,
                padding: '20px 28px',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '2fr 140px 100px 180px 80px',
                alignItems: 'center',
                transition: 'all 0.15s',
              }}>
                <div>
                  <div style={{ fontSize: '15px', color: s.text, marginBottom: '3px' }}>{gig.title}</div>
                  <div style={{ fontSize: '12px', color: s.dimmer }}>{gig.venue} · {gig.location}</div>
                </div>
                <div style={{ fontSize: '13px', color: s.dim }}>
                  {gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {gig.time}
                </div>
                <div>
                  <span style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: gig.status === 'confirmed' ? s.green : '#8a6a3a', background: gig.status === 'confirmed' ? '#3d6b4a18' : '#8a6a3a18', padding: '4px 10px' }}>
                    {gig.status}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor(advStatus), flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: statusColor(advStatus) }}>{statusLabel(advStatus)}</span>
                </div>
                <div style={{ fontSize: '12px', color: s.dimmer, textAlign: 'right' }}>
                  {daysTo > 0 ? `${daysTo}d →` : 'Past'}
                </div>
              </div>

              {/* EXPANDED */}
              {isOpen && (
                <div style={{ background: '#0a0906', border: `1px solid ${s.gold + '20'}`, borderTop: 'none', padding: '32px 28px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px' }}>

                    {/* SHOW DETAILS */}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Show details</div>
                      {[
                        { l: 'Venue', v: gig.venue },
                        { l: 'Location', v: gig.location },
                        { l: 'Date', v: gigDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
                        { l: 'Set time', v: gig.time },
                        { l: 'Fee', v: `€${gig.fee?.toLocaleString()}` },
                        { l: 'Status', v: gig.status },
                      ].map(f => (
                        <div key={f.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${s.border}`, fontSize: '12px' }}>
                          <span style={{ color: s.dimmer }}>{f.l}</span>
                          <span style={{ color: s.dim }}>{f.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* ADVANCE */}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Advance request</div>

                      {advStatus === 'complete' && (
                        <div>
                          <div style={{ fontSize: '13px', color: s.green, marginBottom: '16px' }}>✓ Advance received from promoter</div>
                          <Link href={`/advance/${gig.id}`} target="_blank" style={{ fontSize: '10px', letterSpacing: '0.12em', color: s.gold, textDecoration: 'none', textTransform: 'uppercase', border: `1px solid ${s.gold}40`, padding: '10px 18px', display: 'inline-block' }}>
                            View advance sheet →
                          </Link>
                        </div>
                      )}

                      {advStatus === 'sent' && (
                        <div>
                          <div style={{ fontSize: '13px', color: s.gold, marginBottom: '12px' }}>Sent — awaiting promoter response</div>
                          <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '16px' }}>The promoter has been sent the advance form link</div>
                          <button onClick={() => setShowEmailInput(showEmailInput === gig.id ? null : gig.id)} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                            Resend
                          </button>
                        </div>
                      )}

                      {advStatus === 'not_sent' && (
                        <div>
                          <div style={{ fontSize: '13px', color: s.dimmer, marginBottom: '16px' }}>No advance sent yet</div>
                          {showEmailInput === gig.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <input
                                value={promoterEmail}
                                onChange={e => setPromoterEmail(e.target.value)}
                                placeholder="promoter@venue.com"
                                style={{ background: s.bg, border: `1px solid ${s.borderMid}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none' }}
                              />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => sendAdvance(gig, promoterEmail)} disabled={sending === gig.id || !promoterEmail} style={{
                                  background: promoterEmail ? s.gold : 'transparent',
                                  color: promoterEmail ? '#070706' : s.dimmer,
                                  border: `1px solid ${promoterEmail ? s.gold : s.border}`,
                                  fontFamily: s.font, fontSize: '9px', letterSpacing: '0.15em',
                                  textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', gap: '8px',
                                }}>
                                  {sending === gig.id && <div style={{ width: '8px', height: '8px', border: '1px solid #070706', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                                  {sending === gig.id ? 'Sending...' : 'Send →'}
                                </button>
                                <button onClick={() => { setShowEmailInput(null); setPromoterEmail('') }} style={{ background: 'transparent', color: s.dimmer, border: `1px solid ${s.border}`, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 16px', cursor: 'pointer' }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setShowEmailInput(gig.id)} style={{
                              background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
                              border: `1px solid ${s.gold}`, color: s.gold,
                              fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em',
                              textTransform: 'uppercase', padding: '12px 22px', cursor: 'pointer',
                            }}>
                              Send advance request →
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* QUICK ACTIONS */}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Quick actions</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&venue=${encodeURIComponent(gig.venue)}&location=${encodeURIComponent(gig.location)}&date=${gig.date}`}
                          style={{ fontSize: '12px', color: s.green, textDecoration: 'none', padding: '12px 16px', border: `1px solid ${s.green}30`, display: 'block', transition: 'all 0.15s' }}>
                          Create post →
                        </Link>
                        <Link href="/contracts"
                          style={{ fontSize: '12px', color: s.gold, textDecoration: 'none', padding: '12px 16px', border: `1px solid ${s.gold}30`, display: 'block', transition: 'all 0.15s' }}>
                          Upload contract →
                        </Link>
                        <Link href="/business/finances"
                          style={{ fontSize: '12px', color: s.dimmer, textDecoration: 'none', padding: '12px 16px', border: `1px solid ${s.border}`, display: 'block', transition: 'all 0.15s' }}>
                          View invoices →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        
        {/* NET TOTAL ROW */}
        {gigs.length > 0 && (
          <div style={{
            background: s.panel,
            border: `1px solid ${s.gold}40`,
            padding: '20px 28px',
            display: 'grid',
            gridTemplateColumns: '2fr 140px 100px 180px 80px',
            alignItems: 'center',
            marginTop: '8px',
          }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: s.gold }}>NET TOTAL — Confirmed fees</div>
            <div></div>
            <div></div>
            <div></div>
            <div style={{ fontSize: '14px', color: s.gold, textAlign: 'right', fontWeight: '600' }}>
              €{gigs.filter(g => g.status === 'confirmed').reduce((sum, g) => sum + (g.fee || 0), 0).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', right: '32px', background: 'rgba(14,13,11,0.97)', border: `1px solid ${s.border}`, padding: '16px 24px', fontSize: '13px', color: s.text, zIndex: 9999, backdropFilter: 'blur(16px)' }}>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: s.gold, marginBottom: '5px', textTransform: 'uppercase' }}>Gigs</div>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
