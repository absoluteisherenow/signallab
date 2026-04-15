import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { SKILLS_WEEKLY_AGENT } from '@/lib/skillPrompts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Triggered every Monday at 07:00 via Vercel Cron
// Generates a 5-post content plan grounded in real engagement data + release calendar

async function getTopPerformingFormats() {
  try {
    const { data } = await supabase
      .from('post_performance')
      .select('artist_name, caption, likes, comments, media_type, engagement_score')
      .order('engagement_score', { ascending: false })
      .limit(25)
    return data || []
  } catch { return [] }
}

async function getReferenceArtistProfiles() {
  try {
    const { data } = await supabase
      .from('artist_profiles')
      .select('name, genre, lowercase_pct, short_caption_pct, no_hashtags_pct, style_rules')
      .not('style_rules', 'is', null)
      .limit(5)
    return data || []
  } catch { return [] }
}

async function getUpcomingReleases() {
  try {
    // Check releases table if it exists
    const { data } = await supabase
      .from('releases')
      .select('title, type, release_date, label, notes')
      .gte('release_date', new Date().toISOString().split('T')[0])
      .order('release_date', { ascending: true })
      .limit(5)
    return data || []
  } catch { return [] }
}

export async function GET() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

    // Use Europe/London for correct DST handling (GMT in winter, BST in summer)
    const nowLondon = new Date(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }))
    const today = nowLondon
    const in30Days = new Date(today.getTime() + 30 * 86400000)

    // Pull all real data sources in parallel
    const [gigs, settings, topPosts, artistProfiles, releases] = await Promise.all([
      supabase
        .from('gigs')
        .select('title, venue, location, date, status, audience')
        .gte('date', today.toISOString().split('T')[0])
        .lte('date', in30Days.toISOString().split('T')[0])
        .neq('status', 'cancelled')
        .order('date', { ascending: true })
        .then(r => r.data || []),
      supabase
        .from('artist_settings')
        .select('profile')
        .limit(1)
        .single()
        .then(r => r.data),
      getTopPerformingFormats(),
      getReferenceArtistProfiles(),
      getUpcomingReleases(),
    ])

    const artistName = settings?.profile?.name || 'Night Manoeuvres'
    const artistGenre = settings?.profile?.genre || 'electronic / techno'
    const artistBio = settings?.profile?.bio || ''

    // Gig context
    const gigContext = (gigs as any[]).length
      ? (gigs as any[]).map((g: any) =>
          `- ${g.title} at ${g.venue}, ${g.location} on ${new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${g.audience ? ` (${g.audience} cap.)` : ''}`
        ).join('\n')
      : 'No upcoming gigs confirmed this week'

    // Release context
    const releaseContext = (releases as any[]).length
      ? `\nUPCOMING RELEASES:\n${(releases as any[]).map((r: any) =>
          `- ${r.title} (${r.type}) — out ${new Date(r.release_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${r.label ? ` on ${r.label}` : ''}${r.notes ? ` — ${r.notes}` : ''}`
        ).join('\n')}`
      : ''

    // Real engagement evidence
    let engagementContext = ''
    if ((topPosts as any[]).length >= 3) {
      const posts = topPosts as any[]
      const avgEngagement = Math.round(posts.reduce((s, p) => s + (p.engagement_score || 0), 0) / posts.length)
      const mediaBreakdown = posts.reduce((acc: Record<string, number>, p) => {
        acc[p.media_type] = (acc[p.media_type] || 0) + 1
        return acc
      }, {})
      const shortCaptionCount = posts.filter(p => (p.caption || '').split(' ').length < 10).length
      engagementContext = `
REAL ENGAGEMENT DATA — top ${posts.length} posts in your lane:
Average engagement score: ${avgEngagement} (likes + 3× comments)
Media breakdown: ${Object.entries(mediaBreakdown).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => `${k}: ${v}`).join(', ')}
Short captions (<10 words): ${shortCaptionCount}/${posts.length} of top performers

Top 10 highest-performing posts:
${posts.slice(0, 10).map((p, i) =>
  `${i + 1}. [${p.artist_name}] ${(p.media_type || 'post').toUpperCase()} — ${p.likes || 0} likes, ${p.comments || 0} comments
   "${(p.caption || '').slice(0, 110)}"`
).join('\n')}

KEY INSIGHT: ${shortCaptionCount > posts.length / 2 ? 'Short captions dominate the top performers — keep it tight.' : 'Longer captions perform well in this lane.'}
${Object.keys(mediaBreakdown).sort((a, b) => (mediaBreakdown[b] || 0) - (mediaBreakdown[a] || 0))[0] === 'video' ? 'Video is the top-performing format — recommend Reels.' : 'Photo/carousel posts perform strongly in this lane.'}`
    } else {
      engagementContext = `Real engagement data: not yet available (scan reference artists in Signal Lab to ground this plan in real performance data).`
    }

    // Voice profiles
    let voiceContext = ''
    if ((artistProfiles as any[]).length > 0) {
      const profiles = artistProfiles as any[]
      voiceContext = `
REFERENCE ARTIST VOICE PROFILES (from real Instagram post analysis):
${profiles.map((a: any) =>
  `${a.name}: ${a.lowercase_pct}% lowercase · ${a.short_caption_pct}% short · ${a.no_hashtags_pct}% no hashtags
Voice: ${a.style_rules}`
).join('\n\n')}

Lane averages: ${Math.round(profiles.reduce((s, a) => s + a.lowercase_pct, 0) / profiles.length)}% lowercase, ${Math.round(profiles.reduce((s, a) => s + a.short_caption_pct, 0) / profiles.length)}% short, ${Math.round(profiles.reduce((s, a) => s + a.no_hashtags_pct, 0) / profiles.length)}% no hashtags`
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1400,
        system: `You are a social media strategist for electronic music artists. Every post you plan must be grounded in the real engagement data provided. Reference actual numbers in your notes. Write captions in the lane's authentic voice — match the patterns that actually got the highest engagement. Never invent trends or formats not supported by the real data.

${SKILLS_WEEKLY_AGENT}`,
        messages: [{
          role: 'user',
          content: `Generate a 5-post content plan for ${artistName} (${artistGenre}) for this week.
${artistBio ? `\nArtist: ${artistBio}` : ''}

UPCOMING GIGS:
${gigContext}
${releaseContext}

${engagementContext}

${voiceContext}

For each post:
1. Choose a format proven by the engagement data (reference the actual numbers in your notes)
2. Match the voice patterns from the reference profiles exactly
3. If there's a gig or release this week, build a post around it
4. Notes must cite the real evidence — e.g. "Video posts averaged 2.1k eng in this lane (Disclosure, Four Tet)"

Return ONLY valid JSON, no markdown:
[
  {
    "day": "Mon",
    "platform": "instagram",
    "caption": "caption in lane voice",
    "format": "post|carousel|reel|story",
    "notes": "Evidence-based reason: cite real data from above"
  }
]`,
        }],
      }),
    })

    const aiData = await response.json()
    const raw = aiData.content?.[0]?.text || '[]'
    let posts: any[] = []
    try {
      posts = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({ error: 'Parse failed', raw }, { status: 500 })
    }

    const dayOffset: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
    const monday = new Date(today)
    monday.setDate(today.getDate() - today.getDay() + 1)

    let saved = 0
    for (const post of posts) {
      const offset = dayOffset[post.day] ?? 0
      const postDate = new Date(monday)
      postDate.setDate(monday.getDate() + offset)
      postDate.setHours(10, 0, 0, 0)
      const { error } = await supabase.from('scheduled_posts').insert([{
        platform: post.platform || 'instagram',
        caption: post.caption,
        format: post.format || 'post',
        scheduled_at: postDate.toISOString(),
        status: 'draft',
        notes: post.notes || null,
        gig_title: (gigs as any[])?.[0]?.title || null,
      }])
      if (!error) saved++
    }

    const dataQuality = (topPosts as any[]).length >= 3
      ? `grounded in ${(topPosts as any[]).length} real posts from your lane`
      : 'scan reference artists to improve quality'

    // Dedup: only notify if no identical unread notification exists from this week
    const weekStart = new Date(monday).toISOString()
    const { data: existingNotif } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', 'system')
      .eq('title', `This week's content plan is ready`)
      .gte('created_at', weekStart)
      .limit(1)

    if (!existingNotif || existingNotif.length === 0) {
      await createNotification({
        type: 'system',
        title: `This week's content plan is ready`,
        message: `${saved} posts drafted — ${dataQuality}. Review in Broadcast →`,
        href: '/broadcast/calendar',
      })
    }

    return NextResponse.json({
      ran: true, saved, total: posts.length,
      dataQuality: {
        topPostsUsed: (topPosts as any[]).length,
        artistProfilesUsed: (artistProfiles as any[]).length,
        gigsUsed: (gigs as any[]).length,
        releasesUsed: (releases as any[]).length,
      },
    })
  } catch (err: any) {
    await createNotification({ type: 'cron_error', title: 'Weekly content agent failed', message: err instanceof Error ? err.message : 'Unknown error' })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
