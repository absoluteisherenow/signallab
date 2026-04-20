// Build a signed Apple Wallet .pkpass for an NM gig.
// Workers-safe: no filesystem I/O (assets come pre-bundled via base64, certs
// come from env). Mirrors the layout locked in scripts/test-pkpass.mjs —
// keep them in sync if the design changes.

import { PKPass } from 'passkit-generator'
import { loadPkpassAssets } from './pkpass-assets.generated'

export interface BuildPassInput {
  gig: GigRow
  travelBookings: TravelBookingRow[]
  certs: { signerCert: string | Buffer; signerKey: string | Buffer; wwdr: string | Buffer }
  passTypeId: string
  teamId: string
  appUrl: string
}

export interface GigRow {
  id: string
  venue: string
  location?: string | null
  date: string
  time?: string | null
  slot_time?: string | null
  set_time?: string | null
  venue_address?: string | null
  address?: string | null
  doors_time?: string | null
  driver_name?: string | null
  driver_phone?: string | null
  promoter_phone?: string | null
  al_phone?: string | null
}

export interface TravelBookingRow {
  type: string
  name?: string | null
  flight_number?: string | null
  from_location?: string | null
  to_location?: string | null
  departure_at?: string | null
  arrival_at?: string | null
  check_in?: string | null
  check_out?: string | null
  reference?: string | null
}

function fmtDateShort(date: string): string {
  try {
    return new Date(date).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    }).toUpperCase()
  } catch { return date }
}

function fmtTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function toIso(date: string, time: string | null | undefined): string {
  if (!date) return new Date().toISOString()
  const startMatch = (time || '22:00').match(/\d{1,2}:\d{2}/)
  const t = (startMatch ? startMatch[0] : '22:00').slice(0, 5)
  return `${date}T${t}:00+00:00`
}

export async function buildGigPass(input: BuildPassInput): Promise<Buffer> {
  const { gig, travelBookings, certs, passTypeId, teamId, appUrl } = input

  const setTime = gig.slot_time || gig.set_time || gig.time || null
  const setIso = toIso(gig.date, setTime)
  const dateShort = fmtDateShort(gig.date)
  const city = (gig.location || '').trim().toUpperCase()

  const hotels = travelBookings.filter(t => t.type === 'hotel' || t.type === 'accommodation')
  const flights = travelBookings.filter(t => t.type === 'flight')
  const firstHotel = hotels[0]
  const firstFlight = flights[0]
  const hotelShort = firstHotel ? (firstHotel.name || 'Hotel') : null
  const flightShort = firstFlight ? (fmtTime(firstFlight.departure_at) || 'Flight') : null

  const daysUntil = Math.max(0, Math.ceil((new Date(setIso).getTime() - Date.now()) / 86400000))
  const countdownValue = daysUntil === 0 ? 'TONIGHT' : daysUntil === 1 ? 'TOMORROW' : `${daysUntil} DAYS`

  const headerFields = [
    { key: 'date', label: 'Date', value: dateShort, textAlignment: 'PKTextAlignmentRight' },
  ]
  const primaryFields = [
    { key: 'venue', label: 'Venue', value: gig.venue.toUpperCase() },
  ]
  const secondaryFields = [
    { key: 'city', label: 'City', value: city || '—', textAlignment: 'PKTextAlignmentLeft' },
    { key: 'countdown', label: 'Countdown', value: countdownValue, textAlignment: 'PKTextAlignmentCenter' },
    { key: 'set', label: 'Set', value: setTime || '—', textAlignment: 'PKTextAlignmentRight' },
  ]
  const auxiliaryFields = [
    { key: 'hotel', label: 'Hotel', value: hotelShort || '—', textAlignment: 'PKTextAlignmentLeft' },
    { key: 'flight', label: 'Flight', value: flightShort || '—', textAlignment: 'PKTextAlignmentRight' },
  ]

  const fullInfoUrl = `${appUrl.replace(/\/$/, '')}/gig-pass/${gig.id}`
  const backFields: Array<Record<string, unknown>> = []
  if (gig.driver_name) backFields.push({ key: 'driver', label: 'Driver', value: gig.driver_name })
  const addr = gig.venue_address || gig.address || null
  if (addr) backFields.push({ key: 'address', label: 'Venue address', value: addr, dataDetectorTypes: ['PKDataDetectorTypeAddress'] })
  if (gig.doors_time) backFields.push({ key: 'doors', label: 'Doors', value: gig.doors_time })
  for (let i = 0; i < hotels.length; i++) {
    const h = hotels[i]
    const parts = [
      h.name,
      h.check_in ? `Check-in: ${fmtTime(h.check_in)}` : null,
      h.check_out ? `Check-out: ${fmtTime(h.check_out)}` : null,
      h.reference ? `Ref: ${h.reference}` : null,
    ].filter(Boolean)
    backFields.push({ key: `hotel_${i}`, label: hotels.length > 1 ? `Hotel ${i + 1}` : 'Hotel', value: parts.join('\n') })
  }
  for (let i = 0; i < flights.length; i++) {
    const f = flights[i]
    const parts = [
      [f.flight_number, f.from_location && f.to_location ? `${f.from_location} → ${f.to_location}` : null].filter(Boolean).join(' · '),
      f.departure_at ? `Dep: ${fmtTime(f.departure_at)}` : null,
      f.arrival_at ? `Arr: ${fmtTime(f.arrival_at)}` : null,
      f.reference ? `Ref: ${f.reference}` : null,
    ].filter(Boolean)
    backFields.push({ key: `flight_${i}`, label: flights.length > 1 ? `Flight ${i + 1}` : 'Flight', value: parts.join('\n') })
  }
  if (gig.driver_phone) backFields.push({ key: 'driver_phone', label: 'Driver phone', value: gig.driver_phone, dataDetectorTypes: ['PKDataDetectorTypePhoneNumber'] })
  if (gig.promoter_phone) backFields.push({ key: 'promoter_phone', label: 'Promoter phone', value: gig.promoter_phone, dataDetectorTypes: ['PKDataDetectorTypePhoneNumber'] })
  if (gig.al_phone) backFields.push({ key: 'al_phone', label: 'Artist liaison', value: gig.al_phone, dataDetectorTypes: ['PKDataDetectorTypePhoneNumber'] })
  backFields.push({ key: 'full_info', label: 'Full gig info', value: fullInfoUrl, dataDetectorTypes: ['PKDataDetectorTypeLink'] })
  backFields.push({ key: 'powered_by', label: '', value: 'Powered by Signal Lab OS' })

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: `${gig.id}-${Date.now()}`,
    organizationName: 'NIGHT manoeuvres',
    description: `${gig.venue}${gig.location ? ` · ${gig.location}` : ''} — ${dateShort}`,
    backgroundColor: 'rgb(0, 0, 0)',
    foregroundColor: 'rgb(240, 235, 226)',
    labelColor: 'rgb(182, 58, 58)',
    suppressStripShine: true,
    relevantDate: setIso,
    eventTicket: { headerFields, primaryFields, secondaryFields, auxiliaryFields, backFields },
  }

  const assets = loadPkpassAssets() as Record<string, Buffer>
  const bundle: Record<string, Buffer> = { ...assets, 'pass.json': Buffer.from(JSON.stringify(passJson)) }

  const pass = new PKPass(bundle, {
    signerCert: typeof certs.signerCert === 'string' ? Buffer.from(certs.signerCert) : certs.signerCert,
    signerKey: typeof certs.signerKey === 'string' ? Buffer.from(certs.signerKey) : certs.signerKey,
    wwdr: typeof certs.wwdr === 'string' ? Buffer.from(certs.wwdr) : certs.wwdr,
  })

  return pass.getAsBuffer()
}
