import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SKILLS_CAMPAIGN, SKILL_ADS_MANAGER } from '@/lib/skillPrompts'
import { env } from '@/lib/env'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface CampaignPost {
  phase: string
  days_offset: number
  platform: string
  caption: string
  rationale: string
  dm_reply?: string
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data, error } = await supabase
      .from('scheduled_posts')
      .select('id, caption, platform, scheduled_at, status, format_type')
      .eq('release_id', params.id)
      .order('scheduled_at', { ascending: true })

    if (error) throw error
    return NextResponse.json({ posts: data || [] })
  } catch (err: any) {
    return NextResponse.json({ posts: [] })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Fetch release
    const { data: release, error: releaseError } = await supabase
      .from('releases')
      .select('*')
      .eq('id', params.id)
      .single()

    if (releaseError || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    // Fetch artist settings
    const { data: settings } = await supabase
      .from('settings')
      .select('profile')
      .single()

    const profile = settings?.profile || {}
    const artistName = profile.name || 'the artist'
    const genre = profile.genre || 'electronic music'
    const voiceNotes = profile.style_rules || ''

    const releaseDate = new Date(release.release_date)
    const releaseDateStr = releaseDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

    const systemPrompt = `You are a specialist music marketing strategist for electronic music with deep knowledge of what's actually working in 2024–2025. You've studied how artists like Objekt, Overmono, Four Tet, Burial, Floating Points, Peggy Gou, and similar acts build releases. You understand underground culture, what makes a post feel authentic vs corporate, and crucially — what the current platform algorithms reward.

You write in the artist's voice. Not marketing copy. Posts that feel like they came from a real person who makes music and occasionally talks about it online.

WHAT'S WORKING RIGHT NOW (incorporate this intelligence):
- Audio preview clips drive 3-5x more saves and shares than static posts — 20–30 second Reel/TikTok previews of the most arresting section (not the intro, not the obvious hook — the moment that makes a DJ stop)
- 3 audio previews spread across the campaign window outperforms 1 big reveal
- Cryptic pre-announcement content that makes followers feel like insiders builds more anticipation than an explicit teaser
- First-person story posts (studio moment, why this record happened) outperform product announcements by 2x for underground artists
- Short, confident drop day posts outperform long ones — the music should do the work
- Artists in the electronic/club space with understated voices get better engagement by saying less, not more
- Pre-save posts work best when they feel like an invitation, not a CTA
- Post-release content needs to respond to what's actually happened (plays, DJ support, feedback) — generic gratitude gets ignored

COMMENT-TO-ACTION MECHANICS (proven engagement drivers — use naturally in 3–4 posts):
These create genuine interaction loops and signal to the algorithm that a post has traction. Use them where they feel authentic, never forced:
- "comment ◼ if you want to hear this first" — on a preview post, builds insider audience before announce
- "drop your city below" — on the announcement or drop day, geographic data + algorithm fuel
- "comment for the tracklist / full run order" — if there's a set or EP context
- "DM for the original / stems / early access" — creates direct conversation, useful for EP/album releases
- "comment [emoji] if you want a free download link" — drives comment velocity on drop day or post-release
- "link in bio when you do this" — softer version that doesn't feel like a campaign
- These should feel like genuine gestures to the audience, not Instagram tactics. The artist is inviting people in, not gaming an algorithm.

${SKILLS_CAMPAIGN}

${SKILL_ADS_MANAGER}

When generating the campaign, include a PAID AMPLIFICATION section at the end with:
- Which posts to boost and why (based on organic potential)
- Budget allocation across the campaign phases
- Audience targeting recommendations
- Platform-specific ad formats to use
- KPI targets and kill/scale criteria`

    const userPrompt = `Generate a complete 10-post release campaign for:

Artist: ${artistName}
Genre/style: ${genre}
Release: "${release.title}" — ${release.type} on ${release.label || 'independent'}
Release date: ${releaseDateStr}
${voiceNotes ? `Voice/style notes: ${voiceNotes}` : ''}
${release.notes ? `Release notes from artist: ${release.notes}` : ''}

Generate exactly 10 posts:

1. SILENCE BREAKER (days_offset: -18)
Before anything is announced — break the silence. One cryptic image caption, a fragment, a time stamp, a mood. No title. No announcement. Just a feeling that something is coming.
→ End with a comment-to-action: "comment ◼ if you want to hear this first" or similar — builds an insider list before the announcement even drops.

2. AUDIO PREVIEW 1 (days_offset: -14)
First audio clip post. Caption for a 20-30 second Reel/video of the most arresting section. Not the intro — the moment that makes a DJ lean in. Keep the caption minimal, let the clip do the work.
→ Optional: soft comment mechanic — "drop your city" or just let the audio speak.

3. ANNOUNCEMENT (days_offset: -12)
Title. Date. Label. One or two lines. An event, not a press release.
→ Include "drop your city below" — geographic comments signal intent and feed the algorithm. Feels natural for a club-focused release.

4. DEEP DIVE (days_offset: -9)
The real story — where this came from, what it sounds like, why it exists. 3-5 lines. Not marketing language. The thing you'd say at the venue.

5. AUDIO PREVIEW 2 (days_offset: -7)
Second clip — a different dimension of the track. Caption builds on what people now know.
→ Include: "comment [◼/emoji] if you want early access when it drops" — builds a pre-release engagement list.

6. PRE-SAVE / PRE-ORDER (days_offset: -4)
Link in bio. Invites, doesn't beg. Short.

7. AUDIO PREVIEW 3 (days_offset: -2)
Final taste. The climax. Caption creates the last moment of tension — "tomorrow" energy.
→ Include: "DM for a free download when it's live" — starts conversations before drop day.

8. DROP DAY (days_offset: 0)
It's out. Short, confident. The music speaks.
→ Include one comment mechanic: "comment [emoji] for the download link" or "drop your city if you're listening" — drives comment velocity in the first hour when the algorithm is watching.

9. EARLY MOMENTUM (days_offset: 5)
React to what's actually happened — plays, DJ support, a message you received, something specific. Genuine and concrete, not generic gratitude.
→ Optional: "DM if you want stems / the original mix" — keeps the conversation alive post-release.

10. PRESS BLURB (days_offset: -11)
For RA/blogs/label one-sheets. 2–3 sentences, third person. Describes the sound, mood, context. No hyperbole. Written the way Resident Advisor would actually run it.

VOICE RULES:
- Write in ${artistName}'s voice — minimal, understated, no corporate speak
- Lowercase-leaning unless the voice data says otherwise
- No hashtags unless they feel entirely natural for this artist
- Audio preview captions should be especially short — they exist to frame the clip
- SILENCE BREAKER, EVE energy in PREVIEW 3, and DROP DAY should be the shortest posts
- DEEP DIVE and EARLY MOMENTUM can breathe
- Think like a strategist: earn attention rather than demand it

Return a JSON array of exactly 10 objects:
[
  {
    "phase": "SILENCE BREAKER",
    "days_offset": -18,
    "platform": "Instagram",
    "caption": "...",
    "dm_reply": "<the DM message to auto-send when someone uses the comment trigger — or empty string if no trigger on this post>",
    "rationale": "one sentence on the strategic thinking behind this post"
  }
]

For posts with comment-to-action mechanics, dm_reply should be the warm, personal message sent automatically when someone triggers it. E.g. for "comment ◼ for early access": dm_reply = "hey — you're on the early access list. link drops [release date]. keep an eye on your DMs."
Keep dm_reply short (1-2 lines), genuine, conversational.

Return only the JSON array, no other text.`

    const apiKey = (await env('ANTHROPIC_API_KEY'))!
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const aiData = await response.json()
    const raw = aiData.content?.[0]?.text || ''

    let posts: CampaignPost[] = []
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (jsonMatch) posts = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Failed to parse campaign posts' }, { status: 500 })
    }

    return NextResponse.json({ posts, release })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Save campaign posts as drafts in scheduled_posts + save comment automations
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { posts, releaseDate, releaseId }: { posts: CampaignPost[]; releaseDate: string; releaseId?: string } = await req.json()

    const relDate = new Date(releaseDate)
    const rows = posts.map(p => {
      const scheduled = new Date(relDate)
      scheduled.setDate(scheduled.getDate() + p.days_offset)
      return {
        caption: p.caption,
        platform: p.platform,
        status: 'draft',
        format_type: p.phase.toLowerCase().replace(/ /g, '_'),
        scheduled_at: scheduled.toISOString(),
        release_id: params.id,
        created_at: new Date().toISOString(),
      }
    })

    const { data: inserted, error } = await supabase
      .from('scheduled_posts')
      .insert(rows)
      .select('id, format_type')

    if (error) throw error

    // Save comment automations for posts with dm_reply
    const automations = posts
      .map((p, i) => ({ post: p, inserted: inserted?.[i] }))
      .filter(({ post }) => post.dm_reply && post.dm_reply.trim())

    if (automations.length) {
      // Extract trigger keyword from caption (look for "comment X" or "comment [emoji]")
      const extractKeyword = (caption: string): string => {
        const match = caption.match(/comment\s+([^\s,\.]+)/i)
        return match ? match[1].toLowerCase() : '◼'
      }

      const automationRows = automations.map(({ post }) => ({
        release_id: releaseId || params.id,
        platform_post_id: `pending_${post.phase.toLowerCase().replace(/ /g, '_')}_${params.id}`,
        trigger_keyword: extractKeyword(post.caption),
        dm_message: post.dm_reply,
        enabled: true,
      }))

      await supabase.from('comment_automations').insert(automationRows)
    }

    return NextResponse.json({ saved: rows.length, automations: automations.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
