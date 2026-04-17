import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient: supabase } = gate

  try {
    const now = new Date()
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const todayISO = now.toISOString()

    // Query all tables in parallel
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
        .eq('user_id', user.id)
        .gte('date', todayISO)
        .lte('date', in30Days)
        .order('date', { ascending: true }),

      // All upcoming gigs (any status, for the upcoming dates section)
      supabase
        .from('gigs')
        .select('id, title, venue, location, date, status')
        .eq('user_id', user.id)
        .gte('date', todayISO)
        .order('date', { ascending: true })
        .limit(5),

      // Overdue invoices
      supabase
        .from('invoices')
        .select('id, gig_title, amount, currency, status, due_date')
        .eq('user_id', user.id)
        .or(`status.eq.overdue,and(due_date.lt.${todayISO},status.neq.paid)`),

      // Posts needing approval
      supabase
        .from('scheduled_posts')
        .select('id, platform, caption, scheduled_at')
        .eq('user_id', user.id)
        .eq('status', 'scheduled'),

      // Draft posts
      supabase
        .from('scheduled_posts')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'draft'),

      // Approved posts (queued for publish)
      supabase
        .from('scheduled_posts')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'approved'),

      // Travel bookings for upcoming gigs
      supabase
        .from('travel_bookings')
        .select('id, gig_id')
        .eq('user_id', user.id),

      // Incomplete advances
      supabase
        .from('advance_requests')
        .select('id, gig_id, status')
        .eq('user_id', user.id)
        .neq('status', 'completed'),

      // Recent notifications
      supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),

      // Confirmed gigs count (all future)
      supabase
        .from('gigs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('date', todayISO)
        .eq('status', 'confirmed'),

      // Total tracks count
      supabase
        .from('dj_tracks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),

      // All queued content (scheduled + approved + draft)
      supabase
        .from('scheduled_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['draft', 'scheduled', 'approved']),

      // Sets count
      supabase
        .from('dj_sets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),

      // Releases count
      supabase
        .from('releases')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),

      // Next scheduled post
      supabase
        .from('scheduled_posts')
        .select('id, platform, caption, scheduled_at, media_url, media_urls')
        .eq('user_id', user.id)
        .in('status', ['draft', 'scheduled', 'approved'])
        .gte('scheduled_at', todayISO)
        .order('scheduled_at', { ascending: true })
        .limit(1),

      // Open tasks
      supabase
        .from('tasks')
        .select('id, title, status, priority, created_at')
        .eq('user_id', user.id)
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5),
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
    if (pendingPosts.length > 0) {
      needsAttention.push({
        type: 'post_approval',
        count: pendingPosts.length,
        label: `${pendingPosts.length} post${pendingPosts.length === 1 ? '' : 's'} need${pendingPosts.length === 1 ? 's' : ''} approval`,
        href: '/calendar',
      })
    }

    // Overdue invoices
    if (overdueInvoices.length > 0) {
      needsAttention.push({
        type: 'overdue_invoice',
        count: overdueInvoices.length,
        label: `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'}`,
        href: '/business/finances',
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
    if (missingAdvanceCount > 0) {
      needsAttention.push({
        type: 'missing_advance',
        count: missingAdvanceCount,
        label: `${missingAdvanceCount} gig${missingAdvanceCount === 1 ? '' : 's'} missing advance info`,
        href: '/gigs',
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
      needsAttention.push({
        type: 'unbooked_travel',
        count: gigsNeedingTravel.length,
        label: `${gigsNeedingTravel.length} upcoming gig${gigsNeedingTravel.length === 1 ? '' : 's'} without travel booked`,
        href: '/gigs',
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

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 150,
            system: 'You are Signal Lab OS. Write a 2-sentence morning brief for an electronic music artist. Be concise and actionable. No emojis. No AI-sounding language.',
            messages: [{ role: 'user', content: `Here is today's state:\n${stateDescription}` }],
          }),
        })
        const claudeData = await claudeRes.json()
        brief = claudeData.content?.[0]?.text || null
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

    // Derive advance + travel + set_time status for next gig
    let nextGigPrep: { advance_done: boolean; travel_booked: boolean; set_time_confirmed: boolean } | null = null
    if (nextGig) {
      const hasCompletedAdvance = (advancesResult.data ?? []).some(
        (a) => a.gig_id === nextGig.id && a.status === 'completed'
      )
      const hasTravelBooked = travelBookings.some(
        (t) => t.gig_id === nextGig.id
      )
      let hasSetTime = false
      try {
        const { data: gigDetail } = await supabase
          .from('gigs')
          .select('set_time')
          .eq('id', nextGig.id)
          .eq('user_id', user.id)
          .single()
        hasSetTime = !!gigDetail?.set_time
      } catch {}
      nextGigPrep = { advance_done: hasCompletedAdvance, travel_booked: hasTravelBooked, set_time_confirmed: hasSetTime }
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
