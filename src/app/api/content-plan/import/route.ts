import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

// Vision endpoint — parses a social schedule screenshot into structured posts.
// Brain-wired so pricing + usage log attributes to the right user and the
// extraction inherits the artist's casing rules (in case the OCR-to-caption
// step needs to preserve brand-name spelling).
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    const { image, mediaType = 'image/jpeg' } = await req.json()
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const today = new Date().toISOString().split('T')[0]

    const taskInstruction = `You are parsing a social media content plan/rollout schedule from an image. Today is ${today}.

Extract every post, row, or content item you can see and return as a JSON array (no markdown fences):
[
  {
    "platform": "Instagram" | "TikTok" | "Threads" | "X / Twitter",
    "caption": "caption text or description",
    "format": "post" | "story" | "reel" | "video",
    "scheduled_at": "YYYY-MM-DDTHH:MM:00",
    "notes": "any extra context",
    "featured_track": "track title or null"
  }
]

Rules:
- If dates are relative ("Day 1", "Week 1"), calculate from today (${today}).
- If no time is specified: 10:00 for morning, 18:00 for evening, 12:00 default.
- If platform not specified, default to "Instagram".
- If format not specified, use "post".
- Include every row you can see — don't skip any.
- Return ONLY the JSON array, no other text.`

    const result = await callClaudeWithBrain({
      userId,
      task: 'gig.content',
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      taskInstruction,
      runPostCheck: false,
      messagesOverride: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: 'Parse this content plan per the task above.' },
        ],
      }],
    })

    const clean = result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let posts: any[]
    try {
      posts = JSON.parse(clean)
    } catch {
      return NextResponse.json({ error: 'Could not parse schedule from image' }, { status: 422 })
    }
    return NextResponse.json({ posts, count: posts.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
