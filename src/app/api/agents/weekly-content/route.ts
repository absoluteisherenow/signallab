import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { SKILLS_WEEKLY_AGENT } from '@/lib/skillPrompts'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Monday 07:00 Europe/London — per-user weekly content plan.
// Brain-wired: every user gets a plan grounded in their own artist identity,
// voice, and active mission. The cron iterates `artist_profiles.user_id` so
// new users are picked up automatically — no hardcoded artist anywhere.

async function getTopPerformingFormats() {
  try {
    const { data } = await supabase
      .from('post_performance')
      .select('artist_name, caption, likes, comments, media_type, engagement_score')
      .order('engagement_score', { ascending: false })
      .limit(25)
    return data || []
  } catch {
    return []
  }
}

async function getUpcomingGigsForUser(userId: string, today: Date, in30Days: Date) {
  try {
    const { data } = await supabase
      .from('gigs')
      .select('title, venue, location, date, status, audience')
      .eq('user_id', userId)
      .gte('date', today.toISOString().split('T')[0])
      .lte('date', in30Days.toISOString().split('T')[0])
      .neq('status', 'cancelled')
      .order('date', { ascending: true })
    return data || []
  } catch {
    return []
  }
}

async function getUpcomingReleasesForUser(userId: string) {
  try {
    const { data } = await supabase
      .from('releases')
      .select('title, type, release_date, label, notes')
      .eq('user_id', userId)
      .gte('release_date', new Date().toISOString().split('T')[0])
      .order('release_date', { ascending: true })
      .limit(5)
    return data || []
  } catch {
    return []
  }
}

async function generatePlanForUser(userId: string, today: Date, in30Days: Date, topPosts: any[]) {
  const [gigs, releases] = await Promise.all([
    getUpcomingGigsForUser(userId, today, in30Days),
    getUpcomingReleasesForUser(userId),
  ])

  const gigContext = gigs.length
    ? gigs.map((g: any) =>
        `- ${g.title} at ${g.venue}, ${g.location} on ${new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${g.audience ? ` (${g.audience} cap.)` : ''}`
      ).join('\n')
    : 'No upcoming gigs confirmed this week'

  const releaseContext = releases.length
    ? `\nUPCOMING RELEASES:\n${releases.map((r: any) =>
        `- ${r.title} (${r.type}) — out ${new Date(r.release_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${r.label ? ` on ${r.label}` : ''}${r.notes ? ` — ${r.notes}` : ''}`
      ).join('\n')}`
    : ''

  let engagementContext = 'Real engagement data: not yet available (scan reference artists to improve plan quality).'
  if (topPosts.length >= 3) {
    const avgEngagement = Math.round(topPosts.reduce((s, p) => s + (p.engagement_score || 0), 0) / topPosts.length)
    const mediaBreakdown = topPosts.reduce((acc: Record<string, number>, p) => {
      acc[p.media_type] = (acc[p.media_type] || 0) + 1
      return acc
    }, {})
    const shortCaptionCount = topPosts.filter((p) => (p.caption || '').split(' ').length < 10).length
    engagementContext = `REAL ENGAGEMENT DATA — top ${topPosts.length} posts in the lane:
Average engagement score: ${avgEngagement} (likes + 3× comments)
Media breakdown: ${Object.entries(mediaBreakdown).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => `${k}: ${v}`).join(', ')}
Short captions (<10 words): ${shortCaptionCount}/${topPosts.length} of top performers

Top 10 highest-performing posts:
${topPosts.slice(0, 10).map((p, i) =>
  `${i + 1}. [${p.artist_name}] ${(p.media_type || 'post').toUpperCase()} — ${p.likes || 0} likes, ${p.comments || 0} comments
   "${(p.caption || '').slice(0, 110)}"`
).join('\n')}`
  }

  const taskInstruction = `You are a social media strategist. Every post you plan must be grounded in the real engagement data provided. Reference actual numbers in your notes. Match voice patterns that got the highest engagement. Never invent trends or formats not supported by the real data.

${SKILLS_WEEKLY_AGENT}

Return ONLY valid JSON (no markdown fences):
[
  {
    "day": "Mon",
    "platform": "instagram",
    "caption": "caption in lane voice",
    "format": "post|carousel|reel|story",
    "notes": "Evidence-based reason: cite real data from above"
  }
]`

  const userMessage = `Generate a 5-post content plan for this week.

UPCOMING GIGS:
${gigContext}
${releaseContext}

${engagementContext}

For each post:
1. Choose a format proven by the engagement data (reference the actual numbers in your notes).
2. Match the voice patterns from the reference profiles exactly.
3. If there's a gig or release this week, build a post around it.
4. Notes must cite the real evidence — e.g. "Video posts averaged 2.1k eng in this lane".`

  const result = await callClaudeWithBrain({
    userId,
    task: 'gig.content',
    model: 'claude-sonnet-4-6',
    max_tokens: 1400,
    userMessage,
    taskInstruction,
    runPostCheck: false,
  })

  let posts: any[] = []
  try {
    posts = JSON.parse(result.text.replace(/```json|```/g, '').trim())
  } catch {
    return { posts: [], gigs, releases }
  }
  return { posts, gigs, releases }
}

export async function GET() {
  try {
    const nowLondon = new Date(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }))
    const today = nowLondon
    const in30Days = new Date(today.getTime() + 30 * 86400000)

    // Shared lane-wide engagement data — same for every user
    const topPosts = await getTopPerformingFormats()

    // Enumerate all users with an artist profile
    const { data: artists, error: artistsErr } = await supabase
      .from('artist_profiles')
      .select('user_id')
      .not('user_id', 'is', null)

    if (artistsErr) throw artistsErr
    if (!artists?.length) return NextResponse.json({ ran: true, users: 0, saved: 0 })

    const userIds = [...new Set(artists.map((a: any) => a.user_id).filter(Boolean))]

    const dayOffset: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
    const monday = new Date(today)
    monday.setDate(today.getDate() - today.getDay() + 1)
    const weekStart = new Date(monday).toISOString()

    let totalSaved = 0
    const perUser: Array<{ user_id: string; saved: number; posts: number }> = []

    for (const userId of userIds) {
      try {
        const { posts, gigs } = await generatePlanForUser(userId, today, in30Days, topPosts as any[])
        let saved = 0
        for (const post of posts) {
          const offset = dayOffset[post.day] ?? 0
          const postDate = new Date(monday)
          postDate.setDate(monday.getDate() + offset)
          postDate.setHours(10, 0, 0, 0)
          // TODO(multi-tenant): scheduled_posts has no user_id column yet;
          // once migrated, set `user_id: userId` here so RLS scopes.
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
        totalSaved += saved

        // Dedup: only notify if no identical unread notification exists from this week
        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'system')
          .eq('title', `This week's content plan is ready`)
          .gte('created_at', weekStart)
          .limit(1)

        if (saved > 0 && (!existingNotif || existingNotif.length === 0)) {
          await createNotification({
            user_id: userId,
            type: 'system',
            title: `This week's content plan is ready`,
            message: `${saved} posts drafted. Review in Broadcast →`,
            href: '/broadcast/calendar',
          })
        }

        perUser.push({ user_id: userId, saved, posts: posts.length })
      } catch (userErr: any) {
        perUser.push({ user_id: userId, saved: 0, posts: 0 })
        console.error(`weekly-content: user ${userId} failed`, userErr)
      }
    }

    return NextResponse.json({
      ran: true,
      users: userIds.length,
      totalSaved,
      perUser,
    })
  } catch (err: any) {
    await createNotification({ type: 'cron_error', title: 'Weekly content agent failed', message: err instanceof Error ? err.message : 'Unknown error' })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
