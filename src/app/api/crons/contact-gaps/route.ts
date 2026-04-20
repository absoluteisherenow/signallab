import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { requireCronAuth } from '@/lib/cron-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Daily cron — finds upcoming gigs with missing contact info so nothing falls through the cracks.
// Flags:
//   - missing promoter_email (can't route invoices / advance)
//   - missing hotel_name when travel expected (date <30 days out, fee > 0, no hotel on file)
//   - missing flight_details when international (location not in UK)
//
// One notification per gig to avoid spam. Re-notifies weekly if gap persists.
export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'contact-gaps')
  if (unauth) return unauth

  try {
    const today = new Date().toISOString().split('T')[0]
    const in60Days = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]

    const { data: gigs, error } = await supabase
      .from('gigs')
      .select('id, user_id, title, venue, location, date, fee, promoter_email, hotel_name, flight_details, notes')
      .gte('date', today)
      .lte('date', in60Days)
      .in('status', ['confirmed', 'pending'])

    if (error) throw error
    if (!gigs?.length) return NextResponse.json({ ran: true, flagged: 0 })

    // Check what was already flagged in the last 7 days to avoid spamming
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: recent } = await supabase
      .from('notifications')
      .select('gig_id, metadata')
      .eq('type', 'system')
      .gte('created_at', sevenDaysAgo)

    const recentlyFlagged = new Set(
      (recent || [])
        .filter((n: any) => n.metadata?.kind === 'contact_gap')
        .map((n: any) => n.gig_id)
        .filter(Boolean)
    )

    let flagged = 0

    for (const gig of gigs) {
      if (recentlyFlagged.has(gig.id)) continue

      const gaps: string[] = []

      if (!gig.promoter_email) gaps.push('promoter email')

      const daysOut = Math.ceil((new Date(gig.date).getTime() - Date.now()) / 86400000)
      const needsTravel = daysOut <= 30 && Number(gig.fee || 0) > 0

      if (needsTravel && !gig.hotel_name) gaps.push('hotel')
      const looksInternational = gig.location && !/UK|United Kingdom|England|Scotland|Wales/i.test(gig.location)
      if (needsTravel && looksInternational && !gig.flight_details) gaps.push('flight')

      if (gaps.length === 0) continue

      const dateStr = new Date(gig.date).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      })

      await createNotification({
        user_id: gig.user_id || undefined,
        type: 'system',
        title: `Missing info — ${gig.title || gig.venue}`,
        message: `${dateStr} · ${daysOut} days · need: ${gaps.join(', ')}`,
        href: `/gigs/${gig.id}`,
        gig_id: gig.id,
        metadata: { kind: 'contact_gap', gaps },
        sendSms: gaps.includes('promoter email') && daysOut < 14,
      })

      flagged++
    }

    return NextResponse.json({ ran: true, flagged, checked: gigs.length })
  } catch (err: any) {
    await createNotification({
      type: 'cron_error',
      title: 'Contact-gap scan failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
