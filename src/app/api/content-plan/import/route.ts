import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  try {
    const { image, mediaType = 'image/jpeg' } = await req.json()
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const today = new Date().toISOString().split('T')[0]

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: image },
            },
            {
              type: 'text',
              text: `You are parsing a social media content plan/rollout schedule from this image. Today is ${today}.

Extract every post, row, or content item you can see and return them as a JSON array. Infer missing fields where possible.

Return ONLY a valid JSON array with this exact format:
[
  {
    "platform": "Instagram" | "TikTok" | "Threads" | "X / Twitter",
    "caption": "the caption text or description of the post",
    "format": "post" | "story" | "reel" | "video",
    "scheduled_at": "YYYY-MM-DDTHH:MM:00",
    "notes": "any extra context or notes visible",
    "featured_track": "track title if mentioned or null"
  }
]

Rules:
- If dates are relative (e.g. "Day 1", "Week 1"), calculate from today (${today})
- If no time is specified, use 10:00 for morning posts, 18:00 for evening posts, 12:00 as default
- If platform is not specified, default to "Instagram"
- If format is not specified, use "post"
- Include every row you can see — don't skip any
- Return ONLY the JSON array, no other text`,
            },
          ],
        }],
      }),
    })

    const data = await res.json()
    const raw = data.content?.[0]?.text?.trim() || '[]'
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

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
