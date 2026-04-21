'use client'

import { useState, useEffect } from 'react'

interface FlightInfo {
  flightNumber: string | null
  from: string | null
  to: string | null
  departure: string | null
  arrival: string | null
  reference: string | null
}

interface GigPassData {
  venue: string
  location: string
  date: string
  setTime: string | null
  doorsTime: string | null
  venueAddress: string | null
  promoterName: string | null
  promoterPhone: string | null
  promoterEmail: string | null
  alName: string | null
  alPhone: string | null
  driverName: string | null
  driverPhone: string | null
  driverNotes: string | null
  hotelName: string | null
  hotelAddress: string | null
  hotelReference: string | null
  hotelCheckIn: string | null
  flights: FlightInfo[]
  advanceStatus: string | null
}

interface CachedData {
  data: GigPassData
  timestamp: number
}

const CACHE_MAX_AGE = 60 * 60 * 1000 // 1 hour

function formatDateDisplay(dateStr: string): string {
  try {
    // Append T12:00 to avoid timezone shifting for date-only strings like "2026-04-10"
    const d = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  try {
    const d = new Date(timeStr)
    if (isNaN(d.getTime())) return timeStr
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return timeStr
  }
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export default function GigPassPageClient({ params }: { params: { id: string } }) {
  const id = params.id

  const [data, setData] = useState<GigPassData | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return

    const cacheKey = `gig-pass-${id}`

    async function loadData() {
      // 1. Try cached data first
      let cached: CachedData | null = null
      try {
        const raw = localStorage.getItem(cacheKey)
        if (raw) {
          cached = JSON.parse(raw) as CachedData
          const age = Date.now() - cached.timestamp
          if (age < CACHE_MAX_AGE) {
            setData(cached.data)
            setLastUpdated(cached.timestamp)
            setLoading(false)
          }
        }
      } catch {
        // corrupt cache, ignore
      }

      // 2. Fetch fresh data in parallel
      try {
        const [gigRes, travelRes, advanceRes] = await Promise.all([
          fetch(`/api/gigs/${id}`),
          fetch(`/api/gigs/${id}/travel`),
          fetch(`/api/advance?gigId=${id}`),
        ])

        if (!gigRes.ok) throw new Error('Gig fetch failed')

        const gigJson = await gigRes.json()
        const gig = gigJson.gig || gigJson // handle both { gig: {...} } and flat response
        const travel = travelRes.ok ? await travelRes.json() : {}
        const advance = advanceRes.ok ? await advanceRes.json() : {}

        const merged: GigPassData = {
          venue: gig.venue || gig.venue_name || 'Unknown Venue',
          location: gig.location || gig.city || '',
          date: gig.date || gig.gig_date || '',
          setTime: advance.set_time || gig.set_time || gig.time || null,
          doorsTime: advance.doors_time || gig.doors_time || gig.doors || null,
          venueAddress: advance.venue_address || gig.venue_address || gig.address || gig.location || null,
          promoterName: advance.promoter_name || gig.promoter_name || null,
          promoterPhone: advance.promoter_phone || gig.promoter_phone || null,
          promoterEmail: advance.promoter_email || gig.promoter_email || null,
          alName: advance.al_name || advance.artist_liaison_name || null,
          alPhone: advance.al_phone || advance.artist_liaison_phone || null,
          driverName: travel.driver_name || advance.driver_name || null,
          driverPhone: travel.driver_phone || advance.driver_phone || null,
          driverNotes: travel.driver_notes || advance.driver_notes || null,
          hotelName: travel.hotel_name || advance.hotel_name || null,
          hotelAddress: travel.hotel_address || advance.hotel_address || null,
          hotelReference: travel.hotel_reference || advance.hotel_reference || null,
          hotelCheckIn: travel.hotel_check_in || advance.hotel_check_in || null,
          flights: travel.flights || advance.flights || [],
          advanceStatus: advance.status || advance.advance_status || null,
        }

        setData(merged)
        setIsOffline(false)
        const now = Date.now()
        setLastUpdated(now)
        setLoading(false)

        // Save to cache
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data: merged, timestamp: now }))
        } catch {
          // storage full, ignore
        }
      } catch {
        // Fetch failed — offline or error
        if (cached) {
          setData(cached.data)
          setLastUpdated(cached.timestamp)
          setIsOffline(true)
          setLoading(false)
        } else {
          setData(null)
          setIsOffline(true)
          setLoading(false)
        }
      }
    }

    loadData()
  }, [id])

  // --- Styles ---
  const colors = {
    bg: '#050505',
    gold: '#ff2a1a',
    text: '#f2f2f2',
    dim: '#909090',
    dimmer: '#909090',
    green: '#3d6b4a',
    border: '#222222',
  }

  const pageStyle: React.CSSProperties = {
    background: colors.bg,
    color: colors.text,
    minHeight: '100vh',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    padding: '0 0 80px 0',
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 20px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.3em',
    textTransform: 'uppercase' as const,
    color: colors.gold,
    fontWeight: 500,
    marginBottom: 6,
  }

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: '16px 18px',
    marginBottom: 12,
  }

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 56,
    border: `1px solid ${colors.gold}`,
    borderRadius: 6,
    background: 'transparent',
    color: colors.gold,
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontSize: 16,
    fontWeight: 500,
    textDecoration: 'none',
    cursor: 'pointer',
    marginTop: 10,
  }

  const halfButtonWrap: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    marginTop: 10,
  }

  const halfButton: React.CSSProperties = {
    ...buttonStyle,
    flex: 1,
    marginTop: 0,
  }

  // --- Loading ---
  if (loading) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: colors.dim, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
            Loading gig pass...
          </div>
        </div>
      </div>
    )
  }

  // --- No data ---
  if (!data) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 20, color: colors.dim, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", lineHeight: 1.5 }}>
            No gig data available. Connect to the internet and try again.
          </div>
        </div>
      </div>
    )
  }

  // --- Advance status badge ---
  function statusBadge(status: string | null) {
    if (!status) return null
    const s = status.toLowerCase()
    let badgeBg = colors.dimmer
    let badgeColor = colors.dim
    let label = 'Not sent'
    if (s === 'complete' || s === 'completed') {
      badgeBg = colors.green
      badgeColor = colors.text
      label = 'Complete'
    } else if (s === 'sent') {
      badgeBg = 'rgba(255, 42, 26, 0.2)'
      badgeColor = colors.gold
      label = 'Sent'
    }
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: 4,
          background: badgeBg,
          color: badgeColor,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
        }}
      >
        {label}
      </span>
    )
  }

  return (
    <div style={pageStyle}>
      {/* Offline banner */}
      {isOffline && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'rgba(255, 42, 26, 0.15)',
            color: colors.gold,
            textAlign: 'center',
            padding: '10px 16px',
            fontSize: 14,
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            fontWeight: 500,
          }}
        >
          Offline · showing saved data
        </div>
      )}

      <div style={containerStyle}>
        {/* Header */}
        <div style={{ paddingTop: isOffline ? 56 : 24, paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: colors.gold, fontWeight: 500 }}>
            GIG PASS
          </div>
          <a
            href="/dashboard"
            style={{ fontSize: 14, color: colors.dim, textDecoration: 'none', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
          >
            ← Dashboard
          </a>
        </div>

        {/* Set Time — HERO */}
        {data.setTime && (
          <div style={{ marginTop: 16, marginBottom: 20 }}>
            <div style={labelStyle}>YOUR SET</div>
            <div
              className="display"
              style={{
                fontSize: 'clamp(64px, 16vw, 80px)',
                fontWeight: 800,
                color: colors.gold,
                lineHeight: 0.9,
                marginBottom: 8,
                letterSpacing: '-0.035em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatTime(data.setTime)}
            </div>
            {data.doorsTime && (
              <div style={{ fontSize: 14, color: colors.dim, marginBottom: 10 }}>Doors {formatTime(data.doorsTime)}</div>
            )}
            {data.advanceStatus && (
              <div style={{ marginTop: 4 }}>{statusBadge(data.advanceStatus)}</div>
            )}
          </div>
        )}

        {/* Venue + date (secondary) */}
        <div style={{ marginBottom: 28, borderTop: `1px solid ${colors.border}`, paddingTop: 16 }}>
          <h1
            className="display"
            style={{
              fontSize: 'clamp(24px, 6vw, 32px)',
              fontWeight: 700,
              color: colors.text,
              margin: '0 0 6px 0',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            {data.venue}
          </h1>
          <div style={{ fontSize: 15, color: colors.dim, marginBottom: 2 }}>{data.location}</div>
          <div style={{ fontSize: 15, color: colors.dim }}>{formatDateDisplay(data.date)}</div>
        </div>

        {/* Contacts */}
        <div style={{ marginBottom: 24 }}>
          {/* Promoter */}
          {data.promoterPhone && (
            <div style={cardStyle}>
              <div style={labelStyle}>PROMOTER</div>
              <div style={{ fontSize: 20, color: colors.text, marginBottom: 4 }}>{data.promoterName || 'Promoter'}</div>
              <div style={halfButtonWrap}>
                <a href={`tel:${data.promoterPhone}`} style={halfButton}>
                  Call
                </a>
                {data.promoterEmail && (
                  <a href={`mailto:${data.promoterEmail}`} style={halfButton}>
                    Email
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Artist Liaison */}
          {data.alPhone && (
            <div style={cardStyle}>
              <div style={labelStyle}>ARTIST LIAISON</div>
              <div style={{ fontSize: 20, color: colors.text, marginBottom: 4 }}>{data.alName || 'Artist Liaison'}</div>
              <div style={halfButtonWrap}>
                <a href={`tel:${data.alPhone}`} style={halfButton}>
                  Call
                </a>
              </div>
            </div>
          )}

          {/* Driver */}
          {data.driverPhone && (
            <div style={cardStyle}>
              <div style={labelStyle}>DRIVER</div>
              <div style={{ fontSize: 20, color: colors.text, marginBottom: 4 }}>{data.driverName || 'Driver'}</div>
              {data.driverNotes && (
                <div style={{ fontSize: 16, color: colors.dim, marginBottom: 8 }}>{data.driverNotes}</div>
              )}
              <div style={halfButtonWrap}>
                <a href={`tel:${data.driverPhone}`} style={halfButton}>
                  Call
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Hotel */}
        {data.hotelName && (
          <div style={{ marginBottom: 24 }}>
            <div style={labelStyle}>HOTEL</div>
            <div style={cardStyle}>
              <div style={{ fontSize: 20, color: colors.text, marginBottom: 6 }}>{data.hotelName}</div>
              {data.hotelAddress && (
                <a
                  href={mapsUrl(data.hotelAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 18, color: colors.dim, textDecoration: 'underline', display: 'block', marginBottom: 6 }}
                >
                  {data.hotelAddress}
                </a>
              )}
              {(data.hotelCheckIn || data.hotelReference) && (
                <div style={{ fontSize: 14, color: colors.dim, marginBottom: 4 }}>
                  {data.hotelCheckIn && <span>Check-in: {data.hotelCheckIn}</span>}
                  {data.hotelCheckIn && data.hotelReference && <span> &middot; </span>}
                  {data.hotelReference && <span>Ref: {data.hotelReference}</span>}
                </div>
              )}
              {data.hotelAddress && (
                <a href={mapsUrl(data.hotelAddress)} target="_blank" rel="noopener noreferrer" style={buttonStyle}>
                  Get directions
                </a>
              )}
            </div>
          </div>
        )}

        {/* Flights */}
        {data.flights && data.flights.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={labelStyle}>FLIGHTS</div>
            {data.flights.map((flight, i) => (
              <div key={i} style={cardStyle}>
                {flight.flightNumber && (
                  <div style={{ fontSize: 18, color: colors.text, marginBottom: 4 }}>{flight.flightNumber}</div>
                )}
                {(flight.from || flight.to) && (
                  <div style={{ fontSize: 16, color: colors.dim, marginBottom: 4 }}>
                    {flight.from || '?'} → {flight.to || '?'}
                  </div>
                )}
                {(flight.departure || flight.arrival) && (
                  <div style={{ fontSize: 16, color: colors.dim, marginBottom: 4 }}>
                    {flight.departure && <span>Departs {formatTime(flight.departure)}</span>}
                    {flight.departure && flight.arrival && <span> &middot; </span>}
                    {flight.arrival && <span>Arrives {formatTime(flight.arrival)}</span>}
                  </div>
                )}
                {flight.reference && (
                  <div style={{ fontSize: 14, color: colors.dimmer }}>Ref: {flight.reference}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Venue */}
        {data.venueAddress && (
          <div style={{ marginBottom: 32 }}>
            <div style={labelStyle}>VENUE</div>
            <div style={cardStyle}>
              <a
                href={mapsUrl(data.venueAddress)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 18, color: colors.dim, textDecoration: 'underline', display: 'block', marginBottom: 4 }}
              >
                {data.venueAddress}
              </a>
              <a href={mapsUrl(data.venueAddress)} target="_blank" rel="noopener noreferrer" style={buttonStyle}>
                Get directions
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 20, textAlign: 'center' }}>
          {lastUpdated && (
            <div style={{ fontSize: 14, color: colors.dimmer }}>
              Last updated: {new Date(lastUpdated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          {isOffline && (
            <span
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '4px 12px',
                borderRadius: 4,
                background: 'rgba(255, 42, 26, 0.15)',
                color: colors.gold,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
              }}
            >
              Offline · cached
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
