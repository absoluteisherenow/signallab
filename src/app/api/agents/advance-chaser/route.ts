import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Cron: daily at 09:00
// Finds confirmed gigs within 21 days with no advance sent → notifies artist to review and send
export async function GET() {
  try {
    const today = new Date()
    const in21Days = new Date(today.getTime() + 21 * 86400000)

    const { data: gigs, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('status', 'confirmed')
      .gte('date', today.toISOString().split('T')[0])
      .lte('date', in21Days.toISOString().split('T')[0])

    if (error) throw error
    if (!gigs?.length) return NextResponse.json({ ran: true, flagged: 0, message: 'No upcoming confirmed gigs' })

    const gigIds = gigs.map(g => g.id)
    const { data: existing } = await supabase
      .from('advance_requests')
      .select('gig_id')
      .in('gig_id', gigIds)

    const alreadySent = new Set((existing || []).map(r => r.gig_id))

    const needsAdvance = gigs.filter(g => !alreadySent.has(g.id) && g.promoter_email)
    const noEmail = gigs.filter(g => !alreadySent.has(g.id) && !g.promoter_email)

    let flagged = 0

    // Create in-app notification — artist reviews and sends from the gig page
    for (const gig of needsAdvance) {
      const daysTo = Math.ceil((new Date(gig.date).getTime() - today.getTime()) / 86400000)
      await createNotification({
        type: 'system',
        title: `Send advance — ${gig.title}`,
        message: `${daysTo} days to show · ${gig.promoter_email} · preview and approve before sending`,
        href: `/gigs/${gig.id}`,
        gig_id: gig.id,
      })
      flagged++
    }

    for (const gig of noEmail) {
      const daysTo = Math.ceil((new Date(gig.date).getTime() - today.getTime()) / 86400000)
      await createNotification({
        type: 'system',
        title: `Add promoter email — ${gig.title}`,
        message: `${daysTo} days away · no promoter email on file`,
        href: `/gigs/${gig.id}`,
        gig_id: gig.id,
      })
    }

    return NextResponse.json({
      ran: true,
      flagged,
      missing_email: noEmail.length,
      already_sent: alreadySent.size,
    })
  } catch (err: any) {
    await createNotification({ type: 'cron_error', title: 'Advance chaser failed', message: err instanceof Error ? err.message : 'Unknown error' })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
