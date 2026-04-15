'use client'

/**
 * MobileTonightF — live BRT Tonight card.
 * Brutalist boarding pass shell, real gig + travel data, tappable promoter contact.
 * Drops into MobileShell where the old gold-gradient Tonight card was.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BRT } from '@/lib/design/brt'

interface Gig {
  id: string
  venue: string
  city: string
  date: string
  set_time?: string
  set_end_time?: string
  status?: string
  fee?: number
  promoter_email?: string
  al_name?: string
  al_phone?: string
  venue_address?: string
  hospitality?: string
  backline?: string
}

interface TravelBooking {
  type?: string
  flight_number?: string
  from_location?: string
  to_location?: string
  departure_at?: string
  arrival_at?: string
  reference?: string
}

const C = BRT

function fmtTime(iso?: string) {
  if (!iso) return '--:--'
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '--:--' }
}

function fmtIATA(loc?: string) {
  if (!loc) return ''
  // pull a 3-letter IATA out of strings like "LHR · London Heathrow"
  const m = loc.match(/\b([A-Z]{3})\b/)
  return m ? m[1] : loc.slice(0, 3).toUpperCase()
}

function fmtCity(loc?: string) {
  if (!loc) return ''
  const parts = loc.split(/[·\-,]/).map(s => s.trim())
  return (parts[1] || parts[0] || '').toUpperCase().slice(0, 14)
}

function durationBetween(a?: string, b?: string) {
  if (!a || !b) return ''
  const diff = new Date(b).getTime() - new Date(a).getTime()
  if (diff <= 0) return ''
  const h = Math.floor(diff / 3.6e6)
  const m = Math.floor((diff % 3.6e6) / 6e4)
  return `${h}H${String(m).padStart(2, '0')}`
}

function formatDateUK(d: string) {
  try {
    const date = new Date(d)
    return date.toLocaleDateString('en-GB').replace(/\//g, '.')
  } catch { return d }
}

function setLengthMin(start?: string, end?: string) {
  if (!start || !end) return null
  // start/end like "23:00"
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins
}

function useCountdown(target: Date | null) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!now || !target) return { h: 0, m: 0, total: 0, ready: false }
  const diff = Math.max(0, target.getTime() - now.getTime())
  return {
    h: Math.floor(diff / 3.6e6),
    m: Math.floor((diff % 3.6e6) / 6e4),
    total: diff,
    ready: true,
  }
}

function buildSetDate(dateStr: string, timeStr?: string): Date | null {
  if (!timeStr) return null
  try {
    const [h, m] = timeStr.split(':').map(Number)
    const d = new Date(dateStr)
    d.setHours(h || 23, m || 0, 0, 0)
    return d
  } catch { return null }
}

export function MobileTonightF({
  tonightGig,
  tonightTravel = [],
}: {
  tonightGig: Gig
  tonightTravel?: TravelBooking[]
}) {
  const [feeRevealed, setFeeRevealed] = useState(false)

  const setStart = tonightGig.set_time || '23:00'
  const setEnd = tonightGig.set_end_time
  const setLen = setLengthMin(setStart, setEnd)

  const setDate = buildSetDate(tonightGig.date, setStart)
  const cd = useCountdown(setDate)

  // pick first inbound flight if any
  const flight = tonightTravel.find(t =>
    (t.type || '').toLowerCase().includes('flight') || t.flight_number
  )

  const promoterName = tonightGig.al_name || ''
  const promoterFirst = promoterName.split(' ')[0] || 'team'
  const promoterInitials = promoterName
    .split(' ')
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '··'

  const smsHref = tonightGig.al_phone
    ? `sms:${tonightGig.al_phone}?&body=Hi ${promoterFirst}, just landed — heading to ${tonightGig.venue} now.`
    : `sms:&body=Hi ${promoterFirst}, just landed — heading to ${tonightGig.venue} now.`

  return (
    <div style={{
      margin: '0 14px 18px',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontWeight: 500,
      color: C.ink,
      position: 'relative',
    }}>
      {/* Top docket */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 12,
        padding: '0 4px',
        fontSize: 9,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}>
        <div style={{ color: C.inkDim, fontWeight: 700 }}>NIGHT MANOEUVRES</div>
        <div style={{ color: C.red, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
          <span style={{
            width: 6, height: 6, background: C.red,
            animation: 'mtfBlink 1.4s steps(2) infinite',
          }} />
          LIVE TONIGHT
        </div>
      </div>

      {/* THE TICKET */}
      <div style={{
        background: C.ticket,
        color: C.ink,
        position: 'relative',
        boxShadow: `
          0 24px 80px rgba(0,0,0,0.7),
          0 4px 20px rgba(0,0,0,0.5),
          inset 0 0 0 1px rgba(255,255,255,0.04)
        `,
      }}>
        {/* RED HEADER */}
        <div style={{
          background: C.red,
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: C.bg,
        }}>
          <div style={{ fontSize: 10, letterSpacing: '0.22em', fontWeight: 800, textTransform: 'uppercase' }}>
            NIGHT MANOEUVRES
          </div>
          <div style={{ fontSize: 10, letterSpacing: '0.22em', fontWeight: 800, textTransform: 'uppercase' }}>
            ENTRY PASS
          </div>
        </div>

        {/* HERO */}
        <div style={{ padding: '22px 16px 20px' }}>
          <div style={{
            display: 'inline-block',
            background: C.red,
            color: C.bg,
            padding: '3px 7px 4px',
            fontSize: 9,
            letterSpacing: '0.2em',
            fontWeight: 800,
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            TONIGHT
          </div>
          <div style={{
            fontSize: 'clamp(34px, 9.5vw, 46px)',
            fontWeight: 800,
            lineHeight: 0.9,
            letterSpacing: '-0.035em',
            color: C.ink,
            textTransform: 'uppercase',
          }}>
            {tonightGig.venue}
          </div>
          <div style={{
            fontSize: 10,
            letterSpacing: '0.15em',
            color: C.inkDim,
            textTransform: 'uppercase',
            marginTop: 10,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            fontWeight: 700,
          }}>
            <span>{tonightGig.city}</span>
            <span style={{ color: C.inkFaint }}>/</span>
            <span>{formatDateUK(tonightGig.date)}</span>
          </div>

          {/* Set + countdown */}
          <div style={{ marginTop: 22, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.22em', color: C.inkDim, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                SET
              </div>
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                lineHeight: 0.9,
                letterSpacing: '-0.03em',
                color: C.ink,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {setStart}
                {setEnd && (
                  <>
                    <span style={{ fontSize: 16, color: C.inkFaint, margin: '0 5px' }}>→</span>
                    {setEnd}
                  </>
                )}
              </div>
              {setLen && (
                <div style={{ fontSize: 9, letterSpacing: '0.18em', color: C.inkDim, textTransform: 'uppercase', marginTop: 6, fontWeight: 700 }}>
                  {setLen} MIN
                </div>
              )}
            </div>
            {cd.ready && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, letterSpacing: '0.22em', color: C.inkDim, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                  UNTIL ON
                </div>
                <div style={{
                  fontSize: 42,
                  fontWeight: 800,
                  lineHeight: 0.85,
                  letterSpacing: '-0.04em',
                  color: C.red,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {String(cd.h).padStart(2, '0')}
                  <span style={{ fontSize: 18, color: C.inkFaint }}>H</span>
                  {String(cd.m).padStart(2, '0')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* INBOUND (only if we have a flight) */}
        {flight && (
          <>
            <Perforation />
            <div style={{ padding: '18px 16px', background: C.ticketLo }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.22em', color: C.inkDim, textTransform: 'uppercase', fontWeight: 700 }}>
                  INBOUND
                </div>
                {flight.flight_number && (
                  <div style={{
                    fontSize: 9,
                    letterSpacing: '0.18em',
                    color: C.bg,
                    background: C.red,
                    padding: '3px 7px 4px',
                    textTransform: 'uppercase',
                    fontWeight: 800,
                  }}>
                    {flight.flight_number}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 0.9, color: C.ink, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.025em' }}>
                    {fmtTime(flight.departure_at)}
                  </div>
                  <div style={{ fontSize: 9, color: C.inkDim, marginTop: 5, letterSpacing: '0.15em', fontWeight: 700 }}>
                    {fmtIATA(flight.from_location)} {fmtCity(flight.from_location)}
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 4px' }}>
                  <div style={{ width: 50, height: 1, background: C.inkFaint, margin: '0 auto 6px' }} />
                  <div style={{ fontSize: 8, color: C.inkDim, letterSpacing: '0.18em', fontWeight: 700 }}>
                    {durationBetween(flight.departure_at, flight.arrival_at)}
                  </div>
                  <div style={{ width: 50, height: 1, background: C.inkFaint, margin: '6px auto 0' }} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 0.9, color: C.ink, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.025em' }}>
                    {fmtTime(flight.arrival_at)}
                  </div>
                  <div style={{ fontSize: 9, color: C.inkDim, marginTop: 5, letterSpacing: '0.15em', fontWeight: 700 }}>
                    {fmtIATA(flight.to_location)} {fmtCity(flight.to_location)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* FEE — blurred until tap */}
        {tonightGig.fee != null && (
          <>
            <Perforation />
            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: '0.22em', color: C.inkDim, textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>
                  FEE
                </div>
                <div
                  onClick={() => setFeeRevealed(v => !v)}
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: C.ink,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.02em',
                    filter: feeRevealed ? 'none' : 'blur(7px)',
                    userSelect: 'none',
                    cursor: 'pointer',
                    transition: 'filter 0.2s',
                  }}
                >
                  £{tonightGig.fee.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, letterSpacing: '0.22em', color: C.inkDim, textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>
                  PAID
                </div>
                <div style={{ fontSize: 11, color: C.red, letterSpacing: '0.1em', fontWeight: 800, textTransform: 'uppercase' }}>
                  ON THE NIGHT
                </div>
              </div>
            </div>
          </>
        )}

        {/* CONTACT — full red bar replaces barcode */}
        {(tonightGig.al_name || tonightGig.al_phone) && (
          <a
            href={smsHref}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              padding: '16px',
              background: C.red,
              color: C.bg,
              textDecoration: 'none',
              borderTop: `1px dashed ${C.divide}`,
            }}
          >
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.22em', fontWeight: 800, opacity: 0.78, textTransform: 'uppercase', marginBottom: 4 }}>
                ON ARRIVAL
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', textTransform: 'uppercase' }}>
                MSG {promoterName || 'PROMOTER'} →
              </div>
            </div>
            <div style={{
              width: 44, height: 44,
              border: `2px solid ${C.bg}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.05em',
            }}>
              {promoterInitials}
            </div>
          </a>
        )}

        {/* OPEN GIG PASS */}
        <Link
          href={`/gig-pass/${tonightGig.id}`}
          style={{
            display: 'block',
            padding: '14px 16px',
            background: C.ticketHi,
            color: C.ink,
            textDecoration: 'none',
            borderTop: `1px solid ${C.divide}`,
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontWeight: 800,
            textAlign: 'center',
          }}
        >
          OPEN FULL GIG PASS →
        </Link>
      </div>

      <style jsx>{`
        @keyframes mtfBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

function Perforation() {
  return (
    <div style={{
      position: 'relative',
      height: 14,
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
    }}>
      <div style={{ position: 'absolute', left: -8, width: 16, height: 16, borderRadius: '50%', background: C.bg, boxShadow: 'inset 0 0 4px rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'absolute', right: -8, width: 16, height: 16, borderRadius: '50%', background: C.bg, boxShadow: 'inset 0 0 4px rgba(0,0,0,0.6)' }} />
      <div style={{ width: '100%', borderTop: `1px dashed ${C.divide}`, marginLeft: 12, marginRight: 12 }} />
    </div>
  )
}
