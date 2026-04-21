import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'
import { scrubBrandText } from '@/lib/scrubBrandText'

// Promo DM writer — brain-wired so the outreach voice comes from the artist's
// rules + voice samples instead of a hardcoded "Night Manoeuvres" system
// prompt. The brain also enforces casing + banned patterns + priority anchor
// (promoter gets a DM that references the current mission where relevant).
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    const { track, contacts } = await req.json()
    const genres = [...new Set((contacts || []).map((c: any) => c.genre).filter(Boolean))].join(', ')
    const priorityContacts = (contacts || []).filter((c: any) => c.tier === 'priority').length
    const tierBreakdown = priorityContacts > 0 ? `Includes ${priorityContacts} priority contacts.` : ''

    const taskInstruction = `Write a short, direct, human outreach DM — like one musician messaging another they respect. Underground music industry style: understated confidence, no hype.

Tone rules:
- 3–4 sentences maximum.
- No corporate openers ("hope this finds you", "just wanted to reach out").
- No hyperbole ("exclusive", "banging", "fire", "slap").
- No sign-off like "Best," or "Cheers," — the name will be added separately.
- One emoji at most, and only if it feels natural.
- End with a low-pressure ask — interested to hear what they think, or would love their support.
- Output ONLY the message text. Nothing else.`

    const userMessage = `Write a promo DM for this track:

Title: ${track?.title || 'new track'}
Artist: ${track?.author || ''}
${track?.description ? `SoundCloud description: ${track.description}` : ''}

${genres ? `Being sent to DJs/promoters in: ${genres}` : ''}
${tierBreakdown}

The private SoundCloud link will be added automatically after the message — don't mention "link below" or reference it explicitly.`

    const result = await callClaudeWithBrain({
      userId,
      task: 'release.announce',
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      userMessage,
      taskInstruction,
    })

    const message = scrubBrandText(result.text || '')
    return NextResponse.json({ message })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
