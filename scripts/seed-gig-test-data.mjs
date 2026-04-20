// One-off: populate the next upcoming gig with plausible test data so the
// pkpass renders every field. Safe to re-run.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '..', '.env.local') })

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const today = new Date().toISOString().slice(0, 10)
const { data: gig, error } = await s.from('gigs').select('*').gte('date', today).order('date', { ascending: true }).limit(1).single()
if (error) { console.error(error); process.exit(1) }
console.log(`Seeding: ${gig.venue} · ${gig.date}`)

const patch = {
  time: '23:00 – 01:00',
  driver_name: 'Nikos Papadakis',
  driver_phone: '+30 690 000 0000',
  promoter_phone: '+30 210 000 0000',
  al_name: 'Eleni Dimitriou',
  al_phone: '+30 691 111 1111',
  hotel_name: 'Electra Palace Athens',
}
const { error: e2 } = await s.from('gigs').update(patch).eq('id', gig.id)
if (e2) { console.error(e2); process.exit(1) }
console.log('✓ gig row updated')

await s.from('travel_bookings').delete().eq('gig_id', gig.id)
const dayBefore = new Date(new Date(gig.date).getTime() - 86400000).toISOString().slice(0, 10)
const dayAfter = new Date(new Date(gig.date).getTime() + 86400000).toISOString().slice(0, 10)

const { error: e4 } = await s.from('travel_bookings').insert([
  { gig_id: gig.id, type: 'flight', flight_number: 'A3 601', from_location: 'LHR', to_location: 'ATH',
    departure_at: `${dayBefore}T15:20:00+00:00`, arrival_at: `${dayBefore}T21:05:00+00:00`, reference: 'ZKQ9PL', source: 'manual' },
  { gig_id: gig.id, type: 'hotel', name: 'Electra Palace Athens',
    check_in: `${dayBefore}T14:00:00+00:00`, check_out: `${dayAfter}T11:00:00+00:00`, reference: 'EP-2026-0514', source: 'manual' },
])
if (e4) { console.error('ins travel:', e4); process.exit(1) }
console.log('✓ travel_bookings inserted')
