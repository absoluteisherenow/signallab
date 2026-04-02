import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SKILLS_ASSISTANT_CONTENT, SKILL_ADS_MANAGER, SKILL_INSTAGRAM_GROWTH } from '@/lib/skillPrompts'

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssistantRequest {
  query: string
  context_date?: string
  sonic_world?: {
    sounds_like?: string[]
    key?: string
    bpm?: number
    genre?: string
    making?: string
  }
  available_plugins?: string[]
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  todayStr: string,
  profile: Record<string, unknown>,
  sonicWorld?: AssistantRequest['sonic_world'],
  availablePlugins?: string[]
): string {
  const artistName = (profile.name as string) || 'the artist'
  const genres = (profile.genres as string[])?.join(', ') || (profile.genre as string) || 'Electronic'
  const bio = (profile.bio as string) || ''
  const country = (profile.country as string) || ''
  const soundsLike = (profile.soundsLike as string[])?.join(', ') || ''
  const instagram = (profile.instagram as string) || null
  const raUrl = (profile.raUrl as string) || null
  const label = (profile.label as string) || null
  const members = (profile.members as string[]) || null
  const memberContext = (profile.member_context as string) || null

  const sonicCtx = sonicWorld && (sonicWorld.sounds_like?.length || sonicWorld.key || sonicWorld.bpm)
    ? `\nSESSION CONTEXT (active production session):
  Sounds like: ${sonicWorld.sounds_like?.join(' / ') || 'not set'}
  Key: ${sonicWorld.key || 'not set'}
  BPM: ${sonicWorld.bpm || 'not set'}
  Genre: ${sonicWorld.genre || 'not set'}
  Making: ${sonicWorld.making || 'not set'}
Reference these when giving production advice — answer inside this sonic world.`
    : ''

  const alignmentCtx = soundsLike
    ? `\nARTIST ALIGNMENT (who ${artistName} sounds like / identifies with):
${soundsLike}
Use this to calibrate tone, energy, and aesthetic in ALL responses — especially content advice and production guidance. These are the reference points for the sound and culture.`
    : ''

  const pluginCtx = availablePlugins && availablePlugins.length > 0
    ? `\nINSTALLED PLUGINS (use these in chains — not generic stock unless no plugins known):
${availablePlugins.slice(0, 60).join(', ')}`
    : ''

  return `You are Signal Lab OS — the embedded intelligence for ${artistName}, an electronic music artist${country ? ` based in ${country}` : ''}.

TODAY: ${todayStr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARTIST PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${artistName}
Genre: ${genres}
${bio ? `Bio: ${bio}` : ''}
${soundsLike ? `Sounds like: ${soundsLike}` : ''}
${country ? `Country: ${country}` : ''}
${members ? `Members: ${members.join(' & ')}` : ''}
${memberContext ? `IMPORTANT: ${memberContext}` : ''}
${instagram ? `Instagram: @${instagram}` : ''}
${raUrl ? `RA: ${raUrl}` : ''}
${label ? `Label: ${label}` : ''}
${alignmentCtx}${sonicCtx}${pluginCtx}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCOPE — FULL ARTIST OS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are the intelligence across every part of ${artistName}'s creative business:

PRODUCTION & STUDIO
- Music production, sound design, mixing, arrangement
- Signal chains, plugin recommendations, processing advice
- Ableton workflow, session context, patch ideas

DJ & PERFORMANCE
- Set building, track selection, Camelot/harmonic mixing
- Energy arc, crowd reading, transition technique
- Rekordbox, cue points, loop structure

TOUR & GIGS
- Upcoming shows, venues, dates, advance status
- Schedule overview: this week / this month / next 3 months
- Fee tracking, contract status, logistics

MONEY
- Outstanding invoices, payment status, overdue amounts
- Revenue by stream (Bandcamp, streaming, gigs, sync)
- Cash flow snapshot

CONTENT STRATEGY (your strongest capability)
- You are a world-class content strategist for electronic music artists
- You understand the gap between underground authenticity and algorithmic reach
- You know ${artistName}'s voice, aesthetic, and audience deeply
- You generate specific, usable content ideas — not generic advice
- You plan release campaigns, tour campaigns, and always-on content
- You know what performs on Instagram Reels, Stories, grid, and TikTok for this genre
- You understand the four content scores: Reach · Authenticity · Culture · Visual Identity
- Every content suggestion must serve BOTH underground credibility AND growth

INSTAGRAM DEEP DIVE DATA
- ARTIST DATA includes voice_profiles: detailed voice analysis from real Instagram scrape (style rules, lowercase %, caption patterns)
- ARTIST DATA includes top_performing_posts: real engagement data from scraped posts with likes, comments, format, captions
- USE this data to ground ALL content advice in what actually works for ${artistName}
- When suggesting captions, match the voice patterns in the profile
- When suggesting formats, cite which formats get the best engagement from the real data
- This is REAL data, not assumptions — reference it specifically

${SKILLS_ASSISTANT_CONTENT}

RELEASES
- Upcoming drops, campaign timing, promo strategy
- Press angle, playlist targets, distributor deadlines

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT — valid JSON only. No markdown. Start { end }.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Respond with ONE of these shapes:

────────────────────────────────────────
1. PRODUCTION BLUEPRINT
   Use when: asked to make a track, get production guidance, blueprint a sound
────────────────────────────────────────
{
  "intent": "production_blueprint",
  "set_reference": "<set name or null>",
  "answer": "<1-2 sentence response>",
  "blueprint": {
    "bpm": <number>,
    "bpm_range": "<e.g. '132–138'>",
    "key": "<e.g. 'A minor'>",
    "camelot": "<e.g. '8A'>",
    "energy_level": <1-10>,
    "genre_tags": ["<tag>"],
    "sound_palette": ["<element>"],
    "reference_tracks": ["<Artist - Track>"],
    "structure_hints": "<e.g. '8-bar intro · 32-bar build · drop'>",
    "mix_notes": "<Key production notes>"
  }
}

────────────────────────────────────────
2. GIG INFO
   Use when: upcoming shows, schedule, specific venues or dates
────────────────────────────────────────
{
  "intent": "gig_info",
  "answer": "<Direct answer using actual gig data — dates, venues, status>"
}

────────────────────────────────────────
3. PAYMENT INFO
   Use when: invoices, fees, outstanding payments, earnings
────────────────────────────────────────
{
  "intent": "payment_info",
  "answer": "<Summary>",
  "total": <number or null>,
  "currency": "<e.g. 'EUR'>",
  "breakdown": [
    { "label": "<name>", "amount": <number>, "status": "<paid|pending|overdue>" }
  ]
}

────────────────────────────────────────
4. GENERAL MUSIC QUESTION
   Use when: music theory, technique, mixing, sound design, arrangement, DJ tips
   RULE: 2-3 sentences MAX. No bullet lists. No headers. Concrete and actionable.
────────────────────────────────────────
{
  "intent": "general",
  "answer": "<2-3 sentence specific answer>"
}

────────────────────────────────────────
5. CHAIN ADVICE
   Use when: signal chains, plugin order, mixing a specific element, processing advice
────────────────────────────────────────
{
  "intent": "chain_advice",
  "answer": "<1 sentence context>",
  "chain": [
    { "plugin": "<plugin>", "role": "<what it does>", "hint": "<specific setting>" }
  ]
}

────────────────────────────────────────
6. CONTENT ADVICE
   Use when: "what should I post", content ideas, social media, quick post suggestions
   CONTENT VOICE RULES for ${artistName}:
   - Never reference invoices, money, payments, or business details
   - Draw from: upcoming gigs, shows, studio work, releases, the music itself, the culture
   - Voice: lowercase preferred, no hashtags, no exclamation marks, no emojis, no forced CTAs
   - Energy: sparse, observational, confident — not promotional
   - Specific > generic. "two nights before berghain" beats "excited for this show"
   - Suggest 2-3 distinct angles with the specific format (Reel / Story / grid post / caption)
   - Each angle: what to shoot/write + why it performs (Reach / Authenticity / Culture)
────────────────────────────────────────
{
  "intent": "content_advice",
  "answer": "<2-3 specific content angles. Each one: format, what to do, why it works. Voice-matched. Never mention money or business.>"
}

────────────────────────────────────────
7. CONTENT STRATEGY
   Use when: "plan my release", "campaign for X", "content calendar", "how do I build for this show"
   This is full campaign planning — multiple phases, specific actions, timed recommendations
────────────────────────────────────────
{
  "intent": "content_strategy",
  "answer": "<Overview of the strategy — 2-3 sentences>",
  "phases": [
    {
      "name": "<Phase name — e.g. 'Announcement' / 'Build' / 'Drop week' / 'Afterglow'>",
      "timing": "<When — e.g. '6 weeks before release' / '48 hours before show'>",
      "actions": ["<Specific action with format — e.g. 'Reel: 30-sec studio clip, no caption, just music'>"]
    }
  ],
  "always_on": ["<Ongoing content type that fits ${artistName}'s world regardless of releases>"]
}

────────────────────────────────────────
8. OFF TOPIC
   Use when: nothing to do with music, gigs, business, or the artist's world
────────────────────────────────────────
{
  "intent": "off_topic",
  "answer": "<One sentence redirect>"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ALWAYS be specific. Use actual data from ARTIST DATA — real gigs, real amounts, real dates.
- Never fabricate data. If it's not in ARTIST DATA, say what you don't have.
- general intent: 2-3 sentences MAX. No lists. No headers.
- chain_advice: use installed plugins if available.
- Dates: compute relative to today (${todayStr}).
- Content voice must match ${artistName}'s aesthetic — not generic "artist content" advice.
- Be concise — this runs in real-time. No waffle.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500, headers: corsHeaders }
    )
  }

  let body: AssistantRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders }
    )
  }

  if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
    return NextResponse.json(
      { error: 'query field is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  const contextDate = body.context_date ? new Date(body.context_date) : new Date()
  const todayStr = contextDate.toISOString().split('T')[0]

  // ── Fetch all artist data in parallel ─────────────────────────────────────
  const [gigsRes, invoicesRes, setsRes, tracksRes, revenueRes, settingsRes, releasesRes, voiceProfilesRes, postPerfRes] =
    await Promise.allSettled([
      supabase
        .from('gigs')
        .select('id, title, venue, location, date, time, fee, currency, status, notes')
        .order('date', { ascending: true }),

      supabase
        .from('invoices')
        .select('id, gig_title, amount, currency, type, status, due_date, paid_at, created_at')
        .order('created_at', { ascending: false })
        .limit(60),

      supabase
        .from('dj_sets')
        .select('id, name, venue, slot_type, tracks, created_at')
        .order('created_at', { ascending: false })
        .limit(8),

      supabase
        .from('dj_tracks')
        .select('title, artist, bpm, key, camelot, energy, genre, moment_type, producer_style, similar_to, play_count')
        .order('play_count', { ascending: false })
        .limit(100),

      supabase
        .from('revenue_streams')
        .select('id, source, description, amount, currency, period_start, period_end, release_title, status, notes, created_at')
        .order('created_at', { ascending: false })
        .limit(50),

      supabase
        .from('artist_settings')
        .select('profile, team, advance, payment, tier')
        .limit(1)
        .single(),

      supabase
        .from('releases')
        .select('id, title, type, release_date, status, label, notes')
        .order('release_date', { ascending: false })
        .limit(10),

      // Deep dive voice profiles from Instagram scrape
      supabase
        .from('artist_profiles')
        .select('name, genre, lowercase_pct, short_caption_pct, no_hashtags_pct, style_rules, data_source, post_count_analysed, last_scanned')
        .not('style_rules', 'is', null)
        .limit(10),

      // Top performing posts from Instagram deep dive
      supabase
        .from('post_performance')
        .select('artist_name, platform, caption, format, actual_likes, actual_comments, engagement_score')
        .order('engagement_score', { ascending: false })
        .limit(30),
    ])

  const gigs     = gigsRes.status     === 'fulfilled' ? (gigsRes.value.data     || []) : []
  const invoices = invoicesRes.status === 'fulfilled' ? (invoicesRes.value.data || []) : []
  const sets     = setsRes.status     === 'fulfilled' ? (setsRes.value.data     || []) : []
  const tracks   = tracksRes.status   === 'fulfilled' ? (tracksRes.value.data   || []) : []
  const revenue  = revenueRes.status  === 'fulfilled' ? (revenueRes.value.data  || []) : []
  const releases = releasesRes.status === 'fulfilled' ? (releasesRes.value.data || []) : []
  const voiceProfiles = voiceProfilesRes.status === 'fulfilled' ? (voiceProfilesRes.value.data || []) : []
  const topPosts = postPerfRes.status === 'fulfilled' ? (postPerfRes.value.data || []) : []

  // Pull artist profile from settings
  const settingsData = settingsRes.status === 'fulfilled' ? settingsRes.value.data : null
  const profile: Record<string, unknown> = (settingsData?.profile as Record<string, unknown>) || {}
  const teamData = settingsData?.team || []

  // Enrich sets with parsed track lists
  const enrichedSets = sets.map((s: Record<string, unknown>) => {
    let parsedTracks: unknown[] = []
    try {
      parsedTracks = typeof s.tracks === 'string' ? JSON.parse(s.tracks) : (Array.isArray(s.tracks) ? s.tracks : [])
    } catch { parsedTracks = [] }
    return { ...s, tracks: parsedTracks }
  })

  // Separate upcoming vs past gigs for better context
  const upcomingGigs = gigs.filter((g: Record<string, unknown>) => g.date && String(g.date) >= todayStr)
  const recentPastGigs = gigs
    .filter((g: Record<string, unknown>) => g.date && String(g.date) < todayStr)
    .slice(-10)

  // Build voice intelligence section from deep dive
  const voiceIntel = voiceProfiles.length > 0
    ? voiceProfiles.map((v: any) => `${v.name}: ${v.style_rules} (${v.post_count_analysed || '?'} posts analysed via ${v.data_source || 'scrape'})`).join('\n\n')
    : null
  const engagementIntel = topPosts.length > 0
    ? topPosts.slice(0, 15).map((p: any) => `[${p.artist_name}] ${p.platform} ${p.format} — ${p.actual_likes}L/${p.actual_comments}C (score ${p.engagement_score}): "${(p.caption || '').slice(0, 100)}"`).join('\n')
    : null

  const contextPayload = {
    today: todayStr,
    upcoming_gigs: upcomingGigs,
    recent_past_gigs: recentPastGigs,
    invoices,
    revenue_streams: revenue,
    recent_sets: enrichedSets,
    track_library_top100: tracks,
    releases,
    team: teamData,
    ...(voiceIntel ? { voice_profiles: voiceIntel } : {}),
    ...(engagementIntel ? { top_performing_posts: engagementIntel } : {}),
  }

  // ── Call Claude ───────────────────────────────────────────────────────────
  const queryLower = body.query.trim().toLowerCase()
  const isAdsQuery = /\b(ads?|advert|paid|boost|promot|spend|budget|campaign.*paid|meta ads|tiktok ads|spotify ad|target.*audience|retarget|lookalike|cpm|cpc|roas)\b/.test(queryLower)
  const isInstagramQuery = /\b(instagram|insta|ig|reel|reels|stories|story|grid|follower|followers|growth|engage|engagement|hashtag|algorithm|collab post|bio|profile.*optim)\b/.test(queryLower)

  let systemPrompt = buildSystemPrompt(todayStr, profile, body.sonic_world, body.available_plugins)
  if (isAdsQuery) {
    systemPrompt += '\n' + SKILL_ADS_MANAGER
  }
  if (isInstagramQuery) {
    systemPrompt += '\n' + SKILL_INSTAGRAM_GROWTH
  }
  const userPrompt = `ARTIST DATA:
${JSON.stringify(contextPayload, null, 2)}

USER QUERY: "${body.query.trim()}"

Respond with the appropriate JSON structure. Be specific, direct, and actionable. Use real data from ARTIST DATA above.`

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const data = await anthropicRes.json()

    if (!anthropicRes.ok) {
      const msg = data?.error?.message || `Anthropic API error ${anthropicRes.status}`
      return NextResponse.json({ error: msg }, { status: anthropicRes.status, headers: corsHeaders })
    }

    const rawText: string = data?.content?.[0]?.text ?? ''
    if (!rawText) {
      return NextResponse.json({ error: 'Empty response' }, { status: 502, headers: corsHeaders })
    }

    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    let result: unknown
    try {
      result = JSON.parse(jsonText)
    } catch {
      return NextResponse.json(
        { error: 'Non-JSON response', raw: rawText },
        { status: 502, headers: corsHeaders }
      )
    }

    return NextResponse.json(result, { headers: corsHeaders })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}
