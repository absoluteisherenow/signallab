import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// On-demand content plan: user picks N posts, system suggests strongest
// based on real engagement data, gigs, releases, and voice profiles

export async function POST(req: NextRequest) {
  try {
    const { count = 5, period = 'week', weekOffset = 0, monthOffset = 0 } = await req.json()

    const today = new Date()

    // Date range for the period
    let startDate: Date, endDate: Date
    if (period === 'week') {
      startDate = new Date(today)
      startDate.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7)
      startDate.setHours(0, 0, 0, 0)
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 6)
    } else {
      startDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
      endDate = new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 0)
    }

    // Pull all data in parallel
    const [gigsRes, releasesRes, topPostsRes, artistProfilesRes, settingsRes, tracksRes] = await Promise.all([
      supabase.from('gigs').select('title, venue, location, date, status').gte('date', startDate.toISOString().split('T')[0]).lte('date', endDate.toISOString().split('T')[0]).neq('status', 'cancelled').order('date'),
      supabase.from('releases').select('title, type, release_date, label, notes').gte('release_date', new Date(startDate.getTime() - 14 * 86400000).toISOString().split('T')[0]).lte('release_date', endDate.toISOString().split('T')[0]).order('release_date').catch(() => ({ data: [] })),
      supabase.from('post_performance').select('artist_name, caption, likes, comments, media_type, engagement_score').order('engagement_score', { ascending: false }).limit(20).catch(() => ({ data: [] })),
      supabase.from('artist_profiles').select('name, genre, lowercase_pct, short_caption_pct, no_hashtags_pct, style_rules').not('style_rules', 'is', null).limit(4).catch(() => ({ data: [] })),
      supabase.from('artist_settings').select('profile').limit(1).single().catch(() => ({ data: null })),
      supabase.from('dj_tracks').select('title, artist, bpm, key, moment_type').limit(10).order('created_at', { ascending: false }).catch(() => ({ data: [] })),
    ])

    const gigs = gigsRes.data || []
    const releases = (releasesRes as any).data || []
    const topPosts = (topPostsRes as any).data || []
    const artistProfiles = (artistProfilesRes as any).data || []
    const settings = (settingsRes as any).data
    const tracks = (tracksRes as any).data || []

    const artistName = settings?.profile?.name || 'Night Manoeuvres'
    const artistGenre = settings?.profile?.genre || 'electronic / techno'

    // Build release timeline — including teaser dates
    const releaseTimeline = releases.flatMap((r: any) => {
      const rd = new Date(r.release_date)
      const lines = [`RELEASE DAY ${r.release_date}: "${r.title}" (${r.type})${r.label ? ` on ${r.label}` : ''}`]
      // Generate tease windows: 7 days, 3 days before
      const tease7 = new Date(rd); tease7.setDate(rd.getDate() - 7)
      const tease3 = new Date(rd); tease3.setDate(rd.getDate() - 3)
      if (tease7 >= startDate) lines.push(`TEASE OPPORTUNITY ${tease7.toISOString().split('T')[0]}: 7 days to "${r.title}"`)
      if (tease3 >= startDate) lines.push(`TEASE OPPORTUNITY ${tease3.toISOString().split('T')[0]}: 3 days to "${r.title}"`)
      return lines
    }).join('\n')

    // Engagement evidence
    let engagementEvidence = 'No engagement data yet — plan based on lane voice patterns.'
    if (topPosts.length >= 3) {
      const avgEng = Math.round(topPosts.reduce((s: number, p: any) => s + (p.engagement_score || 0), 0) / topPosts.length)
      const videoCount = topPosts.filter((p: any) => p.media_type === 'video').length
      const shortCount = topPosts.filter((p: any) => (p.caption || '').split(' ').length < 10).length
      engagementEvidence = `Real engagement data (${topPosts.length} top posts, avg score ${avgEng}):
- ${videoCount > topPosts.length / 2 ? `Video dominates top ${topPosts.length} posts — recommend Reels for high-engagement posts` : 'Photo/carousel posts perform well'}
- ${shortCount > topPosts.length / 2 ? 'Short captions (<10 words) dominate top performers' : 'Longer captions work in this lane'}
Top examples:
${topPosts.slice(0, 6).map((p: any) => `  [${p.artist_name}] ${p.media_type} — ${p.likes}L/${p.comments}C: "${(p.caption || '').slice(0, 80)}"`).join('\n')}`
    }

    // Voice profiles
    const voiceBrief = artistProfiles.length > 0
      ? artistProfiles.map((a: any) => `${a.name}: ${a.style_rules}`).join('\n\n')
      : 'No reference artists scanned yet — write in minimal electronic music tone: lowercase, no hashtags, short captions.'

    // Recent tracks from library (for music selection)
    const trackList = tracks.length > 0
      ? `\nRECENT TRACKS IN LIBRARY (suggest as featured_track where relevant):\n${tracks.map((t: any) => `- "${t.title}" by ${t.artist}${t.bpm ? ` ${t.bpm}BPM` : ''}${t.moment_type ? ` (${t.moment_type})` : ''}`).join('\n')}`
      : ''

    // Spread posts across the period with smart day selection
    const periodDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
    const availableDates: string[] = []
    for (let i = 0; i < periodDays; i++) {
      const d = new Date(startDate)
      d.setDate(startDate.getDate() + i)
      availableDates.push(d.toISOString().split('T')[0])
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        system: `You are a social media strategist for electronic music. You select and write the ${count} highest-impact posts for a given period based on real engagement evidence. Every format decision must be justified by actual data. Cite engagement numbers in your notes. Write captions in the lane's voice.`,
        messages: [{
          role: 'user',
          content: `Plan the ${count} STRONGEST posts for ${artistName} (${artistGenre}) covering ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}.

GIGS IN PERIOD:
${gigs.length ? gigs.map((g: any) => `- ${g.date}: ${g.title} at ${g.venue}, ${g.location}`).join('\n') : 'None confirmed'}

RELEASE CALENDAR:
${releaseTimeline || 'No releases in this period'}

${engagementEvidence}

REFERENCE VOICE PROFILES:
${voiceBrief}
${trackList}

Select the ${count} highest-leverage posting opportunities — prioritise: release day, tease windows, gig day/eve, then fill with top-performing formats from the engagement data.

For each post include:
- "scheduled_at": ISO datetime (10am on the target date, e.g. "${availableDates[0]}T10:00:00.000Z")
- "day": formatted date e.g. "Mon 7 Apr"
- "platform": "instagram" | "tiktok" | "threads"
- "format": "post" | "reel" | "carousel" | "story"
- "caption": in lane voice
- "featured_track": track name if music selection is relevant (null if not)
- "notes": cite the actual engagement evidence for why this format/timing was chosen

Return ONLY valid JSON array, no markdown.`,
        }],
      }),
    })

    const aiData = await response.json()
    const raw = aiData.content?.[0]?.text || '[]'
    let posts: any[] = []
    try {
      posts = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({ success: false, error: 'Parse failed', raw }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      posts,
      meta: {
        period, count,
        dateRange: `${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`,
        dataUsed: {
          engagementPosts: topPosts.length,
          artistProfiles: artistProfiles.length,
          gigs: gigs.length,
          releases: releases.length,
          tracksAvailable: tracks.length,
        },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
