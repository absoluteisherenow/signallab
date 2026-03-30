import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Triggered every Monday at 07:00 via Vercel Cron
// Generates a 5-post content plan for the week based on upcoming gigs → saves as drafts
export async function GET() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

    const today = new Date()
    const in30Days = new Date(today.getTime() + 30 * 86400000)

    // Get upcoming gigs
    const { data: gigs } = await supabase
      .from('gigs')
      .select('title, venue, location, date, status')
      .gte('date', today.toISOString().split('T')[0])
      .lte('date', in30Days.toISOString().split('T')[0])
      .neq('status', 'cancelled')
      .order('date', { ascending: true })

    // Get artist settings for tone/reference
    const { data: settings } = await supabase
      .from('artist_settings')
      .select('profile')
      .limit(1)
      .single()

    const artistName = settings?.profile?.name || 'Night Manoeuvres'
    const artistGenre = settings?.profile?.genre || 'electronic / techno'
    const artistBio = settings?.profile?.bio || ''

    const gigContext = gigs?.length
      ? gigs.map(g => `- ${g.title} at ${g.venue}, ${g.location} on ${new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`).join('\n')
      : 'No upcoming gigs confirmed yet'

    // Generate content plan via Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: `You are a social media strategist for electronic music artists. Write in a minimal, atmospheric tone — no hashtag spam, no emojis, no hype. Think underground, honest, intentional.`,
        messages: [{
          role: 'user',
          content: `Generate a 5-post content plan for this week for ${artistName} (${artistGenre}).
${artistBio ? `Bio: ${artistBio}` : ''}

Upcoming shows:
${gigContext}

Create 5 posts spread across Mon–Fri. Mix of: show announcements, behind-the-scenes, music thoughts, atmospheric/mood content. Each post should feel distinct.

Return ONLY a valid JSON array, no markdown:
[
  {
    "day": "Mon",
    "platform": "instagram",
    "caption": "full caption text",
    "format": "post",
    "notes": "optional production note e.g. use live photo from last show"
  }
]`,
        }],
      }),
    })

    const aiData = await response.json()
    const raw = aiData.content?.[0]?.text || '[]'

    let posts: Array<{ day: string; platform: string; caption: string; format: string; notes?: string }> = []
    try {
      posts = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({ error: 'Claude returned invalid JSON', raw }, { status: 500 })
    }

    // Map day names to actual dates (Mon–Fri of current week)
    const dayOffset: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
    const monday = new Date(today)
    monday.setDate(today.getDate() - today.getDay() + 1) // This Monday

    let saved = 0
    for (const post of posts) {
      const offset = dayOffset[post.day] ?? 0
      const postDate = new Date(monday)
      postDate.setDate(monday.getDate() + offset)
      postDate.setHours(10, 0, 0, 0) // Default 10am

      const { error } = await supabase.from('scheduled_posts').insert([{
        platform: post.platform || 'instagram',
        caption: post.caption,
        format: post.format || 'post',
        scheduled_at: postDate.toISOString(),
        status: 'draft',
        gig_title: gigs?.[0]?.title || null,
      }])

      if (!error) saved++
    }

    // Notify artist
    await createNotification({
      type: 'system',
      title: `This week's content is ready`,
      message: `${saved} posts drafted for the week. Review and schedule in Broadcast →`,
      href: '/broadcast/calendar',
    })

    return NextResponse.json({ ran: true, saved, total: posts.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
