'use client'

import { useState, useEffect, useMemo } from 'react'

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
  notes: string | null
}

interface GigDayTimelineProps {
  gig: {
    venue: string
    location: string
    date: string
    time: string
    set_time?: string
    set_length?: number
    doors_time?: string
    venue_address?: string
    al_name?: string
    al_phone?: string
    promoter_email?: string
    promoter_phone?: string
    driver_name?: string
    driver_phone?: string
  }
  travelBookings: TravelBooking[]
  compact?: boolean
}

interface Waypoint {
  id: string
  datetime: Date
  timeLabel: string
  label: string
  detail?: string
  detailLink?: string
  isHero: boolean
  phone?: string
}

function parseTimeToDate(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hours, minutes] = timeStr.split(':').map(Number)
  const d = new Date(year, month - 1, day, hours, minutes)
  // Handle times past midnight (e.g. 01:30 set time means next day)
  return d
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return 'now'
  const totalMinutes = Math.floor(diffMs / 60000)
  if (totalMinutes <= 15) return 'now'
  if (totalMinutes < 60) return `in ${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (mins === 0) return `in ${hours}h`
  return `in ${hours}h ${mins}m`
}

function googleMapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export default function GigDayTimeline({ gig, travelBookings, compact = false }: GigDayTimelineProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const waypoints = useMemo(() => {
    const points: Waypoint[] = []

    // Flights
    travelBookings
      .filter((b) => b.type === 'flight' && b.arrival_at)
      .forEach((b) => {
        const dt = new Date(b.arrival_at!)
        const detail =
          b.from_location && b.to_location
            ? `${b.from_location} \u2192 ${b.to_location}`
            : b.to_location || undefined
        points.push({
          id: `flight-${b.id}`,
          datetime: dt,
          timeLabel: formatTime(dt),
          label: b.flight_number ? `${b.flight_number} lands` : 'Flight lands',
          detail,
          isHero: false,
        })
      })

    // Hotels
    travelBookings
      .filter((b) => b.type === 'hotel' && b.check_in)
      .forEach((b) => {
        const dt = new Date(b.check_in!)
        points.push({
          id: `hotel-${b.id}`,
          datetime: dt,
          timeLabel: formatTime(dt),
          label: 'Check in',
          detail: b.name || undefined,
          detailLink: b.name ? googleMapsLink(b.name) : undefined,
          isHero: false,
        })
      })

    // Doors
    if (gig.doors_time) {
      const dt = parseTimeToDate(gig.date, gig.doors_time)
      points.push({
        id: 'doors',
        datetime: dt,
        timeLabel: gig.doors_time,
        label: 'Doors',
        isHero: false,
      })
    }

    // Set time (hero)
    const setTimeStr = gig.set_time || gig.time
    if (setTimeStr) {
      const dt = parseTimeToDate(gig.date, setTimeStr)
      // If set time is before doors, it's likely past midnight — shift to next day
      if (gig.doors_time) {
        const doorsDate = parseTimeToDate(gig.date, gig.doors_time)
        if (dt < doorsDate) {
          dt.setDate(dt.getDate() + 1)
        }
      }
      points.push({
        id: 'set',
        datetime: dt,
        timeLabel: setTimeStr,
        label: 'YOUR SET',
        detail: gig.venue + (gig.venue_address ? ` \u00b7 ${gig.location}` : ''),
        isHero: true,
      })

      // Set end
      if (gig.set_length) {
        const endDt = new Date(dt.getTime() + gig.set_length * 60000)
        points.push({
          id: 'set-end',
          datetime: endDt,
          timeLabel: formatTime(endDt),
          label: 'Set ends',
          isHero: false,
        })
      }
    }

    points.sort((a, b) => a.datetime.getTime() - b.datetime.getTime())
    return points
  }, [gig, travelBookings])

  // Determine status of each waypoint
  const currentIndex = waypoints.findIndex((w) => w.datetime.getTime() >= now.getTime())

  // Contacts
  const contacts: { name: string; phone: string; role: string }[] = []
  if (gig.al_name && gig.al_phone) {
    contacts.push({ name: gig.al_name, phone: gig.al_phone, role: 'Artist Liaison' })
  }
  if (gig.promoter_phone) {
    contacts.push({ name: 'Promoter', phone: gig.promoter_phone, role: 'Promoter' })
  }
  if (gig.driver_name && gig.driver_phone) {
    contacts.push({ name: gig.driver_name, phone: gig.driver_phone, role: 'Driver' })
  }

  const pulseKeyframes = `
    @keyframes timelinePulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255, 42, 26, 0.4); }
      50% { box-shadow: 0 0 0 8px rgba(255, 42, 26, 0); }
    }
  `

  return (
    <div style={{ color: 'var(--text, #f2f2f2)' }}>
      <style>{pulseKeyframes}</style>

      <div style={{ position: 'relative' }}>
        {waypoints.map((wp, i) => {
          const isPast = currentIndex === -1 || i < currentIndex
          const isCurrent = i === currentIndex
          const isFuture = currentIndex !== -1 && i > currentIndex

          const diffMs = wp.datetime.getTime() - now.getTime()

          return (
            <div
              key={wp.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                position: 'relative',
                paddingBottom: i < waypoints.length - 1 ? 28 : 0,
                minHeight: compact ? 44 : undefined,
              }}
            >
              {/* Time column */}
              <div
                style={{
                  width: compact ? 56 : 52,
                  flexShrink: 0,
                  textAlign: 'right',
                  paddingRight: 12,
                  paddingTop: wp.isHero ? 0 : 1,
                  fontSize: wp.isHero ? (compact ? 20 : 18) : (compact ? 16 : 13),
                  fontWeight: wp.isHero ? 800 : 700,
                  color: wp.isHero ? 'var(--gold, #ff2a1a)' : 'var(--text-dim, #909090)',
                  letterSpacing: wp.isHero ? '-0.035em' : '0.04em',
                  textTransform: wp.isHero ? 'uppercase' : undefined,
                  lineHeight: wp.isHero ? 0.9 : undefined,
                }}
              >
                {wp.timeLabel}
              </div>

              {/* Dot + vertical line */}
              <div
                style={{
                  width: 20,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                }}
              >
                {/* Vertical line segment above (except first) */}
                {i > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -28,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 2,
                      height: 28,
                      backgroundColor: 'var(--border-dim, #222222)',
                    }}
                  />
                )}

                {/* Dot */}
                {isPast ? (
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      color: 'var(--text-dimmer, #909090)',
                      marginTop: 3,
                    }}
                  >
                    &#10003;
                  </div>
                ) : isCurrent ? (
                  <div
                    style={{
                      width: wp.isHero ? 14 : 10,
                      height: wp.isHero ? 14 : 10,
                      borderRadius: '50%',
                      backgroundColor: 'var(--gold, #ff2a1a)',
                      marginTop: wp.isHero ? 1 : 3,
                      animation: 'timelinePulse 2s ease-in-out infinite',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: 'transparent',
                      border: '2px solid var(--border-dim, #222222)',
                      marginTop: 3,
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>

              {/* Content column */}
              <div style={{ flex: 1, paddingLeft: 8, minHeight: compact ? 44 : undefined, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div
                  style={{
                    fontSize: wp.isHero ? (compact ? 18 : 16) : 13,
                    fontWeight: wp.isHero ? 800 : 700,
                    color: wp.isHero ? 'var(--gold, #ff2a1a)' : 'var(--text, #f2f2f2)',
                    letterSpacing: wp.isHero ? '-0.035em' : '0.04em',
                    textTransform: wp.isHero ? 'uppercase' : undefined,
                    lineHeight: wp.isHero ? 0.9 : undefined,
                  }}
                >
                  {wp.label}
                </div>

                {!compact && wp.detail && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim, #909090)', marginTop: 2 }}>
                    {wp.detailLink ? (
                      <a
                        href={wp.detailLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--text-dim, #909090)',
                          textDecoration: 'none',
                        }}
                      >
                        {wp.detail} &#8599;
                      </a>
                    ) : (
                      wp.detail
                    )}
                  </div>
                )}

                {isCurrent && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--gold, #ff2a1a)',
                      letterSpacing: '0.15em',
                      marginTop: 4,
                      textTransform: 'uppercase',
                    }}
                  >
                    {formatCountdown(diffMs)}
                  </div>
                )}

                {wp.phone && (
                  <a
                    href={`tel:${wp.phone}`}
                    style={{
                      color: 'var(--gold, #ff2a1a)',
                      textDecoration: 'none',
                      fontSize: 12,
                      marginTop: 2,
                      display: 'inline-block',
                      minHeight: compact ? 44 : undefined,
                      lineHeight: compact ? '44px' : undefined,
                    }}
                  >
                    {wp.phone}
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Contacts section */}
      {contacts.length > 0 && (
        <div style={{ marginTop: 32, borderTop: '1px solid var(--border-dim, rgba(46,44,41,0.6))', paddingTop: 20 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.22em',
              textTransform: 'uppercase' as const,
              color: 'var(--text-dim, #909090)',
              marginBottom: 14,
              fontWeight: 700,
            }}
          >
            Contacts
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: compact ? 'column' : 'row',
              gap: compact ? 16 : 24,
              flexWrap: 'wrap',
            }}
          >
            {contacts.map((c) => (
              <div key={c.phone} style={{ minHeight: compact ? 44 : undefined }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim, #909090)', marginBottom: 2 }}>
                  {c.role}
                </div>
                <a
                  href={`tel:${c.phone}`}
                  style={{
                    color: 'var(--gold, #ff2a1a)',
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 400,
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: compact ? 44 : undefined,
                    gap: 6,
                  }}
                >
                  {c.name} &middot; {c.phone}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
