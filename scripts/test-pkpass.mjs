#!/usr/bin/env node
// Generate a real signed .pkpass for the next upcoming gig.
// Layout priorities (from Anthony's on-device feedback):
//   - City must be prominent (header-left).
//   - Set time always shown as full range ("23:00 – 01:00"), solo on its row.
//   - Bottom not empty: 4 auxiliary fields (Driver | Hotel | Flight | Full gig info).
//   - Header only has 2 short values (city + countdown) — no truncation.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { PKPass } from 'passkit-generator'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
loadEnv({ path: resolve(ROOT, '.env.local') })

const CERT_DIR = resolve(homedir(), 'Developer/signallab-pkpass')
const ASSETS_DIR = resolve(ROOT, 'assets/pkpass')
const PASS_TYPE_ID = 'pass.com.signallab.gigwallet'
const TEAM_ID = 'LR465D22Z7'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

function fmtDateShort(date) {
  try {
    return new Date(date).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    }).toUpperCase()
  } catch { return date }
}

function fmtTime(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function toIso(date, time) {
  if (!date) return new Date().toISOString()
  // If time is a range like "23:00 – 01:00", extract the start
  const startMatch = (time || '22:00').match(/\d{1,2}:\d{2}/)
  const t = (startMatch ? startMatch[0] : '22:00').slice(0, 5)
  return `${date}T${t}:00+00:00`
}

function loadAssets() {
  const files = [
    'icon.png', 'icon@2x.png', 'icon@3x.png',
    'logo.png', 'logo@2x.png', 'logo@3x.png',
    'background.png', 'background@2x.png', 'background@3x.png',
  ]
  const out = {}
  for (const f of files) out[f] = readFileSync(resolve(ASSETS_DIR, f))
  return out
}

function loadCerts() {
  return {
    signerCert: readFileSync(resolve(CERT_DIR, 'pass.pem')),
    signerKey: readFileSync(resolve(CERT_DIR, 'pass.key')),
    wwdr: readFileSync(resolve(CERT_DIR, 'wwdr.pem')),
  }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const today = new Date().toISOString().slice(0, 10)
  const { data: gigs, error } = await supabase
    .from('gigs')
    .select('*')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(1)
  if (error) throw error
  if (!gigs || gigs.length === 0) throw new Error('No upcoming gig found')
  const gig = gigs[0]
  console.log(`Gig: ${gig.venue} · ${gig.location} · ${gig.date}`)

  const { data: travel } = await supabase
    .from('travel_bookings').select('*').eq('gig_id', gig.id)
    .order('created_at', { ascending: true })
  const travelBookings = travel || []
  console.log(`Travel bookings: ${travelBookings.length}`)

  const setTime = gig.slot_time || gig.set_time || gig.time || null
  const setIso = toIso(gig.date, setTime)
  const dateShort = fmtDateShort(gig.date)
  const city = (gig.location || '').trim().toUpperCase()

  const hotels = travelBookings.filter(t => t.type === 'hotel' || t.type === 'accommodation')
  const flights = travelBookings.filter(t => t.type === 'flight')
  const firstHotel = hotels[0]
  const firstFlight = flights[0]
  const hotelShort = firstHotel ? (firstHotel.name || 'Hotel') : null
  // Flight value = departure time (artist-focused: "when do I leave?").
  // Flight number + route is back-of-pass territory.
  const flightShort = firstFlight
    ? (fmtTime(firstFlight.departure_at) || 'Flight')
    : null

  // Three 2-col rows below primary. additionalInfoFields is iOS 18+ eventTicket;
  // macOS Pass Viewer won't render row 3 but iPhone will.
  const headerFields = [
    { key: 'date', label: 'Date', value: dateShort, textAlignment: 'PKTextAlignmentRight' },
  ]

  // Primary: label "Venue" in red above venue name.
  const primaryFields = [
    { key: 'venue', label: 'Venue', value: gig.venue.toUpperCase() },
  ]

  // Row 1: City | Set
  const secondaryFields = [
    { key: 'city', label: 'City', value: city || '—', textAlignment: 'PKTextAlignmentLeft' },
    { key: 'set', label: 'Set', value: setTime || '—', textAlignment: 'PKTextAlignmentRight' },
  ]

  // Row 2: Hotel | Flight
  const auxiliaryFields = [
    { key: 'hotel', label: 'Hotel', value: hotelShort || '—', textAlignment: 'PKTextAlignmentLeft' },
    { key: 'flight', label: 'Flight', value: flightShort || '—', textAlignment: 'PKTextAlignmentRight' },
  ]

  // Row 3 (iOS 18): Driver | Countdown | Full gig info button
  const fullInfoUrl = `${BASE_URL.replace(/\/$/, '')}/gig-pass/${gig.id}`
  const additionalInfoFields = [
    { key: 'driver', label: 'Driver', value: gig.driver_name || '—', textAlignment: 'PKTextAlignmentLeft' },
    {
      key: 'countdown', label: 'Countdown', value: setIso,
      dateStyle: 'PKDateStyleShort', isRelative: true,
      textAlignment: 'PKTextAlignmentCenter',
    },
    {
      key: 'gig_link', label: 'Full gig info', value: 'Open →',
      attributedValue: `<a href="${fullInfoUrl}">Open →</a>`,
      textAlignment: 'PKTextAlignmentRight',
    },
  ]

  // Back of pass: address, full hotel/flight details, phone contacts, link
  const backFields = []
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

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    serialNumber: `${gig.id}-${Date.now()}`,
    organizationName: 'NIGHT manoeuvres',
    description: `${gig.venue}${gig.location ? ` · ${gig.location}` : ''} — ${dateShort}`,
    backgroundColor: 'rgb(0, 0, 0)',
    foregroundColor: 'rgb(240, 235, 226)',
    labelColor: 'rgb(182, 58, 58)',
    suppressStripShine: true,
    // Surfaces pass on iOS lock screen in the hours before set — no header-field needed.
    relevantDate: setIso,
    preferredStyleSchemes: ['eventTicket'],
    eventTicket: { headerFields, primaryFields, secondaryFields, auxiliaryFields, additionalInfoFields, backFields },
  }

  const assets = loadAssets()
  assets['pass.json'] = Buffer.from(JSON.stringify(passJson))
  const pass = new PKPass(assets, loadCerts())
  const buf = pass.getAsBuffer()
  const slug = gig.venue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const outPath = `/tmp/gig-${slug}.pkpass`
  writeFileSync(outPath, buf)
  console.log(`\n✓ Wrote ${buf.length.toLocaleString()} bytes to ${outPath}`)
}

main().catch(err => { console.error(err); process.exit(1) })
