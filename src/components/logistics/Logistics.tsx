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

// CSS variables are used instead of a local styles object
// See globals.css for the design system

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
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh', padding: '48px 56px' }}>

      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: 'var(--gold)' }} />
          Tour Lab — Gigs
        </div>
        <div className="display" style={{ fontSize: '36px', letterSpacing: '0.03em', marginBottom: '8px' }}>
          Gigs
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-dimmer)' }}>All shows, advance requests and logistics</div>
      </div>

      {/* ADVANCE STATUS SUMMARY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', marginBottom: '32px' }}>
        {[
          { label: 'Advances complete', value: Object.values(advanceStatus).filter(v => v === 'complete').length, color: 'var(--green)' },
          { label: 'Awaiting response', value: Object.values(advanceStatus).filter(v => v === 'sent').length, color: 'var(--gold)' },
          { label: 'Not yet sent', value: gigs.length - Object.keys(advanceStatus).length, color: 'var(--text-dimmer)' },
        ].map(stat => (
          <div key={stat.label} className="card">
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>{stat.label}</div>
            <div className="display" style={{ fontSize: '32px', color: stat.color }}>{stat.value}</div>
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
                background: isOpen ? '#141310' : 'var(--panel)',
                border: `1px solid ${isOpen ? 'rgba(176, 141, 87, 0.25)' : 'var(--border-dim)'}`,
                padding: '20px 28px',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '2fr 140px 100px 180px 80px',
                alignItems: 'center',
                transition: 'all 0.15s',
              }}>
                <div>
                  <div style={{ fontSize: '15px', color: 'var(--text)', marginBottom: '3px' }}>{gig.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{gig.venue} · {gig.location}</div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                  {gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {gig.time}
                </div>
                <div>
                  <span style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: gig.status === 'confirmed' ? 'var(--green)' : '#8a6a3a', background: gig.status === 'confirmed' ? 'rgba(61, 107, 74, 0.1)' : 'rgba(138, 106, 58, 0.1)', padding: '4px 10px' }}>
                    {gig.status}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor(advStatus), flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: statusColor(advStatus) }}>{statusLabel(advStatus)}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', textAlign: 'right' }}>
                  {daysTo > 0 ? `${daysTo}d →` : 'Past'}
                </div>
              </div>

              {/* EXPANDED */}
              {isOpen && (
                <div style={{ background: '#0a0906', border: 'rgba(176, 141, 87, 0.125)', borderTop: 'none', padding: '32px 28px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px' }}>

                    {/* SHOW DETAILS */}
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>Show details</div>
                      {[
                        { l: 'Venue', v: gig.venue },
                        { l: 'Location', v: gig.location },
                        { l: 'Date', v: gigDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
                        { l: 'Set time', v: gig.time },
                        { l: 'Fee', v: `€${gig.fee?.toLocaleString()}` },
                        { l: 'Status', v: gig.status },
                      ].map(f => (
                        <div key={f.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border-dim)', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-dimmer)' }}>{f.l}</span>
                          <span style={{ color: 'var(--text-dim)' }}>{f.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* ADVANCE */}
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>Advance request</div>

                      {advStatus === 'complete' && (
                        <div>
                          <div style={{ fontSize: '13px', color: 'var(--green)', marginBottom: '16px' }}>✓ Advance received from promoter</div>
                          <Link href={`/advance/${gig.id}`} target="_blank" style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--gold)', textDecoration: 'none', textTransform: 'uppercase', border: 'rgba(176, 141, 87, 0.25)', padding: '10px 18px', display: 'inline-block' }}>
                            View advance sheet →
                          </Link>
                        </div>
                      )}

                      {advStatus === 'sent' && (
                        <div>
                          <div style={{ fontSize: '13px', color: 'var(--gold)', marginBottom: '12px' }}>Sent — awaiting promoter response</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '16px' }}>The promoter has been sent the advance form link</div>
                          <button onClick={() => setShowEmailInput(showEmailInput === gig.id ? null : gig.id)} className="btn-secondary" style={{ fontSize: '10px', padding: '8px 16px' }}>
                            Resend
                          </button>
                        </div>
                      )}

                      {advStatus === 'not_sent' && (
                        <div>
                          <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginBottom: '16px' }}>No advance sent yet</div>
                          {showEmailInput === gig.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <input
                                value={promoterEmail}
                                onChange={e => setPromoterEmail(e.target.value)}
                                placeholder="promoter@venue.com"
                                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none' }}
                              />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => sendAdvance(gig, promoterEmail)} disabled={sending === gig.id || !promoterEmail} className="btn-primary" style={{
                                  fontSize: '10px', padding: '10px 20px', opacity: !promoterEmail ? 0.4 : 1, cursor: !promoterEmail ? 'not-allowed' : 'pointer',
                                  display: 'flex', alignItems: 'center', gap: '8px',
                                }}>
                                  {sending === gig.id && <div style={{ width: '8px', height: '8px', border: '1px solid var(--bg)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                                  {sending === gig.id ? 'Sending...' : 'Send →'}
                                </button>
                                <button onClick={() => { setShowEmailInput(null); setPromoterEmail('') }} className="btn-secondary" style={{ fontSize: '10px', padding: '10px 16px' }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setShowEmailInput(gig.id)} className="btn-gold" style={{
                              fontSize: '10px', padding: '12px 22px',
                            }}>
                              Send advance request →
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* QUICK ACTIONS */}
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>Quick actions</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&venue=${encodeURIComponent(gig.venue)}&location=${encodeURIComponent(gig.location)}&date=${gig.date}`}
                          style={{ fontSize: '12px', color: 'var(--green)', textDecoration: 'none', padding: '12px 16px', border: 'rgba(61, 107, 74, 0.19)', display: 'block', transition: 'all 0.15s' }}>
                          Create post →
                        </Link>
                        <Link href="/contracts"
                          style={{ fontSize: '12px', color: 'var(--gold)', textDecoration: 'none', padding: '12px 16px', border: 'rgba(176, 141, 87, 0.19)', display: 'block', transition: 'all 0.15s' }}>
                          Upload contract →
                        </Link>
                        <Link href="/business/finances"
                          style={{ fontSize: '12px', color: 'var(--text-dimmer)', textDecoration: 'none', padding: '12px 16px', border: '1px solid var(--border-dim)', display: 'block', transition: 'all 0.15s' }}>
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
            background: 'var(--panel)',
            border: 'rgba(176, 141, 87, 0.25)',
            padding: '20px 28px',
            display: 'grid',
            gridTemplateColumns: '2fr 140px 100px 180px 80px',
            alignItems: 'center',
            marginTop: '8px',
          }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--gold)' }}>NET TOTAL — Confirmed fees</div>
            <div></div>
            <div></div>
            <div></div>
            <div style={{ fontSize: '14px', color: 'var(--gold)', textAlign: 'right', fontWeight: '600' }}>
              €{gigs.filter(g => g.status === 'confirmed').reduce((sum, g) => sum + (g.fee || 0), 0).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="toast">
          <div className="toast-label">Gigs</div>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
