import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from('travel_bookings')
    .select('*')
    .eq('gig_id', params.id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ bookings: [] })
  return NextResponse.json({ bookings: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { data, error } = await supabase.from('travel_bookings').insert([{
    gig_id: params.id,
    type: body.type,
    name: body.name || null,
    flight_number: body.flight_number || null,
    from_location: body.from_location || null,
    to_location: body.to_location || null,
    departure_at: body.departure_at || null,
    arrival_at: body.arrival_at || null,
    check_in: body.check_in || null,
    check_out: body.check_out || null,
    reference: body.reference || null,
    cost: body.cost ? parseFloat(body.cost) : null,
    currency: body.currency || 'EUR',
    notes: body.notes || null,
    source: 'manual',
  }]).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
}

export async function DELETE(req: NextRequest, _ctx: { params: { id: string } }) {
  const { searchParams } = new URL(req.url)
  const bookingId = searchParams.get('bookingId')
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
  await supabase.from('travel_bookings').delete().eq('id', bookingId)
  return NextResponse.json({ success: true })
}
