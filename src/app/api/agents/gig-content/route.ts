import { NextRequest, NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

// POST /api/agents/gig-content
// Called internally after a confirmed gig is created.
// Generates 3 content draft posts: pre-show hype, day-of story, post-show recap.
// Saves them to scheduled_posts table and fires a notification.
//
// Auth: requires a signed-in user. The caller's user_id scopes the gig
// lookup so one user can't generate content for another user's gig. Paid
// Claude call — do not leave open.

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient: supabase } = gate

  try {
    const { gigId } = await req.json()
    if (!gigId) return NextResponse.json({ error: 'gigId required' }, { status: 400 })

    // Fetch the gig — scoped to the caller. Prevents cross-tenant content gen.
    const { data: gig, error: gigError } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', gigId)
      .eq('user_id', user.id)
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

    // Brain wraps: loads operating context (artist identity, casing, voice,
    // priority mission, active rules) so no hardcoded "Night Manoeuvres".
    const userMessage = `Gig details:
- Venue: ${venue}${location ? ` in ${location}` : ''}
- Date: ${dayOfWeek} ${formattedDate}`

    const taskInstruction = `Generate exactly 3 Instagram captions for this gig: one pre-show (3 days before), one day-of (behind-the-scenes angle), one post-show (day-after recap).

Keep each under 30 words. Lowercase. No hashtags. No emojis unless they truly land. Minimal punctuation. Return ONLY valid JSON — no markdown, no explanation:

[
  { "type": "pre_show", "caption": "..." },
  { "type": "day_of", "caption": "..." },
  { "type": "post_show", "caption": "..." }
]`

    const brain = await callClaudeWithBrain({
      userId: user.id,
      task: 'gig.content',
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      userMessage,
      taskInstruction,
      runPostCheck: false, // JSON-wrapper; per-caption checks run on generation
    })

    const raw = brain.text.trim() || '[]'

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
        user_id: user.id,
        type: 'content_review',
        title: `${saved} content drafts created — ${venue}`,
        message: `Pre-show hype, day-of story, and post-show recap ready to review in Broadcast.`,
        href: '/broadcast',
        gig_id: gigId,
      })
    }

    return NextResponse.json({ success: true, saved, gigId, venue })
  } catch (err: any) {
    await createNotification({ type: 'cron_error', title: 'Gig content agent failed', message: err instanceof Error ? err.message : 'Unknown error' })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
