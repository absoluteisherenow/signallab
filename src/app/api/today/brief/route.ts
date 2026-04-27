import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaude } from '@/lib/callClaude'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { serviceClient: supabase } = gate

  try {
    const now = new Date()
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const todayISO = now.toISOString()

    // NOTE: tables below have no `user_id` column in this schema (single-artist
    // pre-beta). Filtering by user_id used to throw PostgREST 42703 and return
    // [] silently, which blanked the Today page. Drop the scoping until a real
    // multi-user migration adds user_id + RLS. Matches /api/gigs/route.ts pattern.
    const [
      gigsResult,
      allUpcomingGigsResult,
      overdueInvoicesResult,
      pendingPostsResult,
      draftPostsResult,
      approvedPostsResult,
      travelResult,
      advancesResult,
      notificationsResult,
      confirmedGigsResult,
      tracksResult,
      queuedContentResult,
      setsResult,
      releasesResult,
      nextScheduledPostResult,
      tasksResult,
    ] = await Promise.all([
      // Upcoming gigs (next 30 days, for attention logic)
      supabase
        .from('gigs')
        .select('id, title, venue, location, date, status')
        .gte('date', todayISO)
        .lte('date', in30Days)
        .order('date', { ascending: true }),

      // All upcoming gigs (any status, for the upcoming dates section)
      supabase
        .from('gigs')
        .select('id, title, venue, location, date, status')
        .gte('date', todayISO)
        .order('date', { ascending: true })
        .limit(5),

      // Overdue invoices
      supabase
        .from('invoices')
        .select('id, gig_title, amount, currency, status, due_date')
        .or(`status.eq.overdue,and(due_date.lt.${todayISO},status.neq.paid)`),

      // Posts needing approval
      supabase
        .from('scheduled_posts')
        .select('id, platform, caption, scheduled_at')
        .eq('status', 'scheduled'),

      // Draft posts
      supabase
        .from('scheduled_posts')
        .select('id')
        .eq('status', 'draft'),

      // Approved posts (queued for publish)
      supabase
        .from('scheduled_posts')
        .select('id')
        .eq('status', 'approved'),

      // Travel bookings for upcoming gigs
      supabase
        .from('travel_bookings')
        .select('id, gig_id, type'),

      // Incomplete advances
      supabase
        .from('advance_requests')
        .select('id, gig_id, status')
        .neq('status', 'completed'),

      // Recent notifications
      supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),

      // Confirmed gigs count (all future)
      supabase
        .from('gigs')
        .select('id', { count: 'exact', head: true })
        .gte('date', todayISO)
        .eq('status', 'confirmed'),

      // Total tracks count
      supabase
        .from('dj_tracks')
        .select('id', { count: 'exact', head: true }),

      // All queued content (scheduled + approved + draft)
      supabase
        .from('scheduled_posts')
        .select('id', { count: 'exact', head: true })
        .in('status', ['draft', 'scheduled', 'approved']),

      // Sets count
      supabase
        .from('dj_sets')
        .select('id', { count: 'exact', head: true }),

      // Releases count
      supabase
        .from('releases')
        .select('id', { count: 'exact', head: true }),

      // Next scheduled post
      supabase
        .from('scheduled_posts')
        .select('id, platform, caption, scheduled_at, media_url, media_urls')
        .in('status', ['draft', 'scheduled', 'approved'])
        .gte('scheduled_at', todayISO)
        .order('scheduled_at', { ascending: true })
        .limit(1),

      // Open tasks — starred first so the artist's "this is the one" pin floats
      // to the top regardless of when it was added.
      supabase
        .from('tasks')
        .select('id, title, status, priority, starred, created_at')
        .neq('status', 'completed')
        .order('starred', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const gigs = gigsResult.data ?? []
    const allUpcomingGigs = allUpcomingGigsResult.data ?? []
    const overdueInvoices = overdueInvoicesResult.data ?? []
    const pendingPosts = pendingPostsResult.data ?? []
    const draftPosts = draftPostsResult.data ?? []
    const approvedPosts = approvedPostsResult.data ?? []
    const travelBookings = travelResult.data ?? []
    const incompleteAdvances = advancesResult.data ?? []
    const notifications = notificationsResult.data ?? []

    // Build needs_attention array
    const needsAttention: Array<{
      type: string
      count: number
      label: string
      href: string
    }> = []

    // Posts needing approval
    // Drafts have their own focused review surface — sending the user to the
    // calendar buried the action behind a date grid, so attention rows now
    // deep-link to /broadcast/drafts.
    if (pendingPosts.length > 0) {
      needsAttention.push({
        type: 'post_approval',
        count: pendingPosts.length,
        label: `${pendingPosts.length} post${pendingPosts.length === 1 ? '' : 's'} need${pendingPosts.length === 1 ? 's' : ''} approval`,
        href: '/broadcast/drafts',
      })
    }

    // Overdue invoices — link straight to the overdue filter so the row
    // lands on the action, not the dashboard above it.
    if (overdueInvoices.length > 0) {
      needsAttention.push({
        type: 'overdue_invoice',
        count: overdueInvoices.length,
        label: `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'}`,
        href: '/business/finances?status=overdue',
      })
    }

    // Gigs missing advance info — gigs in next 30 days with no completed advance
    const gigIdsWithAdvance = new Set(
      (advancesResult.data ?? [])
        .filter((a) => a.status === 'completed')
        .map((a) => a.gig_id)
    )
    // Also include incomplete advances as "missing"
    const allAdvanceGigIds = new Set((advancesResult.data ?? []).map((a) => a.gig_id))
    const gigsWithoutAdvance = gigs.filter(
      (g) => g.status === 'confirmed' && !allAdvanceGigIds.has(g.id)
    )
    const gigsWithIncompleteAdvance = gigs.filter(
      (g) =>
        g.status === 'confirmed' &&
        allAdvanceGigIds.has(g.id) &&
        !gigIdsWithAdvance.has(g.id)
    )
    const missingAdvanceCount =
      gigsWithoutAdvance.length + gigsWithIncompleteAdvance.length
    // If there's exactly one offender, deep-link straight to that gig's
    // detail page (with the right section anchor). The user's complaint
    // was that "1 gig missing advance" sent them to the gig list — making
    // them click again to find which gig. Anchor lands them in the right
    // accordion section.
    const missingAdvanceGigs = [...gigsWithoutAdvance, ...gigsWithIncompleteAdvance]
    if (missingAdvanceCount > 0) {
      const singleGig = missingAdvanceCount === 1 ? missingAdvanceGigs[0] : null
      needsAttention.push({
        type: 'missing_advance',
        count: missingAdvanceCount,
        label: `${missingAdvanceCount} gig${missingAdvanceCount === 1 ? '' : 's'} missing advance info`,
        href: singleGig ? `/gigs/${singleGig.id}#advance` : '/gigs?missing=advance',
      })
    }

    // Upcoming gigs without travel booked (next 14 days)
    const bookedGigIds = new Set(travelBookings.map((t) => t.gig_id))
    const gigsNeedingTravel = gigs.filter(
      (g) =>
        g.status === 'confirmed' &&
        new Date(g.date) <= new Date(in14Days) &&
        !bookedGigIds.has(g.id)
    )
    if (gigsNeedingTravel.length > 0) {
      const singleGig = gigsNeedingTravel.length === 1 ? gigsNeedingTravel[0] : null
      needsAttention.push({
        type: 'unbooked_travel',
        count: gigsNeedingTravel.length,
        label: `${gigsNeedingTravel.length} upcoming gig${gigsNeedingTravel.length === 1 ? '' : 's'} without travel booked`,
        href: singleGig ? `/gigs/${singleGig.id}#travel` : '/gigs?missing=travel',
      })
    }

    // Next confirmed gig (search all upcoming, not just 30-day window)
    const nextGig =
      allUpcomingGigs.find((g) => g.status === 'confirmed') ?? null

    // Generate brief with Claude if there's meaningful data
    let brief: string | null = null
    const hasMeaningfulData =
      gigs.length > 0 ||
      allUpcomingGigs.length > 0 ||
      needsAttention.length > 0 ||
      notifications.length > 0

    if (hasMeaningfulData) {
      try {
        const stateDescription = [
          nextGig
            ? `Next gig: ${nextGig.title} at ${nextGig.venue} on ${new Date(nextGig.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`
            : 'No upcoming confirmed gigs.',
          `${gigs.length} gig${gigs.length === 1 ? '' : 's'} in the next 30 days.`,
          needsAttention.length > 0
            ? `Attention needed: ${needsAttention.map((n) => n.label).join(', ')}.`
            : 'Nothing urgent requiring attention.',
        ].join(' ')

        const claudeRes = await callClaude({
          userId: gate.user.id,
          feature: 'today_brief',
          model: 'claude-sonnet-4-6',
          max_tokens: 150,
          system: 'You are Signal Lab OS. Write a 2-sentence morning brief for an electronic music artist. Be concise and actionable. No emojis. No AI-sounding language.',
          messages: [{ role: 'user', content: `Here is today's state:\n${stateDescription}` }],
        })
        brief = claudeRes.text || null
      } catch (err) {
        // Brief generation is non-critical — build a fallback
        console.error('Brief generation failed:', err)
      }
    }

    // Fallback brief when AI generation fails
    if (!brief && hasMeaningfulData) {
      const parts: string[] = []
      if (needsAttention.length > 0) {
        parts.push(`${needsAttention.length} item${needsAttention.length === 1 ? '' : 's'} need${needsAttention.length === 1 ? 's' : ''} your attention today.`)
      }
      if (nextGig) {
        const gigDate = new Date(nextGig.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
        parts.push(`Next up: ${nextGig.title} at ${nextGig.venue} on ${gigDate}.`)
      } else if (allUpcomingGigs.length === 0) {
        parts.push('No upcoming gigs on the calendar. Time to send some booking pitches.')
      }
      if (parts.length > 0) brief = parts.join(' ')
    }

    const nextScheduledPost = nextScheduledPostResult.data?.[0] ?? null

    // Derive advance + travel + set_time status for next gig.
    // Travel splits into hotel + transport so a hotel-only booking doesn't
    // falsely mark "travel ✓". Ground transfers ride on whichever transport
    // row they belong to and don't drive the pill state on their own.
    // Hometown gigs (location matches "london") need neither pill.
    let nextGigPrep: { advance_done: boolean; hotel_booked: boolean; transport_booked: boolean; ground_booked: boolean; is_hometown: boolean; set_time_confirmed: boolean } | null = null
    if (nextGig) {
      const hasCompletedAdvance = (advancesResult.data ?? []).some(
        (a) => a.gig_id === nextGig.id && a.status === 'completed'
      )
      const gigTravel = travelBookings.filter(t => t.gig_id === nextGig.id)
      const hotelBooked = gigTravel.some(t => t.type === 'hotel')
      const transportBooked = gigTravel.some(t => t.type === 'flight' || t.type === 'train')
      const groundBooked = gigTravel.some(t => t.type === 'ground')
      const isHometown = (nextGig.location || '').toLowerCase().includes('london')
      let hasSetTime = false
      try {
        const { data: gigDetail } = await supabase
          .from('gigs')
          .select('set_time')
          .eq('id', nextGig.id)
          .single()
        hasSetTime = !!gigDetail?.set_time
      } catch {}
      nextGigPrep = { advance_done: hasCompletedAdvance, hotel_booked: hotelBooked, transport_booked: transportBooked, ground_booked: groundBooked, is_hometown: isHometown, set_time_confirmed: hasSetTime }
    }

    return NextResponse.json({
      brief,
      needs_attention: needsAttention,
      next_gig: nextGig,
      next_gig_prep: nextGigPrep,
      upcoming_gigs: allUpcomingGigs,
      content_pipeline: {
        drafts: draftPosts.length,
        scheduled: pendingPosts.length,
        approved: approvedPosts.length,
      },
      stats: {
        confirmed_gigs: confirmedGigsResult.count ?? 0,
        tracks: tracksResult.count ?? 0,
        queued_content: queuedContentResult.count ?? 0,
        sets: setsResult.count ?? 0,
        releases: releasesResult.count ?? 0,
      },
      next_scheduled_post: nextScheduledPost,
      recent_activity: notifications,
      tasks: tasksResult.data ?? [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
