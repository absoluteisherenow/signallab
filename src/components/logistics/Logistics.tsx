'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ScanPulse } from '@/components/ui/ScanPulse'
import { PageHeader } from '@/components/ui/PageHeader'
import { ScreenshotUpload } from '@/components/ui/ScreenshotUpload'
import { BlurredAmount } from '@/components/ui/BlurredAmount'

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
  // Advance email preview state — HARD RULE: preview-then-confirm.
  const [advancePreview, setAdvancePreview] = useState<{ gig: Gig; email: string; subject: string; html: string } | null>(null)
  const [advanceStatus, setAdvanceStatus] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')
  const [artistLocation, setArtistLocation] = useState<string>('')

  // All travel bookings (for dashboard view)
  const [allTravel, setAllTravel] = useState<(TravelBooking & { gig_title?: string; gig_venue?: string; gig_date?: string; gig_id?: string })[]>([])

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
    // Fetch all travel bookings
    fetch('/api/travel')
      .then(r => r.json())
      .then(d => setAllTravel(d.bookings || []))
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

  // Preview-then-confirm flow. HARD RULE: nothing outbound sends without
  // Anthony seeing a full rendered preview + explicit go.
  async function previewAdvance(gig: Gig, email: string) {
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
      if (data.preview) {
        setAdvancePreview({ gig, email, subject: data.subject, html: data.html })
      } else {
        showToast('Error: ' + (data.error || 'Failed to generate preview'))
      }
    } catch {
      showToast('Failed to generate preview')
    } finally {
      setSending(null)
    }
  }

  async function confirmAdvanceSend() {
    if (!advancePreview) return
    const { gig, email } = advancePreview
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
          confirmed: true,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAdvanceStatus(prev => ({ ...prev, [gig.id]: 'sent' }))
        setShowEmailInput(null)
        setPromoterEmail('')
        setAdvancePreview(null)
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

  const statusColor = (s: string) => s === 'complete' ? '#f2f2f2' : s === 'sent' ? '#ff2a1a' : '#909090'
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

      {/* UPCOMING TRAVEL */}
      {(() => {
        const todayStr = new Date().toISOString().slice(0, 10)
        const upcomingGigs = (gigs || []).filter(g => g.date >= todayStr && g.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date))
        const upcomingFlights = allTravel.filter(b => b.type === 'flight')
        const upcomingHotels = allTravel.filter(b => b.type === 'hotel')
        const upcomingTrains = allTravel.filter(b => b.type === 'train')
        const gigsNeedingTravel = upcomingGigs.filter(g => {
          const hasBooking = allTravel.some(b => b.gig_id === g.id)
          return !hasBooking
        })

        return (
          <>
            {/* TRAVEL STATS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginBottom: '32px' }}>
              {[
                { label: 'Upcoming flights', value: upcomingFlights.length, color: upcomingFlights.length > 0 ? 'var(--gold)' : 'var(--text-dimmer)' },
                { label: 'Hotels booked', value: upcomingHotels.length, color: upcomingHotels.length > 0 ? 'var(--green)' : 'var(--text-dimmer)' },
                { label: 'Train journeys', value: upcomingTrains.length, color: upcomingTrains.length > 0 ? 'var(--text)' : 'var(--text-dimmer)' },
                { label: 'Gigs needing travel', value: gigsNeedingTravel.length, color: gigsNeedingTravel.length > 0 ? '#c9614a' : 'var(--green)' },
              ].map(stat => (
                <div key={stat.label} className="card">
                  <div style={{ fontSize: '10px', letterSpacing: '0.22em', fontWeight: 700, color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>{stat.label}</div>
                  <div className="display" style={{ fontSize: '32px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.035em', lineHeight: 0.9, color: stat.color }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* BOOKED TRAVEL TIMELINE */}
            {allTravel.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.22em', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>Booked travel</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {allTravel.map(b => (
                    <div key={b.id} style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '16px 24px', display: 'grid', gridTemplateColumns: '32px 1fr 200px 160px', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '18px' }}>
                        {b.type === 'flight' ? '✈' : b.type === 'train' ? '🚂' : '🏨'}
                      </span>
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '2px' }}>
                          {b.name || (b.type === 'flight' ? 'Flight' : b.type === 'train' ? 'Train' : 'Hotel')}
                          {b.flight_number ? ` ${b.flight_number}` : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>
                          {b.type !== 'hotel' && (b.from_location || b.to_location) && `${b.from_location} → ${b.to_location}`}
                          {b.type === 'hotel' && `${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}`}
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>
                        {b.type !== 'hotel' && b.departure_at && fmtDateTime(b.departure_at)}
                        {b.type === 'hotel' && b.check_in && `Check-in ${fmtDate(b.check_in)}`}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {b.gig_title && (
                          <div style={{ fontSize: '10px', color: 'var(--gold)', letterSpacing: '0.1em' }}>
                            {b.gig_venue || b.gig_title}
                            {b.gig_date && ` · ${new Date(b.gig_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                          </div>
                        )}
                        {b.reference && <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)' }}>Ref: {b.reference}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* QUICK SEARCH — GIGS NEEDING TRAVEL */}
            {gigsNeedingTravel.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#c9614a', textTransform: 'uppercase', marginBottom: '16px' }}>Needs booking</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {gigsNeedingTravel.slice(0, 5).map(gig => {
                    const gigDate = new Date(gig.date)
                    const daysTo = Math.ceil((gigDate.getTime() - Date.now()) / 86400000)
                    return (
                      <div key={gig.id} style={{ background: 'var(--panel)', border: '1px solid rgba(201, 97, 74, 0.15)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '2px' }}>{gig.venue || gig.title}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>
                            {gig.location} · {gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {daysTo}d away
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <a href={searchFlightsUrl(gig.location, gig.date, artistLocation)} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--gold)', border: '1px solid rgba(255,42,26,0.25)', padding: '6px 12px', textDecoration: 'none', textTransform: 'uppercase' }}>
                            Flights ↗
                          </a>
                          <a href={searchTrainsUrl(gig.location, gig.date, artistLocation)} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '6px 12px', textDecoration: 'none', textTransform: 'uppercase' }}>
                            Trains ↗
                          </a>
                          <a href={searchHotelUrl(gig.location, gig.date)} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '6px 12px', textDecoration: 'none', textTransform: 'uppercase' }}>
                            Hotels ↗
                          </a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* GIG LIST — EXPAND FOR DETAILS */}
      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '12px' }}>All gigs — expand for travel & contacts</div>
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
        {(gigs || []).filter(g => g.date >= new Date().toISOString().slice(0, 10)).map(gig => {
          const advStatus = advanceStatus[gig.id] || 'not_sent'
          const isOpen = selected === gig.id
          const gigDate = new Date(gig.date)
          const daysTo = Math.ceil((gigDate.getTime() - Date.now()) / 86400000)
          const gigTravel = allTravel.filter(b => b.gig_id === gig.id)
          const hasFlight = gigTravel.some(b => b.type === 'flight')
          const hasTrain = gigTravel.some(b => b.type === 'train')
          const hasHotel = gigTravel.some(b => b.type === 'hotel')
          const travelIcons = [hasFlight && '✈', hasTrain && '🚂', hasHotel && '🏨'].filter(Boolean).join(' ')

          return (
            <div key={gig.id}>
              {/* ROW */}
              <div onClick={() => isOpen ? setSelected(null) : openGig(gig.id)} style={{
                background: isOpen ? '#141310' : 'var(--panel)',
                border: `1px solid ${isOpen ? 'rgba(255, 42, 26, 0.25)' : 'var(--border-dim)'}`,
                padding: '20px 28px',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '2fr 140px 160px 80px',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {travelIcons ? (
                    <span style={{ fontSize: '14px' }}>{travelIcons}</span>
                  ) : (
                    <span style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#c9614a', textTransform: 'uppercase' }}>No travel booked</span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', textAlign: 'right' }}>
                  {daysTo > 0 ? `${daysTo}d →` : 'Past'}
                </div>
              </div>

              {/* EXPANDED */}
              {isOpen && (
                <div style={{ background: '#0a0906', border: '1px solid rgba(255, 42, 26, 0.125)', borderTop: 'none', padding: '32px 28px' }}>

                  {/* SEARCH LINKS — prominent at top */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap' }}>
                    <a href={searchFlightsUrl(gig.location, gig.date, artistLocation)} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--gold)', border: '1px solid rgba(255,42,26,0.3)', padding: '10px 20px', textDecoration: 'none', textTransform: 'uppercase', background: 'rgba(255,42,26,0.06)' }}>
                      ✈ Search flights to {gig.location?.split(',')[0]} ↗
                    </a>
                    <a href={searchTrainsUrl(gig.location, gig.date, artistLocation)} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--text-dim)', border: '1px solid var(--border-dim)', padding: '10px 20px', textDecoration: 'none', textTransform: 'uppercase' }}>
                      🚂 Search trains ↗
                    </a>
                    <a href={searchHotelUrl(gig.location, gig.date)} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--text-dim)', border: '1px solid var(--border-dim)', padding: '10px 20px', textDecoration: 'none', textTransform: 'uppercase' }}>
                      🏨 Search hotels ↗
                    </a>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px' }}>

                    {/* SHOW DETAILS */}
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>Show details</div>
                      {[
                        { l: 'Venue', v: gig.venue },
                        { l: 'Location', v: gig.location },
                        { l: 'Date', v: gigDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
                        { l: 'Set time', v: gig.time },
                        { l: 'Fee', v: <BlurredAmount>{({'GBP':'£','USD':'$','EUR':'€','CHF':'CHF ','AUD':'A$','CAD':'C$','JPY':'¥'} as Record<string,string>)[gig.currency || 'EUR'] || '€'}{gig.fee?.toLocaleString()}</BlurredAmount> },
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
                          <Link href={`/advance/${gig.id}`} target="_blank" style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--gold)', textDecoration: 'none', textTransform: 'uppercase', border: 'rgba(255, 42, 26, 0.25)', padding: '10px 18px', display: 'inline-block' }}>
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
                                <button onClick={() => previewAdvance(gig, promoterEmail)} disabled={sending === gig.id || !promoterEmail} className="btn-primary" style={{
                                  fontSize: '10px', padding: '10px 20px', opacity: !promoterEmail ? 0.4 : 1, cursor: !promoterEmail ? 'not-allowed' : 'pointer',
                                  display: 'flex', alignItems: 'center', gap: '8px',
                                }}>
                                  {sending === gig.id && <ScanPulse size="sm" color="var(--bg)" />}
                                  {sending === gig.id ? 'Loading preview...' : 'Preview email →'}
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
                          style={{ fontSize: '12px', color: 'var(--green)', textDecoration: 'none', padding: '12px 16px', border: 'rgba(242, 242, 242, 0.19)', display: 'block', transition: 'all 0.15s' }}>
                          Create post →
                        </Link>
                        <Link href="/contracts"
                          style={{ fontSize: '12px', color: 'var(--gold)', textDecoration: 'none', padding: '12px 16px', border: 'rgba(255, 42, 26, 0.19)', display: 'block', transition: 'all 0.15s' }}>
                          Upload contract →
                        </Link>
                        <Link href="/business/finances"
                          style={{ fontSize: '12px', color: 'var(--text-dimmer)', textDecoration: 'none', padding: '12px 16px', border: '1px solid var(--border-dim)', display: 'block', transition: 'all 0.15s' }}>
                          View invoices →
                        </Link>
                        <Link href={`/advance/${gig.id}`} target="_blank"
                          style={{ fontSize: '12px', color: 'var(--text-dimmer)', textDecoration: 'none', padding: '12px 16px', border: '1px solid var(--border-dim)', display: 'block', transition: 'all 0.15s' }}>
                          Preview advance form →
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
                      <div style={{ borderTop: '1px solid rgba(255,42,26,0.12)', marginTop: '28px', paddingTop: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>

                        {/* TRAVEL */}
                        <div>
                          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>Travel</div>

                          {/* Smart search links */}
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            <a href={searchFlightsUrl(gig.location, gig.date, artistLocation)} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--gold)', border: '1px solid rgba(255,42,26,0.25)', padding: '7px 14px', textDecoration: 'none', textTransform: 'uppercase' }}>
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
                                        <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}><BlurredAmount>{b.currency} {b.cost.toLocaleString()}</BlurredAmount></div>
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
                                  style={{ background: 'var(--gold)', color: '#050505', border: 'none', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '9px 18px', cursor: 'pointer' }}>
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
                                  style={{ background: 'var(--gold)', color: '#050505', border: 'none', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer' }}>
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
            border: 'rgba(255, 42, 26, 0.25)',
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

      {/* Advance email preview modal — HARD RULE: preview before send */}
      {advancePreview && (
        <div onClick={() => setAdvancePreview(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg)', border: '1px solid var(--border)', maxWidth: 720, width: '100%',
            maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 6 }}>Preview · review before send</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                  TO: {advancePreview.email}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  SUBJECT: {advancePreview.subject}
                </div>
              </div>
              <button onClick={() => setAdvancePreview(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 0, background: '#050505' }}>
              <div dangerouslySetInnerHTML={{ __html: advancePreview.html }} />
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-dim)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAdvancePreview(null)} className="btn-secondary" style={{ fontSize: 11, padding: '10px 18px' }}>
                Cancel
              </button>
              <button onClick={confirmAdvanceSend} disabled={sending === advancePreview.gig.id} className="btn-primary" style={{ fontSize: 11, padding: '10px 22px', display: 'flex', alignItems: 'center', gap: 8 }}>
                {sending === advancePreview.gig.id && <ScanPulse size="sm" color="var(--bg)" />}
                {sending === advancePreview.gig.id ? 'Sending...' : 'Approve & send →'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}
