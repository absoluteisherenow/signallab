// Content-prompt engine. Synthesises 3-5 "what to post next" concepts grounded
// in the artist's live state: active narrative threads, recent post performance,
// upcoming gigs, next release, and operating rules.
//
// Purpose (per project_nm feedback): content + growth is the brain's primary
// job. Inbound triage is secondary. This endpoint is the public-flywheel
// generator — proactive drafts Anthony can one-tap into Broadcast, not inbound
// auto-replies.
//
// Stateless — no persistence. The admin UI re-generates on demand.

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { getOperatingContext, type Gig } from '@/lib/operatingContext'
import { callClaude } from '@/lib/callClaude'
import type { TaskType } from '@/lib/rules/types'

export const dynamic = 'force-dynamic'

const DEFAULT_COUNT = 5
const DEFAULT_WINDOW_DAYS = 21
const MODEL = 'claude-sonnet-4-6' as const

interface ConceptPrompt {
  slug: string
  hook: string
  format: 'carousel' | 'reel' | 'photo' | 'story' | 'text'
  rationale: string
  caption_draft: string
  narrative_anchor: string | null
  tie_in_gig: string | null
  capture_window: string | null
}

interface Body {
  count?: number
  platform?: 'instagram' | 'tiktok' | 'threads'
  window_days?: number
}

function taskForPlatform(p: Body['platform']): TaskType {
  if (p === 'tiktok') return 'caption.tiktok'
  if (p === 'threads') return 'caption.threads'
  return 'caption.instagram'
}

function summariseGigs(gigs: Gig[]): string {
  if (!gigs.length) return '(no upcoming gigs in window)'
  return gigs
    .map((g) => {
      const when = g.date || '?'
      const where = g.venue || g.location || '?'
      return `- ${when} — ${g.title || 'untitled'} @ ${where}`
    })
    .join('\n')
}

function parseConcepts(raw: string): ConceptPrompt[] {
  // Claude often wraps JSON in prose or a code fence. Extract the first [...] block.
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((p: any, i: number) => ({
        slug: String(p.slug || `concept-${i + 1}`).slice(0, 80),
        hook: String(p.hook || '').slice(0, 180),
        format: (['carousel', 'reel', 'photo', 'story', 'text'].includes(p.format) ? p.format : 'photo') as ConceptPrompt['format'],
        rationale: String(p.rationale || '').slice(0, 400),
        caption_draft: String(p.caption_draft || '').slice(0, 2200),
        narrative_anchor: p.narrative_anchor ? String(p.narrative_anchor).slice(0, 80) : null,
        tie_in_gig: p.tie_in_gig ? String(p.tie_in_gig).slice(0, 120) : null,
        capture_window: p.capture_window ? String(p.capture_window).slice(0, 120) : null,
      }))
      .slice(0, 10)
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient: sb } = gate

  const body = (await req.json().catch(() => ({}))) as Body
  const count = Math.max(3, Math.min(8, Number(body.count) || DEFAULT_COUNT))
  const windowDays = Math.max(7, Math.min(60, Number(body.window_days) || DEFAULT_WINDOW_DAYS))
  const platform = body.platform || 'instagram'
  const task = taskForPlatform(platform)

  const ctx = await getOperatingContext({ userId: user.id, task, opts: { include_recent_perf: true } })

  // Upcoming gigs in window (operatingContext only returns the next 1).
  const today = new Date().toISOString().slice(0, 10)
  const until = new Date(Date.now() + windowDays * 86400000).toISOString().slice(0, 10)
  const gigsRes = await sb
    .from('gigs')
    .select('id, title, venue, location, date, status, fee, currency, mission_id')
    .gte('date', today)
    .lte('date', until)
    .order('date', { ascending: true })
    .limit(8)
  const gigs: Gig[] = (gigsRes.data as Gig[] | null) || []

  // Build narrative threads block inline (don't need the full prompt helper).
  const threadLines = ctx.narrative_threads
    .map((t) => {
      const watchOuts = t.watch_outs.length ? ` · avoid: ${t.watch_outs.slice(0, 3).join(', ')}` : ''
      return `- **${t.title}** — ${t.body.slice(0, 180)}${watchOuts}`
    })
    .join('\n')

  const topPostLines = ctx.recent_performance.top_posts
    .slice(0, 5)
    .map((p, i) => `${i + 1}. [${p.format}] "${(p.caption || '').slice(0, 120)}" (score ${p.score ?? '?'})`)
    .join('\n')

  const redFlagLines = ctx.recent_performance.red_flags.map((f) => `- ${f}`).join('\n')
  const positiveLines = ctx.recent_performance.positive_signals.map((s) => `- ${s}`).join('\n')

  const priorityBlock = ctx.priority.formatted || '(no active mission)'

  const system = `You are the content-prompt engine for ${ctx.artist.name || 'this artist'} (${ctx.artist.handle || 'no handle'}).

Generate ${count} concrete "post this next" concepts for ${platform}. Each concept must:
- Move the public flywheel (followers, saves, credibility with promoters)
- Anchor to the active mission + narrative threads
- Fit the voice rules below — no corny hype, no influencer-coded framing
- Be capturable with a duo + self-shot multimedia kit (no external crew assumed unless the gig is a flagged major moment)

Output a JSON array, no prose before or after. Each object has:
- slug: kebab-case, <60 chars
- hook: one-line opening a human would actually say
- format: one of "carousel" | "reel" | "photo" | "story" | "text"
- rationale: 1-2 sentences — why THIS concept for THIS state. Reference what performance/narrative signal it rides.
- caption_draft: a full caption, ready to ship. Follows voice rules. No em-dashes. No tag mentions (those go in first comment).
- narrative_anchor: the narrative thread title this anchors to, or null
- tie_in_gig: the gig title/venue this relates to, or null
- capture_window: "soundcheck" | "studio" | "travel" | "pre-show" | "post-show" | "anytime" | null

--- ARTIST IDENTITY ---
${ctx.artist.bio ? `Bio: ${ctx.artist.bio}` : ''}
${ctx.artist.genre ? `Genre: ${ctx.artist.genre}` : ''}

--- CURRENT MISSION / PRIORITY ---
${priorityBlock}

--- ACTIVE NARRATIVE THREADS ---
${threadLines || '(none active — concepts can propose new threads)'}

--- UPCOMING GIGS (${windowDays}-day window) ---
${summariseGigs(gigs)}

--- RECENT PERFORMANCE ---
${ctx.recent_performance.narrative || '(no signal)'}

Top posts:
${topPostLines || '(none)'}

Positive signals:
${positiveLines || '(none)'}

Red flags:
${redFlagLines || '(none)'}

--- VOICE RULES (CRITICAL) ---
Banned patterns: ${ctx.artist.voice.banned_patterns.slice(0, 20).join(' | ') || '(none listed)'}
Structural targets: lowercase ${ctx.artist.voice.structural_targets.lowercase_pct ?? '?'}%, short captions ${ctx.artist.voice.structural_targets.short_caption_pct ?? '?'}%, no hashtags ${ctx.artist.voice.structural_targets.no_hashtags_pct ?? '?'}%
Never-says: ${(ctx.artist.voice.dna?.never_says || []).slice(0, 10).join(' | ') || '(none)'}
Signature moves: ${(ctx.artist.voice.dna?.signature_moves || []).slice(0, 10).join(' | ') || '(none)'}

--- ACTIVE RULES FOR THIS TASK ---
${ctx.rules.slice(0, 12).map((r) => `- [${r.severity}] ${r.name}: ${r.body.slice(0, 180)}`).join('\n') || '(none)'}

Return JSON only.`

  const res = await callClaude({
    userId: user.id,
    feature: 'content_prompts',
    model: MODEL,
    max_tokens: 3500,
    system,
    messages: [
      {
        role: 'user',
        content: `Generate ${count} concepts for ${platform}. Return the JSON array only.`,
      },
    ],
    temperature: 0.9,
  })

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Claude call failed', status: res.status, detail: res.data?.error || null },
      { status: 502 }
    )
  }

  const concepts = parseConcepts(res.text)
  if (!concepts.length) {
    return NextResponse.json(
      { error: 'Failed to parse concepts from model output', raw: res.text.slice(0, 600) },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    platform,
    task,
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    state_summary: {
      mission: ctx.priority.mission?.name || null,
      mission_north_star: ctx.priority.mission?.north_star || null,
      next_gig: ctx.priority.gig?.title || ctx.priority.gig?.venue || null,
      next_gig_date: ctx.priority.gig?.date || null,
      active_narratives: ctx.narrative_threads.map((t) => t.title),
      upcoming_gigs_count: gigs.length,
      top_posts_count: ctx.recent_performance.top_posts.length,
      red_flags: ctx.recent_performance.red_flags,
      positive_signals: ctx.recent_performance.positive_signals,
    },
    concepts,
    usage: res.usage,
  })
}
