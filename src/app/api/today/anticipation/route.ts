import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// "Things I noticed" — a small cross-lab anticipation surface for /today.
//
// The Signal Lab product North Star is wow moments + genuine usefulness. One
// of the three wow levers (from memory: feedback_signallab_product_vision)
// is "the system anticipating the artist's next need before they ask".
//
// This endpoint does the minimum viable version: read a handful of signals
// the artist hasn't explicitly asked about, and surface up to 3 short
// notices, each attributed to the lab that noticed (Set / Broadcast / Grow /
// Operator). Every notice links somewhere actionable so it closes a loop.
//
// Deterministic — no AI call. Cheap, cacheable, reliable.

interface Notice {
  lab: 'Set' | 'Broadcast' | 'Grow' | 'Operator'
  title: string
  detail: string
  href: string
  priority: number
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient: sb } = gate

  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 3600 * 1000).toISOString()
  const in7d = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString()
  const in14d = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString()
  const past7dISO = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString()
  const past24hISO = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

  // Parallel signal fetch — each query is shallow, bounded, and scoped where
  // the table has user_id. Missing user_id tables read globally (pre-migration
  // pattern matches /api/today/brief).
  const [
    imminentGigRes,
    unscannedMediaRes,
    draftPostsRes,
    stalePostsRes,
    releaseSoonRes,
    cronErrorsRes,
  ] = await Promise.all([
    sb.from('gigs')
      .select('id, title, venue, date')
      .gte('date', now.toISOString())
      .lte('date', in48h)
      .order('date', { ascending: true })
      .limit(1),
    // Uploaded media not scored by scanner in the last 24h
    sb.from('media_scans')
      .select('id, file_name, verdict, composite_score, created_at')
      .gte('created_at', past24hISO)
      .order('created_at', { ascending: false })
      .limit(10),
    sb.from('scheduled_posts')
      .select('id, caption, scheduled_at')
      .eq('status', 'draft')
      .limit(10),
    // Scheduled posts queued > 3 days out with no media_url — won't publish
    sb.from('scheduled_posts')
      .select('id, caption, scheduled_at, media_url, media_urls')
      .eq('status', 'scheduled')
      .lte('scheduled_at', in7d)
      .limit(20),
    sb.from('releases')
      .select('id, title, release_date')
      .gte('release_date', now.toISOString().slice(0, 10))
      .lte('release_date', in14d.slice(0, 10))
      .order('release_date', { ascending: true })
      .limit(1),
    // Cron errors in last 7 days — operator signal
    sb.from('cron_runs')
      .select('name, status, started_at')
      .eq('status', 'error')
      .gte('started_at', past7dISO)
      .limit(5),
  ])

  const notices: Notice[] = []

  // Imminent gig within 48h — capture window opens
  const imminentGig = (imminentGigRes.data || [])[0] as { id: string; title: string | null; venue: string | null; date: string } | undefined
  if (imminentGig) {
    const hoursOut = Math.max(0, Math.round((new Date(imminentGig.date).getTime() - now.getTime()) / 3600000))
    notices.push({
      lab: 'Broadcast',
      title: `${hoursOut}h to ${imminentGig.venue || imminentGig.title || 'gig'} — capture window open`,
      detail: 'Soundcheck is your best shot for grid + reel fuel. Keep cams on the backpack.',
      href: `/gigs/${imminentGig.id}`,
      priority: 10,
    })
  }

  // Fresh scans waiting on a decision
  const scans = (unscannedMediaRes.data || []) as Array<{ id: string; file_name: string | null; verdict: string | null; composite_score: number | null }>
  const topScans = scans.filter(s => (s.composite_score ?? 0) >= 70 && s.verdict !== 'DON\'T POST')
  if (topScans.length > 0) {
    notices.push({
      lab: 'Broadcast',
      title: `${topScans.length} fresh image${topScans.length === 1 ? '' : 's'} scored 70+ — ready to schedule`,
      detail: 'Highest-scoring shots from the last 24h. One click into Broadcast closes the loop.',
      href: '/broadcast',
      priority: 8,
    })
  }

  // Draft posts accumulating without media or approval
  const drafts = (draftPostsRes.data || []) as Array<{ id: string }>
  if (drafts.length >= 3) {
    notices.push({
      lab: 'Broadcast',
      title: `${drafts.length} caption drafts sitting unapproved`,
      detail: 'Review and approve in Broadcast so the publish cron can take them live on schedule.',
      href: '/broadcast',
      priority: 6,
    })
  }

  // Scheduled posts missing media — silent publish failure risk
  const stale = (stalePostsRes.data || []) as Array<{ id: string; media_url: string | null; media_urls: string[] | null }>
  const mediaMissing = stale.filter(p => !p.media_url && !(p.media_urls && p.media_urls.length))
  if (mediaMissing.length > 0) {
    notices.push({
      lab: 'Operator',
      title: `${mediaMissing.length} scheduled post${mediaMissing.length === 1 ? '' : 's'} missing media`,
      detail: 'Publish cron will skip these without a media_url. Attach visuals or cancel.',
      href: '/broadcast',
      priority: 9,
    })
  }

  // Upcoming release — rollout prep window
  const release = (releaseSoonRes.data || [])[0] as { id: string; title: string | null; release_date: string } | undefined
  if (release) {
    const daysOut = Math.max(0, Math.round((new Date(release.release_date).getTime() - now.getTime()) / 86400000))
    notices.push({
      lab: 'Grow',
      title: `"${release.title || 'release'}" drops in ${daysOut}d — announce window open`,
      detail: 'Teaser + announce assets slot in now. Curator push goes out in parallel.',
      href: '/broadcast',
      priority: 7,
    })
  }

  // Cron errors — operator visibility
  const cronErrors = (cronErrorsRes.data || []) as Array<{ name: string; started_at: string }>
  if (cronErrors.length > 0) {
    const names = Array.from(new Set(cronErrors.map(c => c.name))).slice(0, 3).join(', ')
    notices.push({
      lab: 'Operator',
      title: `${cronErrors.length} cron error${cronErrors.length === 1 ? '' : 's'} in the last 7d — ${names}`,
      detail: 'Automations silently misfiring cascade fast. Check admin → crons.',
      href: '/admin/crons',
      priority: 5,
    })
  }

  // Cap at 3 — keep the surface tight. Higher priority first.
  const top = notices.sort((a, b) => b.priority - a.priority).slice(0, 3)

  return NextResponse.json({
    user_id: user.id,
    generated_at: now.toISOString(),
    notices: top,
  })
}
