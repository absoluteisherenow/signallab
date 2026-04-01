'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ScanPulse } from '@/components/ui/ScanPulse'
import { PageHeader } from '@/components/ui/PageHeader'
import { ScreenshotUpload } from '@/components/ui/ScreenshotUpload'

interface TravelBooking {
  id: string
  type: 'flight' | 'train' | 'hotel'
  name: string | null
  flight_number: string | null
  from_location: string | null
  to_location: string | null
  departure_at: string | null
  arrival_at: string | null
  check_in: string | null
  check_out: string | null
  reference: string | null
  cost: number | null
  currency: string
}

interface Gig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  time: string
  status: string
  fee: number
  currency?: string
  promoter_email?: string
  promoter_phone?: string
  al_name?: string
  al_phone?: string
  al_email?: string
  driver_name?: string
  driver_phone?: string
  driver_notes?: string
}

function fmtDateTime(dt: string | null) {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function currencySymbol(c: string): string {
  const map: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CHF: 'CHF ', AUD: 'A$', CAD: 'C$', JPY: '¥' }
  return map[c] || c + ' '
}

function searchFlightsUrl(destination: string, date: string, origin?: string) {
  const city = destination.split(',')[0].trim()
  const originCode = origin ? encodeURIComponent(origin.split(',')[0].trim()) : ''
  const d = new Date(date)
  const dateStr = d.toISOString().slice(0, 10)
  return `https://www.google.com/flights#flt=${originCode}.${encodeURIComponent(city)}.${dateStr};c:EUR;e:1;s:0*1;sd:1;t:f`
}

function searchTrainsUrl(destination: string, date: string, origin?: string) {
  const city = destination.split(',')[0].trim()
  const originCity = origin ? origin.split(',')[0].trim() : ''
  return `https://www.thetrainline.com/book/results?origin=${encodeURIComponent(originCity)}&destination=${encodeURIComponent(city)}&outwardDate=${date}&outwardDateType=departing`
}

function searchHotelUrl(destination: string, checkIn: string, checkOut?: string) {
  const city = destination.split(',')[0].trim()
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkIn}${checkOut ? `&checkout=${checkOut}` : ''}&group_adults=1`
}

export default function Logistics() {
  const pathname = usePathname()
  const [gigs, setGigs] = useState<Gig[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [gigDetails, setGigDetails] = useState<Record<string, Gig>>({})
  const [travelBookings, setTravelBookings] = useState<Record<string, TravelBooking[]>>({})
  const [promoterEmail, setPromoterEmail] = useState('')
  const [showEmailInput, setShowEmailInput] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [advanceStatus, setAdvanceStatus] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')
  const [artistLocation, setArtistLocation] = useState<string>('')

  // Contacts editing
  const [editingContacts, setEditingContacts] = useState<string | null>(null)
  const [contactForm, setContactForm] = useState<Partial<Gig>>({})
  const [savingContacts, setSavingContacts] = useState(false)

  // Add travel booking
  const [addingTravel, setAddingTravel] = useState<{ gigId: string; type: 'flight' | 'train' | 'hotel' } | null>(null)
  const [travelForm, setTravelForm] = useState<Record<string, string>>({})
  const [savingTravel, setSavingTravel] = useState(false)

  useEffect(() => {
    fetch('/api/gigs')
      .then(r => r.json())
      .then(d => setGigs(d.gigs || []))
      .catch(() => setGigs([]))
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.settings?.profile?.country) setArtistLocation(d.settings.profile.country)
      })
      .catch(() => {})
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function openGig(gigId: string) {
    setSelected(gigId)
    if (!gigDetails[gigId]) {
      const [gigRes, travelRes] = await Promise.all([
        fetch(`/api/gigs/${gigId}`).then(r => r.json()),
        fetch(`/api/gigs/${gigId}/travel`).then(r => r.json()),
      ])
      if (gigRes.gig) setGigDetails(prev => ({ ...prev, [gigId]: gigRes.gig }))
      setTravelBookings(prev => ({ ...prev, [gigId]: travelRes.bookings || [] }))
    }
  }

  async function saveContacts(gigId: string) {
    setSavingContacts(true)
    try {
      const res = await fetch(`/api/gigs/${gigId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...gigDetails[gigId], ...contactForm }),
      })
      const data = await res.json()
      if (data.gig) {
        setGigDetails(prev => ({ ...prev, [gigId]: data.gig }))
        setEditingContacts(null)
        setContactForm({})
        showToast('Contacts saved')
      }
    } finally {
      setSavingContacts(false)
    }
  }

  async function saveTravel(gigId: string) {
    if (!addingTravel) return
    setSavingTravel(true)
    try {
      const res = await fetch(`/api/gigs/${gigId}/travel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: addingTravel.type, ...travelForm }),
      })
      const data = await res.json()
      if (data.booking) {
        setTravelBookings(prev => ({ ...prev, [gigId]: [...(prev[gigId] || []), data.booking] }))
        setAddingTravel(null)
        setTravelForm({})
        showToast('Booking added')
      }
    } finally {
      setSavingTravel(false)
    }
  }

  async function deleteTravel(gigId: string, bookingId: string) {
    await fetch(`/api/gigs/${gigId}/travel?bookingId=${bookingId}`, { method: 'DELETE' })
    setTravelBookings(prev => ({ ...prev, [gigId]: (prev[gigId] || []).filter(b => b.id !== bookingId) }))
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

  const inlineInput: React.CSSProperties = {
    background: 'var(--bg)',
    border: '1px solid var(--border-dim)',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    padding: '8px 10px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>

      <PageHeader
        section="Tour Lab"
        title="Travel"
        tabs={[
          { label: 'Gigs', href: '/gigs', active: pathname === '/gigs' || pathname.startsWith('/gigs/') },
          { label: 'Travel', href: '/logistics', active: pathname === '/logistics' },
          { label: 'Finances', href: '/business/finances', active: pathname === '/business/finances' },
          { label: 'Contracts', href: '/contracts', active: pathname === '/contracts' },
        ]}
      />

      <div style={{ padding: '48px 56px' }}>

      {/* ADVANCE STATUS SUMMARY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', marginBottom: '32px' }}>
        {[
          { label: 'Advances complete', value: Object.values(advanceStatus).filter(v => v === 'complete').length, color: 'var(--green)' },
          { label: 'Awaiting response', value: Object.values(advanceStatus).filter(v => v === 'sent').length, color: 'var(--gold)' },
          { label: 'Not yet sent', value: (gigs?.length ?? 0) - Object.keys(advanceStatus).length, color: 'var(--text-dimmer)' },
        ].map(stat => (
          <div key={stat.label} className="card">
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>{stat.label}</div>
            <div className="display" style={{ fontSize: '32px', color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* GIG LIST */}
      {gigs === null && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-dimmer)', fontSize: 13 }}>Loading...</div>
      )}
      {gigs !== null && gigs.length === 0 && (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.28em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: 12 }}>No gigs yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Add your first gig to start tracking logistics and advance requests.</div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {(gigs || []).map(gig => {
          const advStatus = advanceStatus[gig.id] || 'not_sent'
          const isOpen = selected === gig.id
          const gigDate = new Date(gig.date)
          const daysTo = Math.ceil((gigDate.getTime() - Date.now()) / 86400000)

          return (
            <div key={gig.id}>
              {/* ROW */}
              <div onClick={() => isOpen ? setSelected(null) : openGig(gig.id)} style={{
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
                <div style={{ background: '#0a0906', border: '1px solid rgba(176, 141, 87, 0.125)', borderTop: 'none', padding: '32px 28px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px' }}>

                    {/* SHOW DETAILS */}
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>Show details</div>
                      {[
                        { l: 'Venue', v: gig.venue },
                        { l: 'Location', v: gig.location },
                        { l: 'Date', v: gigDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
                        { l: 'Set time', v: gig.time },
                        { l: 'Fee', v: `${({'GBP':'£','USD':'$','EUR':'€','CHF':'CHF ','AUD':'A$','CAD':'C$','JPY':'¥'} as Record<string,string>)[gig.currency || 'EUR'] || '€'}${gig.fee?.toLocaleString()}` },
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
                                  {sending === gig.id && <ScanPulse size="sm" color="var(--bg)" />}
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

                  {/* TRAVEL + CONTACTS */}
                  {(() => {
                    const detail = gigDetails[gig.id] || gig
                    const bookings = travelBookings[gig.id] || []
                    const flights = bookings.filter(b => b.type === 'flight')
                    const trains = bookings.filter(b => b.type === 'train')
                    const hotels = bookings.filter(b => b.type === 'hotel')
                    const isEditingContacts = editingContacts === gig.id

                    return (
                      <div style={{ borderTop: '1px solid rgba(176,141,87,0.12)', marginTop: '28px', paddingTop: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>

                        {/* TRAVEL */}
                        <div>
                          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>Travel</div>

                          {/* Smart search links */}
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            <a href={searchFlightsUrl(gig.location, gig.date, artistLocation)} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--gold)', border: '1px solid rgba(176,141,87,0.25)', padding: '7px 14px', textDecoration: 'none', textTransform: 'uppercase' }}>
                              Search flights ↗
                            </a>
                            <a href={searchTrainsUrl(gig.location, gig.date, artistLocation)} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '7px 14px', textDecoration: 'none', textTransform: 'uppercase' }}>
                              Search trains ↗
                            </a>
                            <a href={searchHotelUrl(gig.location, gig.date)} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '7px 14px', textDecoration: 'none', textTransform: 'uppercase' }}>
                              Search hotels ↗
                            </a>
                          </div>

                          {/* Booked travel */}
                          {bookings.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                              {[...flights, ...trains, ...hotels].map(b => (
                                <div key={b.id} style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                      <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                        {b.type === 'flight' ? '✈ Flight' : b.type === 'train' ? '🚂 Train' : '🏨 Hotel'}
                                        {b.name ? ` · ${b.name}` : ''}
                                        {b.flight_number ? ` ${b.flight_number}` : ''}
                                      </div>
                                      {b.type !== 'hotel' && (b.from_location || b.to_location) && (
                                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '3px' }}>
                                          {b.from_location} → {b.to_location}
                                        </div>
                                      )}
                                      {b.type !== 'hotel' && b.departure_at && (
                                        <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>
                                          {fmtDateTime(b.departure_at)}{b.arrival_at ? ` → ${fmtDateTime(b.arrival_at)}` : ''}
                                        </div>
                                      )}
                                      {b.type === 'hotel' && (
                                        <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>
                                          {fmtDate(b.check_in)} → {fmtDate(b.check_out)}
                                        </div>
                                      )}
                                      {b.reference && (
                                        <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '3px' }}>Ref: {b.reference}</div>
                                      )}
                                      {b.cost && (
                                        <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>{b.currency} {b.cost.toLocaleString()}</div>
                                      )}
                                    </div>
                                    <button onClick={() => deleteTravel(gig.id, b.id)}
                                      style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: '14px', padding: '0 4px', lineHeight: 1 }}>
                                      ×
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add travel booking */}
                          {addingTravel?.gigId === gig.id ? (
                            <div style={{ border: '1px solid var(--border-dim)', padding: '14px', marginTop: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'var(--gold)', textTransform: 'uppercase' }}>
                                  Add {addingTravel.type}
                                </div>
                                <ScreenshotUpload
                                  extractionPrompt={
                                    addingTravel.type === 'flight'
                                      ? 'Extract flight booking details from this image. Return JSON with: name (airline), flight_number, from_location, to_location, departure_at (YYYY-MM-DDTHH:MM), arrival_at (YYYY-MM-DDTHH:MM), reference, cost (number), currency (3-letter code). Only include fields you can confidently extract.'
                                      : addingTravel.type === 'train'
                                      ? 'Extract train booking details from this image. Return JSON with: name (operator), from_location, to_location, departure_at (YYYY-MM-DDTHH:MM), arrival_at (YYYY-MM-DDTHH:MM), reference, cost (number), currency (3-letter code). Only include fields you can confidently extract.'
                                      : 'Extract hotel booking details from this image. Return JSON with: name (hotel name), check_in (YYYY-MM-DD), check_out (YYYY-MM-DD), reference, cost (number), currency (3-letter code). Only include fields you can confidently extract.'
                                  }
                                  onExtracted={fields => {
                                    setTravelForm(p => ({
                                      ...p,
                                      ...(fields.name && { name: fields.name }),
                                      ...(fields.flight_number && { flight_number: fields.flight_number }),
                                      ...(fields.from_location && { from_location: fields.from_location }),
                                      ...(fields.to_location && { to_location: fields.to_location }),
                                      ...(fields.departure_at && { departure_at: fields.departure_at }),
                                      ...(fields.arrival_at && { arrival_at: fields.arrival_at }),
                                      ...(fields.check_in && { check_in: fields.check_in }),
                                      ...(fields.check_out && { check_out: fields.check_out }),
                                      ...(fields.reference && { reference: fields.reference }),
                                      ...(fields.cost && { cost: String(fields.cost) }),
                                    }))
                                  }}
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                {addingTravel.type !== 'hotel' ? (
                                  <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                                      <input value={travelForm.name || ''} onChange={e => setTravelForm(p => ({ ...p, name: e.target.value }))} placeholder={addingTravel.type === 'flight' ? 'Airline' : 'Operator'} style={inlineInput} />
                                      {addingTravel.type === 'flight' && <input value={travelForm.flight_number || ''} onChange={e => setTravelForm(p => ({ ...p, flight_number: e.target.value }))} placeholder="FR1234" style={inlineInput} />}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                                      <input value={travelForm.from_location || ''} onChange={e => setTravelForm(p => ({ ...p, from_location: e.target.value }))} placeholder="From" style={inlineInput} />
                                      <input value={travelForm.to_location || ''} onChange={e => setTravelForm(p => ({ ...p, to_location: e.target.value }))} placeholder="To" style={inlineInput} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                                      <input value={travelForm.departure_at || ''} onChange={e => setTravelForm(p => ({ ...p, departure_at: e.target.value }))} placeholder="Depart (YYYY-MM-DDTHH:MM)" style={inlineInput} />
                                      <input value={travelForm.arrival_at || ''} onChange={e => setTravelForm(p => ({ ...p, arrival_at: e.target.value }))} placeholder="Arrive" style={inlineInput} />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <input value={travelForm.name || ''} onChange={e => setTravelForm(p => ({ ...p, name: e.target.value }))} placeholder="Hotel name" style={inlineInput} />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                                      <input value={travelForm.check_in || ''} onChange={e => setTravelForm(p => ({ ...p, check_in: e.target.value }))} placeholder="Check in (YYYY-MM-DD)" style={inlineInput} />
                                      <input value={travelForm.check_out || ''} onChange={e => setTravelForm(p => ({ ...p, check_out: e.target.value }))} placeholder="Check out" style={inlineInput} />
                                    </div>
                                  </>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                                  <input value={travelForm.reference || ''} onChange={e => setTravelForm(p => ({ ...p, reference: e.target.value }))} placeholder="Booking ref" style={inlineInput} />
                                  <input value={travelForm.cost || ''} onChange={e => setTravelForm(p => ({ ...p, cost: e.target.value }))} placeholder="Cost" style={inlineInput} />
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                <button onClick={() => saveTravel(gig.id)} disabled={savingTravel}
                                  style={{ background: 'var(--gold)', color: '#070706', border: 'none', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '9px 18px', cursor: 'pointer' }}>
                                  {savingTravel ? 'Saving...' : 'Save'}
                                </button>
                                <button onClick={() => { setAddingTravel(null); setTravelForm({}) }}
                                  style={{ background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', padding: '9px 14px', cursor: 'pointer' }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {(['flight', 'train', 'hotel'] as const).map(t => (
                                <button key={t} onClick={() => { setAddingTravel({ gigId: gig.id, type: t }); setTravelForm({}) }}
                                  style={{ background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 14px', cursor: 'pointer' }}>
                                  + {t}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* CONTACTS */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>Contacts</div>
                            {!isEditingContacts && (
                              <button onClick={() => { setEditingContacts(gig.id); setContactForm({ al_name: detail.al_name, al_phone: detail.al_phone, al_email: detail.al_email, driver_name: detail.driver_name, driver_phone: detail.driver_phone, driver_notes: detail.driver_notes, promoter_phone: detail.promoter_phone }) }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.1em', cursor: 'pointer', padding: 0 }}>
                                Edit →
                              </button>
                            )}
                          </div>

                          {isEditingContacts ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                              <div>
                                <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Artist liaison</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <input value={contactForm.al_name || ''} onChange={e => setContactForm(p => ({ ...p, al_name: e.target.value }))} placeholder="Name" style={inlineInput} />
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                    <input value={contactForm.al_phone || ''} onChange={e => setContactForm(p => ({ ...p, al_phone: e.target.value }))} placeholder="Phone" style={inlineInput} />
                                    <input value={contactForm.al_email || ''} onChange={e => setContactForm(p => ({ ...p, al_email: e.target.value }))} placeholder="Email" style={inlineInput} />
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Driver</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                    <input value={contactForm.driver_name || ''} onChange={e => setContactForm(p => ({ ...p, driver_name: e.target.value }))} placeholder="Name" style={inlineInput} />
                                    <input value={contactForm.driver_phone || ''} onChange={e => setContactForm(p => ({ ...p, driver_phone: e.target.value }))} placeholder="Phone" style={inlineInput} />
                                  </div>
                                  <input value={contactForm.driver_notes || ''} onChange={e => setContactForm(p => ({ ...p, driver_notes: e.target.value }))} placeholder="Notes (pickup time, location...)" style={inlineInput} />
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Promoter phone</div>
                                <input value={contactForm.promoter_phone || ''} onChange={e => setContactForm(p => ({ ...p, promoter_phone: e.target.value }))} placeholder="+44 7700 000000" style={inlineInput} />
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => saveContacts(gig.id)} disabled={savingContacts}
                                  style={{ background: 'var(--gold)', color: '#070706', border: 'none', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer' }}>
                                  {savingContacts ? 'Saving...' : 'Save'}
                                </button>
                                <button onClick={() => { setEditingContacts(null); setContactForm({}) }}
                                  style={{ background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', padding: '10px 14px', cursor: 'pointer' }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                              {[
                                { label: 'Artist Liaison', name: detail.al_name, phone: detail.al_phone, email: detail.al_email },
                                { label: 'Driver', name: detail.driver_name, phone: detail.driver_phone, email: null, notes: detail.driver_notes },
                                { label: 'Promoter', name: null, phone: detail.promoter_phone, email: detail.promoter_email },
                              ].map(c => (
                                <div key={c.label}>
                                  <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '6px' }}>{c.label}</div>
                                  {!c.name && !c.phone && !c.email ? (
                                    <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>Not set</div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      {c.name && <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{c.name}</div>}
                                      {c.phone && (
                                        <a href={`tel:${c.phone}`} style={{ fontSize: '12px', color: 'var(--gold)', textDecoration: 'none' }}>{c.phone}</a>
                                      )}
                                      {c.email && <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>{c.email}</div>}
                                      {c.notes && <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>{c.notes}</div>}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}
        
        {/* NET TOTAL ROW */}
        {(gigs?.length ?? 0) > 0 && (
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
              {(() => {
                const confirmed = (gigs ?? []).filter(g => g.status === 'confirmed')
                const byCurrency: Record<string, number> = {}
                confirmed.forEach(g => {
                  const c = g.currency || 'EUR'
                  byCurrency[c] = (byCurrency[c] || 0) + (g.fee || 0)
                })
                const entries = Object.entries(byCurrency)
                if (entries.length === 0) return `${currencySymbol('EUR')}0`
                return entries.map(([c, total]) => `${currencySymbol(c)}${total.toLocaleString()}`).join(' + ')
              })()}
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
    </div>
  )
}
