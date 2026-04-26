import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate

  // Fetch all travel bookings (RLS scopes by user_id)
  const { data: bookings } = await supabase
    .from('travel_bookings')
    .select('*')
    .order('created_at', { ascending: true })

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ bookings: [] })
  }

  // Get unique gig IDs and fetch gig info
  const gigIds = [...new Set(bookings.map((b: any) => b.gig_id).filter(Boolean))]
  const { data: gigs } = await supabase
    .from('gigs')
    .select('id, title, venue, location, date, time, status')
    .in('id', gigIds)

  // Build gig lookup
  const gigMap: Record<string, any> = {}
  ;(gigs || []).forEach((g: any) => { gigMap[g.id] = g })

  // Filter to upcoming gigs only and attach gig info
  const todayStr = new Date().toISOString().slice(0, 10)
  const enriched = bookings
    .map((b: any) => {
      const gig = gigMap[b.gig_id]
      return { ...b, gig_title: gig?.title, gig_venue: gig?.venue, gig_date: gig?.date, gig_location: gig?.location }
    })
    .filter((b: any) => !b.gig_date || b.gig_date >= todayStr)

  return NextResponse.json({ bookings: enriched })
}
