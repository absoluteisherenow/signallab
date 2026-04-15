import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

// ── Upload scan completion ───────────────────────────────────────────────────
// Called after all photographer uploads + scans complete for a gig.
// Aggregates scan results and notifies Anthony with a summary.
//
// POST /api/media/scan/complete
// Body: { gigId, totalFiles }
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { gigId, totalFiles } = await req.json()
    if (!gigId) return NextResponse.json({ error: 'No gigId' }, { status: 400 })

    // Get gig info for notification
    const { data: gig } = await supabase
      .from('gigs')
      .select('venue, date')
      .eq('id', gigId)
      .single()

    // Get all scan results for this gig from the last hour
    // (scoped to recent uploads to avoid counting old scans)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: scans } = await supabase
      .from('media_scans')
      .select('verdict, composite_score')
      .eq('gig_id', gigId)
      .gte('created_at', oneHourAgo)

    if (!scans?.length) {
      return NextResponse.json({ notified: false, reason: 'No recent scans found' })
    }

    // Aggregate verdicts
    const postCount = scans.filter(s => s.verdict === 'POST IT').length
    const tweakCount = scans.filter(s => s.verdict === 'TWEAK').length
    const reconsiderCount = scans.filter(s => s.verdict === 'RECONSIDER').length
    const dontPostCount = scans.filter(s => s.verdict === "DON'T POST").length
    const videoCount = scans.filter(s => s.verdict === 'VIDEO_PENDING').length

    const scored = scans.filter(s => s.composite_score != null && s.composite_score > 0)
    const avgScore = scored.length
      ? Math.round(scored.reduce((a, s) => a + (s.composite_score || 0), 0) / scored.length)
      : 0

    const venueName = gig?.venue || 'Unknown venue'
    const gigDate = gig?.date
      ? new Date(gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : ''

    // Build summary
    const parts: string[] = []
    if (postCount) parts.push(`${postCount} POST IT`)
    if (tweakCount) parts.push(`${tweakCount} TWEAK`)
    if (reconsiderCount) parts.push(`${reconsiderCount} RECONSIDER`)
    if (dontPostCount) parts.push(`${dontPostCount} skip`)
    if (videoCount) parts.push(`${videoCount} video${videoCount > 1 ? 's' : ''} need review`)

    const fileCount = totalFiles || scans.length

    await createNotification({
      type: 'content_review',
      title: `${fileCount} file${fileCount !== 1 ? 's' : ''} uploaded \u2014 ${venueName}${gigDate ? ` / ${gigDate}` : ''}`,
      message: parts.join(' \u00b7 ') + (avgScore ? ` \u00b7 Avg score: ${avgScore}` : ''),
      href: `/gigs/${gigId}`,
      gig_id: gigId,
    })

    return NextResponse.json({
      notified: true,
      summary: {
        total: fileCount,
        postCount,
        tweakCount,
        reconsiderCount,
        dontPostCount,
        videoCount,
        avgScore,
      },
    })
  } catch (err: any) {
    console.error('Scan complete notification error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
