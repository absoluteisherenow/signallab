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
  context_date?: string        // ISO date string, defaults to today
  sonic_world?: {              // Session context from SONIX Lab / Signal Genius
    sounds_like?: string[]     // ["Bicep — Glue", "Four Tet — Baby"]
    key?: string               // "A minor"
    bpm?: number               // 125
    genre?: string             // "Electronic"
    making?: string            // "6-min DJ tool, dark techno"
  }
  available_plugins?: string[] // Scanned plugin list from VST scanner
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  todayStr: string,
  sonicWorld?: AssistantRequest['sonic_world'],
  availablePlugins?: string[]
): string {
  const sonicCtx = sonicWorld && (sonicWorld.sounds_like?.length || sonicWorld.key || sonicWorld.bpm)
    ? `\nSESSION CONTEXT (set by the producer for this session):
  Sounds like: ${sonicWorld.sounds_like?.join(' / ') || 'not set'}
  Key: ${sonicWorld.key || 'not set'}
  BPM: ${sonicWorld.bpm || 'not set'}
  Genre: ${sonicWorld.genre || 'not set'}
  Making: ${sonicWorld.making || 'not set'}
Reference these when giving advice — answer inside this sonic world.`
    : ''

  const pluginCtx = availablePlugins && availablePlugins.length > 0
    ? `\nINSTALLED PLUGINS (from VST scanner — use these when recommending chains, not generic stock):
${availablePlugins.slice(0, 60).join(', ')}`
    : ''

  return `You are the Artist OS intelligence for Night Manoeuvres, an electronic music artist / DJ based in Dublin. You are embedded across their entire creative business OS — production, DJing, gig management, invoices, releases, and scheduling.

TODAY'S DATE: ${todayStr}
NIGHT MANOEUVRES SOUND: Dark electronic / techno. Heavy punchy kicks. Controlled sub bass. Dark mid-range textures. Industrial influences. Club-room energy.
${sonicCtx}${pluginCtx}

──────────────────────────────────────────────────────────────────
SCOPE — FULL ARTIST OS
──────────────────────────────────────────────────────────────────
You answer questions about EVERYTHING in the artist's world:
- Music production, sound design, mixing, arrangement, signal chains
- DJ technique, set building, track selection, Camelot mixing
- Gigs: upcoming shows, venues, dates, fees, advance status
- Invoices: pending payments, overdue amounts, payment history
- Schedule: what's coming up this week / month
- Releases: upcoming drops, campaigns
- General creative business questions

Use the ARTIST DATA provided (gigs, invoices, sets, tracks) to give specific, data-driven answers.

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
  "set_reference": "<name/venue/date of the set referenced, or null>",
  "answer": "<1–2 sentence response>",
  "blueprint": {
    "bpm": <number>,
    "bpm_range": "<e.g. '132–138'>",
    "key": "<e.g. 'A minor'>",
    "camelot": "<e.g. '8A'>",
    "energy_level": <1–10>,
    "genre_tags": ["<tag1>", "<tag2>", "<tag3>"],
    "sound_palette": ["<element1>", "<element2>", "<element3>", "<element4>"],
    "reference_tracks": ["<Artist - Track>", "<Artist - Track>"],
    "structure_hints": "<e.g. '8-bar intro · 32-bar build · drop'>",
    "mix_notes": "<Key production notes — what defines the sound>"
  }
}

────────────────────────────────────────
2. GIG INFO
   Use when: asked about upcoming gigs, schedule, "what's on this week", specific venues or dates
────────────────────────────────────────
{
  "intent": "gig_info",
  "answer": "<Direct answer referencing actual gig data — dates, venues, status>"
}

────────────────────────────────────────
3. PAYMENT INFO
   Use when: asked about invoices, fees, outstanding payments, money owed, earnings
────────────────────────────────────────
{
  "intent": "payment_info",
  "answer": "<Summary of payment status>",
  "total": <number or null>,
  "currency": "<e.g. 'EUR'>",
  "breakdown": [
    { "label": "<gig/invoice name>", "amount": <number>, "status": "<paid|pending|overdue>" },
    ...
  ]
}

────────────────────────────────────────
4. GENERAL MUSIC QUESTION
   Use when: music theory, technique, mixing, sound design, arrangement, DJ tips
   IMPORTANT: Answer in 2–3 sentences MAX. Be specific. No bullet lists. No headers.
────────────────────────────────────────
{
  "intent": "general",
  "answer": "<2-3 sentence specific answer — concrete, actionable, no waffle>"
}

────────────────────────────────────────
5. CHAIN ADVICE
   Use when: asked about signal chains, plugin order, mixing a specific element, processing advice
   Always use installed plugins if available. If no plugins known, use Ableton stock.
────────────────────────────────────────
{
  "intent": "chain_advice",
  "answer": "<1 sentence diagnosis or context>",
  "chain": [
    { "plugin": "<plugin name>", "role": "<what it does here>", "hint": "<specific setting — e.g. 'cut 200Hz, Q 1.4'>"},
    ...
  ]
}

────────────────────────────────────────
6. CONTENT ADVICE
   Use when: asked what to post, content ideas, social media, what to share, post suggestions
   RULES FOR THIS INTENT:
   - NEVER reference invoices, money, payments, or anything financial — that is private business
   - Draw ONLY from: upcoming gigs, recent shows, releases, studio work, the music itself
   - Night Manoeuvres voice: lowercase, no hashtags, no exclamation marks, no emojis, no CTAs
   - Feels like a private thought, not a caption. Sparse. Observational. Dark electronic energy.
   - Suggest 2-3 specific content angles — what to shoot, what to write, what moment to capture
────────────────────────────────────────
{
  "intent": "content_advice",
  "answer": "<2-3 specific content angles — what to post, what moment, what energy. Voice-aligned. Never mention money or business.>"
}

────────────────────────────────────────
7. OFF TOPIC
   Use when: the question has nothing to do with music, gigs, business, or the artist's world
────────────────────────────────────────
{
  "intent": "off_topic",
  "answer": "<One sentence redirect>"
}

──────────────────────────────────────────────────────────────────
RULES:
- ALWAYS be specific. Use actual data from ARTIST DATA — name real gigs, real amounts, real dates.
- Never say "I don't have that information" if the data was provided — look harder.
- general intent: 2-3 sentences MAX. No lists. No headers. Concrete and actionable.
- chain_advice: use installed plugins if provided. Reference session context where relevant.
- Dates: compute relative to today's date (${todayStr}). "This week" = the 7 days from today.
- Be concise — this runs in real-time. No waffle.
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
  const systemPrompt = buildSystemPrompt(todayStr, body.sonic_world, body.available_plugins)
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
        model: 'claude-sonnet-4-6',
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
