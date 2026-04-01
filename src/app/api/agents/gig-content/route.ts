import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST /api/agents/gig-content
// Called internally after a confirmed gig is created.
// Generates 3 content draft posts: pre-show hype, day-of story, post-show recap.
// Saves them to scheduled_posts table and fires a notification.

export async function POST(req: NextRequest) {
  try {
    const { gigId } = await req.json()
    if (!gigId) return NextResponse.json({ error: 'gigId required' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'No ANTHROPIC_API_KEY' }, { status: 500 })

    // Fetch the gig
    const { data: gig, error: gigError } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', gigId)
      .single()

    if (gigError || !gig) {
      return NextResponse.json({ error: 'Gig not found' }, { status: 404 })
    }

    const gigDate = new Date(gig.date)
    const venue: string = gig.venue || gig.title || 'the venue'
    const location: string = gig.location || ''
    const dayOfWeek = gigDate.toLocaleDateString('en-GB', { weekday: 'long' })
    const formattedDate = gigDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

    // Dates for the three posts
    const preShowDate = new Date(gigDate.getTime() - 3 * 86400000) // 3 days before
    const dayOfDate = new Date(gigDate) // gig day
    const postShowDate = new Date(gigDate.getTime() + 1 * 86400000) // day after

    // Set all to 10:00 local time
    ;[preShowDate, dayOfDate, postShowDate].forEach(d => d.setHours(10, 0, 0, 0))

    const prompt = `Generate 3 social media post captions for a DJ/electronic music artist (Night Manoeuvres).

Gig details:
- Venue: ${venue}${location ? ` in ${location}` : ''}
- Date: ${dayOfWeek} ${formattedDate}

Write exactly 3 captions. Keep each under 30 words. Lowercase. No hashtags. No emojis unless they really land. Minimal punctuation. Return ONLY valid JSON — no markdown, no explanation:

[
  {
    "type": "pre_show",
    "caption": "3-days-before hype post — e.g. 'playing ${venue} this ${dayOfWeek}...'"
  },
  {
    "type": "day_of",
    "caption": "gig day — behind the scenes angle, feeling in the room"
  },
  {
    "type": "post_show",
    "caption": "day after recap — e.g. 'last night at ${venue}...'"
  }
]`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const aiData = await response.json()
    const raw = aiData.content?.[0]?.text?.trim() || '[]'

    let drafts: { type: string; caption: string }[] = []
    try {
      drafts = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({ error: 'Parse failed', raw }, { status: 500 })
    }

    const scheduleMap: Record<string, Date> = {
      pre_show: preShowDate,
      day_of: dayOfDate,
      post_show: postShowDate,
    }

    let saved = 0
    for (const draft of drafts) {
      const scheduledAt = scheduleMap[draft.type]
      if (!scheduledAt || !draft.caption) continue

      const { error: insertError } = await supabase.from('scheduled_posts').insert([{
        platform: 'instagram',
        caption: draft.caption,
        format: 'post',
        scheduled_at: scheduledAt.toISOString(),
        status: 'draft',
        notes: `Auto-generated for ${venue} — ${draft.type.replace('_', ' ')}`,
        gig_title: gig.title || venue,
        gig_id: gigId,
      }])

      if (!insertError) saved++
    }

    if (saved > 0) {
      await createNotification({
        type: 'system',
        title: `${saved} content drafts created — ${venue}`,
        message: `Pre-show hype, day-of story, and post-show recap ready to review in Broadcast.`,
        href: '/broadcast',
        gig_id: gigId,
      })
    }

    return NextResponse.json({ success: true, saved, gigId, venue })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
