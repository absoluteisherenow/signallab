import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  context_date?: string   // ISO date string, defaults to today
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(todayStr: string): string {
  return `You are the Artist OS intelligence for Night Manoeuvres, an electronic music artist / DJ based in Dublin. You are embedded inside their Sonix Lab VST plugin running in Ableton Live — a focused production and artist management tool.

You have access to their complete creative and business data: gig/show history, invoices, DJ set history (setlists with tracks, venues, dates), and their full DJ track library.

TODAY'S DATE: ${todayStr}
When asked about time references — "last night", "yesterday", "this weekend", "next month", "last week" — compute them relative to today's date (${todayStr}).

NIGHT MANOEUVRES SOUND: Dark electronic / techno. Heavy punchy kicks. Controlled sub bass. Dark mid-range textures. Industrial influences. Club-room energy. Peak-time floor material.

──────────────────────────────────────────────────────────────────
SCOPE — MUSIC PRODUCTION ONLY
──────────────────────────────────────────────────────────────────
This tool is used inside Ableton Live during active production sessions. You ONLY answer questions related to:
  • Music production (tracks, arrangement, sound design, mixing, mastering, signal chains)
  • DJ sets and track selection (setlists, energy arcs, key matching, BPM analysis)
  • Music theory and technique (keys, scales, camelot wheel, chord progressions, rhythm)
  • The artist's own creative data (their sets, their library, their production history)
  • Gig schedule — ONLY when it informs a creative decision (e.g. "I play Fabric next week, what should I make?")
  • Payments — ONLY when directly relevant to a production/release question

Do NOT answer general gig/booking admin questions (e.g. "what time is my soundcheck") or general payment queries (e.g. "how much am I earning next month") — these belong in the business section of the web app, not the production tool.

If asked about ANYTHING outside the music production scope — respond with the off_topic intent. Redirect briefly, don't apologise extensively.

──────────────────────────────────────────────────────────────────
RESPONSE FORMAT — ONLY valid JSON. No markdown. Start { end }.
──────────────────────────────────────────────────────────────────

Respond with ONE of these shapes:

────────────────────────────────────────
1. PRODUCTION BLUEPRINT
   Use when: asked to make a track, get production guidance, create something that fits a set
────────────────────────────────────────
{
  "intent": "production_blueprint",
  "set_reference": "<name/venue/date of the set referenced, or null if not set-specific>",
  "answer": "<1–2 sentence natural language response>",
  "blueprint": {
    "bpm": <number — single target BPM>,
    "bpm_range": "<e.g. '132–138' — range seen across the set, or same as bpm>",
    "key": "<e.g. 'A minor' — dominant key or best production key for the vibe>",
    "camelot": "<e.g. '8A'>",
    "energy_level": <1–10 — target energy, based on set context>,
    "genre_tags": ["<tag1>", "<tag2>", "<tag3>"],
    "sound_palette": ["<element1 e.g. 'heavy distorted kick'>", "<element2>", "<element3>", "<element4>"],
    "reference_tracks": ["<Artist - Track>", "<Artist - Track>"],
    "structure_hints": "<e.g. '8-bar intro · 32-bar build · drop · 16-bar breakdown at bar 64'>",
    "mix_notes": "<Key mixing or production notes — what defines the sound of this set>"
  }
}

────────────────────────────────────────
2. GENERAL MUSIC QUESTION
   Use when: music theory, technique, mixing advice, sound design, arrangement, DJ tips, anything music-related
────────────────────────────────────────
{
  "intent": "general",
  "answer": "<Clear, direct, specific answer — reference the artist's sound where relevant>"
}

────────────────────────────────────────
5. OFF TOPIC
   Use when: the question is not related to music, production, DJing, gigs, or artist business
────────────────────────────────────────
{
  "intent": "off_topic",
  "answer": "<One sentence redirect — e.g. 'This tool is focused on music and production — ask me about your sets, gigs, or a track you want to make.'>"
}

──────────────────────────────────────────────────────────────────
RULES:
- ALWAYS be specific. Never say "I don't have enough information" — use what's available and infer intelligently.
- For production blueprints with set data: analyse the track list for BPM distribution, keys, energy arc, genre/style patterns.
- For production blueprints WITHOUT set data: use the artist's known sound (dark techno, 132–138 BPM, club floor energy).
- Dates: if a set has no explicit date field, "last night" = most recently created set in the DB.
- Payments: sum only amounts relevant to the timeframe asked. State paid vs pending clearly.
- Be concise — this is used in real-time while making music. No waffle.
- If in doubt whether a question is music-related, lean towards answering it.
──────────────────────────────────────────────────────────────────`
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
      { error: 'query field is required and must be a non-empty string' },
      { status: 400, headers: corsHeaders }
    )
  }

  // Resolve context date
  const contextDate = body.context_date
    ? new Date(body.context_date)
    : new Date()
  const todayStr = contextDate.toISOString().split('T')[0]

  // ── Fetch all relevant artist data in parallel ────────────────────────────
  const [gigsRes, invoicesRes, setsRes, tracksRes] = await Promise.allSettled([
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
  ])

  const gigs    = gigsRes.status    === 'fulfilled' ? (gigsRes.value.data    || []) : []
  const invoices = invoicesRes.status === 'fulfilled' ? (invoicesRes.value.data || []) : []
  const sets    = setsRes.status    === 'fulfilled' ? (setsRes.value.data    || []) : []
  const tracks  = tracksRes.status  === 'fulfilled' ? (tracksRes.value.data  || []) : []

  // ── Build context payload ─────────────────────────────────────────────────
  // Parse track lists inside sets for richer blueprint generation
  const enrichedSets = sets.map((s: Record<string, unknown>) => {
    let parsedTracks: unknown[] = []
    try {
      if (typeof s.tracks === 'string') {
        parsedTracks = JSON.parse(s.tracks)
      } else if (Array.isArray(s.tracks)) {
        parsedTracks = s.tracks
      }
    } catch {
      parsedTracks = []
    }
    return { ...s, tracks: parsedTracks }
  })

  const contextPayload = {
    today: todayStr,
    gigs,
    invoices,
    recent_sets: enrichedSets,
    track_library_top100_by_play_count: tracks,
  }

  // ── Call Claude ───────────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(todayStr)
  const userPrompt   = `ARTIST DATA:
${JSON.stringify(contextPayload, null, 2)}

USER QUERY: "${body.query.trim()}"

Respond with the appropriate JSON structure. Be specific, direct, and actionable.`

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const data = await anthropicRes.json()

    if (!anthropicRes.ok) {
      const msg = data?.error?.message || `Anthropic API error ${anthropicRes.status}`
      return NextResponse.json(
        { error: msg },
        { status: anthropicRes.status, headers: corsHeaders }
      )
    }

    const rawText: string = data?.content?.[0]?.text ?? ''
    if (!rawText) {
      return NextResponse.json(
        { error: 'Empty response from Claude' },
        { status: 502, headers: corsHeaders }
      )
    }

    // Strip any accidental markdown fences
    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    let result: unknown
    try {
      result = JSON.parse(jsonText)
    } catch {
      return NextResponse.json(
        { error: 'Claude returned non-JSON response', raw: rawText },
        { status: 502, headers: corsHeaders }
      )
    }

    return NextResponse.json(result, { headers: corsHeaders })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    )
  }
}
