import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Triggered daily at 23:00 via Vercel Cron
// Finds gigs that finished in the last 24 hours → fires post-gig debrief notification
export async function GET() {
  try {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Find gigs where date was yesterday
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const { data: gigs, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('date', yesterdayStr)
      .neq('status', 'cancelled')

    if (error) throw error
    if (!gigs?.length) return NextResponse.json({ ran: true, debriefed: 0 })

    let debriefed = 0

    for (const gig of gigs) {
      // Check we haven't already sent a debrief for this gig
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('gig_id', gig.id)
        .eq('type', 'system')
        .ilike('title', '%debrief%')
        .limit(1)

      if (existing?.length) continue

      await createNotification({
        type: 'system',
        title: `How did it go? — ${gig.title}`,
        message: `${gig.venue} · ${new Date(gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · Add notes, rate the show, or chase the invoice.`,
        href: `/gigs/${gig.id}/debrief`,
        gig_id: gig.id,
        sendEmail: false,
      })

      // If invoice exists and is still pending, send a reminder notification
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, status')
        .eq('gig_id', gig.id)
        .eq('status', 'pending')
        .single()

      if (invoice) {
        await createNotification({
          type: 'invoice_overdue',
          title: `Chase payment — ${gig.title}`,
          message: `Invoice still pending after the show. Send a reminder to ${gig.promoter_email || 'promoter'}.`,
          href: '/business/finances',
          gig_id: gig.id,
          sendEmail: true,
        })
      }

      debriefed++
    }

    return NextResponse.json({ ran: true, debriefed })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
