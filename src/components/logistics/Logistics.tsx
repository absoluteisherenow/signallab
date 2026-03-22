'use client'

import { useState } from 'react'
import Link from 'next/link'

const GIGS = [
  { id: 1, title: 'Electric Nights Festival', venue: 'Tresor Club', location: 'Berlin, Germany', date: '2026-04-15', time: '22:00', status: 'confirmed', fee: 5000 },
  { id: 2, title: 'Summer Series', venue: 'Melkweg', location: 'Amsterdam, Netherlands', date: '2026-04-22', time: '20:00', status: 'confirmed', fee: 3500 },
  { id: 3, title: 'Techno Sessions', venue: 'Ministry of Sound', location: 'London, UK', date: '2026-05-01', time: '23:00', status: 'pending', fee: 6000 },
  { id: 4, title: 'Open Air Summer', venue: 'Kaserne', location: 'Basel, Switzerland', date: '2026-05-15', time: '19:00', status: 'confirmed', fee: 7500 },
]

const ADVANCE_STATUS: Record<number, string> = {
  1: 'complete',
  2: 'sent',
  3: 'not_sent',
  4: 'not_sent',
}

export default function Logistics() {
  const [selected, setSelected] = useState<number | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const [promoterEmail, setPromoterEmail] = useState('')
  const [showEmailInput, setShowEmailInput] = useState<number | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function sendAdvance(gig: typeof GIGS[0], email: string) {
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
      if (data.success) {
        showToast(`Advance request sent to ${email}`)
        setShowEmailInput(null)
        setPromoterEmail('')
      } else {
        showToast('Error: ' + data.error)
      }
    } catch {
      showToast('Failed to send advance request')
    } finally {
      setSending(null)
    }
  }

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  const statusColor = (s: string) => s === 'complete' ? '#3d6b4a' : s === 'sent' ? '#b08d57' : '#52504c'
  const statusLabel = (s: string) => s === 'complete' ? 'Advance complete' : s === 'sent' ? 'Sent — awaiting' : 'Not sent'

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '40px 48px' }}>

      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          Signal Lab — Logistics
        </div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '28px', fontWeight: 200, letterSpacing: '0.04em' }}>Logistics</div>
        <div style={{ fontSize: '13px', color: s.dimmer, marginTop: '8px' }}>Advance requests, show logistics and contacts per gig</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {GIGS.map(gig => {
          const advStatus = ADVANCE_STATUS[gig.id] || 'not_sent'
          const isSelected = selected === gig.id
          const gigDate = new Date(gig.date)
          const daysTo = Math.ceil((gigDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

          return (
            <div key={gig.id}>
              <div
                onClick={() => setSelected(isSelected ? null : gig.id)}
                style={{
                  background: isSelected ? '#1a1917' : s.panel,
                  border: `1px solid ${isSelected ? s.gold + '40' : s.border}`,
                  padding: '20px 28px',
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: '2fr 160px 120px 160px auto',
                  alignItems: 'center',
                  gap: '0',
                  transition: 'all 0.15s',
                }}>
                <div>
                  <div style={{ fontSize: '14px', color: s.text, marginBottom: '3px' }}>{gig.title}</div>
                  <div style={{ fontSize: '11px', color: s.dimmer }}>{gig.venue} · {gig.location}</div>
                </div>
                <div style={{ fontSize: '12px', color: s.dim }}>
                  {gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {gig.time}
                </div>
                <div>
                  <span style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: gig.status === 'confirmed' ? '#3d6b4a' : '#8a6a3a', background: gig.status === 'confirmed' ? '#3d6b4a20' : '#8a6a3a20', padding: '4px 10px' }}>
                    {gig.status}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor(advStatus) }} />
                  <span style={{ fontSize: '11px', color: statusColor(advStatus) }}>{statusLabel(advStatus)}</span>
                </div>
                <div style={{ fontSize: '11px', color: s.dimmer }}>{daysTo}d →</div>
              </div>

              {/* EXPANDED LOGISTICS */}
              {isSelected && (
                <div style={{ background: '#0a0908', border: `1px solid ${s.gold + '20'}`, borderTop: 'none', padding: '28px 28px 28px 28px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '28px' }}>

                    {/* Show details */}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Show details</div>
                      {[
                        { l: 'Venue', v: gig.venue },
                        { l: 'Location', v: gig.location },
                        { l: 'Date', v: gigDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
                        { l: 'Set time', v: gig.time },
                        { l: 'Fee', v: `€${gig.fee.toLocaleString()}` },
                      ].map(f => (
                        <div key={f.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${s.border}`, fontSize: '12px' }}>
                          <span style={{ color: s.dimmer }}>{f.l}</span>
                          <span style={{ color: s.dim }}>{f.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Advance status */}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Advance</div>
                      {advStatus === 'complete' ? (
                        <div>
                          <div style={{ fontSize: '12px', color: '#3d6b4a', marginBottom: '12px' }}>Advance received from promoter</div>
                          <Link href={`/advance/${gig.id}`} target="_blank" style={{ fontSize: '10px', letterSpacing: '0.12em', color: s.gold, textDecoration: 'none', textTransform: 'uppercase', border: `1px solid ${s.gold + '40'}`, padding: '8px 16px' }}>
                            View advance sheet →
                          </Link>
                        </div>
                      ) : advStatus === 'sent' ? (
                        <div>
                          <div style={{ fontSize: '12px', color: s.gold, marginBottom: '12px' }}>Request sent — awaiting response</div>
                          <button onClick={() => setShowEmailInput(gig.id)} style={{ fontSize: '10px', letterSpacing: '0.12em', color: s.dimmer, background: 'transparent', border: `1px solid ${s.border}`, fontFamily: s.font, textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                            Resend
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: '12px', color: s.dimmer, marginBottom: '16px' }}>No advance sent yet</div>
                          {showEmailInput === gig.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <input value={promoterEmail} onChange={e => setPromoterEmail(e.target.value)}
                                placeholder="promoter@venue.com"
                                style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '10px 14px', outline: 'none' }} />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => sendAdvance(gig, promoterEmail)} disabled={sending === gig.id} style={{ background: s.gold, color: '#070706', border: 'none', fontFamily: s.font, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 18px', cursor: 'pointer' }}>
                                  {sending === gig.id ? 'Sending...' : 'Send'}
                                </button>
                                <button onClick={() => setShowEmailInput(null)} style={{ background: 'transparent', color: s.dimmer, border: `1px solid ${s.border}`, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 18px', cursor: 'pointer' }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setShowEmailInput(gig.id)} style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: `1px solid ${s.gold}`, color: s.gold, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer' }}>
                              Send advance request →
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Quick actions */}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Quick actions</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&venue=${encodeURIComponent(gig.venue)}&location=${encodeURIComponent(gig.location)}&date=${gig.date}`}
                          style={{ fontSize: '11px', color: '#3d6b4a', textDecoration: 'none', padding: '10px 16px', border: '1px solid #3d6b4a30', display: 'block' }}>
                          Create post →
                        </Link>
                        <Link href="/gigs" style={{ fontSize: '11px', color: s.dimmer, textDecoration: 'none', padding: '10px 16px', border: `1px solid ${s.border}`, display: 'block' }}>
                          View full gig →
                        </Link>
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
        <div style={{ position: 'fixed', bottom: '28px', right: '28px', background: 'rgba(14,13,11,0.96)', border: `1px solid ${s.border}`, padding: '14px 20px', fontSize: '12px', color: s.text, zIndex: 50, backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: s.gold, marginBottom: '4px', textTransform: 'uppercase' }}>Logistics</div>
          {toast}
        </div>
      )}
    </div>
  )
}
