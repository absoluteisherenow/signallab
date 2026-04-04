import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Triggered daily at 09:00 via Vercel Cron
// Finds confirmed gigs within 21 days with no advance sent → creates DRAFT records for user approval
// Nothing sends without user approval — drafts go to the approval queue
export async function GET() {
  try {
    const today = new Date()
    const in21Days = new Date(today.getTime() + 21 * 86400000)

    // Get all confirmed gigs in the next 21 days
    const { data: gigs, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('status', 'confirmed')
      .gte('date', today.toISOString().split('T')[0])
      .lte('date', in21Days.toISOString().split('T')[0])

    if (error) throw error
    if (!gigs?.length) return NextResponse.json({ ran: true, drafted: 0, message: 'No upcoming confirmed gigs' })

    // Get existing advance requests to exclude already-handled ones
    const gigIds = gigs.map(g => g.id)
    const { data: existing } = await supabase
      .from('advance_requests')
      .select('gig_id')
      .in('gig_id', gigIds)

    const alreadyExists = new Set((existing || []).map(r => r.gig_id))

    const toChase = gigs.filter(g => !alreadyExists.has(g.id) && g.promoter_email)
    const noEmail = gigs.filter(g => !alreadyExists.has(g.id) && !g.promoter_email)

    let drafted = 0

    for (const gig of toChase) {
      const daysTo = Math.ceil((new Date(gig.date).getTime() - today.getTime()) / 86400000)

      // Create a draft advance request — does NOT send anything
      await supabase.from('advance_requests').upsert(
        {
          gig_id: gig.id,
          promoter_email: gig.promoter_email,
          completed: false,
          status: 'draft',
        },
        { onConflict: 'gig_id' }
      )

      // Notify the artist that a draft is ready to review
      await createNotification({
        type: 'advance_sent',
        title: `Advance ready to send — ${gig.title}`,
        message: `${daysTo} days to show · ${gig.promoter_email} · review and approve`,
        href: `/gigs/${gig.id}`,
        gig_id: gig.id,
      })

      drafted++
    }

    // Notify artist about gigs missing a promoter email
    for (const gig of noEmail) {
      const daysTo = Math.ceil((new Date(gig.date).getTime() - today.getTime()) / 86400000)
      await createNotification({
        type: 'advance_sent',
        title: `Add promoter email — ${gig.title}`,
        message: `${daysTo} days away · no promoter email on file`,
        href: `/gigs/${gig.id}`,
        gig_id: gig.id,
      })
    }

    return NextResponse.json({
      ran: true,
      drafted,
      missing_email: noEmail.length,
      already_exists: alreadyExists.size,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
