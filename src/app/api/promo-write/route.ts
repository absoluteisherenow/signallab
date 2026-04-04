import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { track, contacts } = await req.json()
    // track: { title, author, description }
    // contacts: [{ name, genre, tier }]

    const genres = [...new Set((contacts || []).map((c: any) => c.genre).filter(Boolean))].join(', ')
    const tierBreakdown = (contacts || []).filter((c: any) => c.tier === 'priority').length > 0
      ? `Includes ${(contacts || []).filter((c: any) => c.tier === 'priority').length} priority contacts.`
      : ''

    const systemPrompt = `You write outreach DMs for Night Manoeuvres, an underground electronic music artist. Your job is to write short, direct, human messages to DJs, promoters, and labels — not press releases.

Tone rules:
- Direct and human. Like one musician messaging another they respect.
- Underground music industry style — understated confidence, no hype.
- Short. 3–4 sentences maximum.
- No corporate openers ("hope this finds you", "just wanted to reach out").
- No excessive emojis. One at most, only if it feels natural.
- No sign-off like "Best," or "Cheers," — the name will be added separately.
- Never say "exclusive", "banging", "fire", "slap", or any hyperbole.
- End with a low-pressure ask — interested to hear what they think, or would love their support.`

    const userPrompt = `Write a promo DM for this track:

Title: ${track.title || 'new track'}
Artist: ${track.author || 'Night Manoeuvres'}
${track.description ? `SoundCloud description: ${track.description}` : ''}

${genres ? `Being sent to DJs/promoters in: ${genres}` : ''}
${tierBreakdown}

The private SoundCloud link will be added automatically after the message — don't mention "link below" or reference it explicitly. Just write the message.

Output only the message text. Nothing else.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Write failed' }, { status: 500 })

    const message = data.content?.[0]?.text || ''
    return NextResponse.json({ message })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
