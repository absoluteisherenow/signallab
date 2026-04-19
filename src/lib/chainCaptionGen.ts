/**
 * chainCaptionGen — caption generation for the Broadcast chain.
 *
 * Uses SKILLS_CAPTION_GEN (the full SKILL_VOICE_ENGINE) as the core prompt.
 * Sends the ACTUAL IMAGE to Claude vision alongside the scan context so the
 * model writes from what a viewer will see, not from a paraphrase. Without
 * the image the output degrades to "describe the description" captions.
 */

import { SKILLS_CAPTION_GEN } from './skillPromptsClient'
import { scrubAiTells } from './voiceCheck'
import type { ChainScanResult } from './chainScan'
import type { VoiceRef, Platform, CaptionVariant } from '@/components/broadcast/chain/types'
import { PLATFORM_LABEL, PLATFORM_LIMITS } from '@/components/broadcast/chain/types'

/**
 * Format one ref as an evidence block for Claude. Pulls the real deep-dive
 * fields off `ref.profile` (written by /api/artist-scan): style_rules,
 * visual_aesthetic.mood, chips, lowercase_pct etc., content_performance
 * .peak_content, brand_positioning. Without these Claude has only a name
 * and guesses at voice — the fortune-cookie failure mode.
 */
function buildRefBlock(r: VoiceRef): string {
  const header =
    r.kind === 'self'
      ? `■ YOU — NIGHT manoeuvres [weight ${r.weight}/100, primary voice]`
      : `■ ${r.name} [weight ${r.weight}/100]`

  const p = r.profile
  const lines: string[] = [header]

  if (!p) {
    // No deep-dive data — be honest about it rather than hallucinating
    // cadence. Weight still informs blend, but the model won't invent
    // samples.
    if (r.kind === 'self') {
      lines.push('  (no self-scan yet — blend primarily on stance, not on structural samples)')
    } else {
      lines.push('  (profile not scanned — use name + weight only, do not invent quotes)')
    }
    return lines.join('\n')
  }

  // Structural percentages are the most portable signal — they tell Claude
  // exactly how often this voice goes lowercase, how tight their captions
  // run, and whether they use hashtags. These constrain output directly.
  const struct: string[] = []
  if (typeof p.lowercase_pct === 'number') struct.push(`${p.lowercase_pct}% lowercase`)
  if (typeof p.short_caption_pct === 'number') struct.push(`${p.short_caption_pct}% short (<10 words)`)
  if (typeof p.no_hashtags_pct === 'number') struct.push(`${p.no_hashtags_pct}% no-hashtags`)
  if (struct.length) lines.push(`  Structure: ${struct.join(' · ')}`)

  if (p.chips?.length) lines.push(`  Style tags: ${p.chips.join(', ')}`)
  if (p.style_rules) lines.push(`  Style rules: ${p.style_rules}`)
  if (p.brand_positioning) lines.push(`  Positioning: ${p.brand_positioning}`)
  if (p.content_strategy_notes) lines.push(`  Strategy: ${p.content_strategy_notes}`)
  if (p.visual_aesthetic?.mood) lines.push(`  Visual mood: ${p.visual_aesthetic.mood}`)
  if (p.visual_aesthetic?.signature_visual) lines.push(`  Signature visual: ${p.visual_aesthetic.signature_visual}`)
  if (p.content_performance?.peak_content) lines.push(`  Peak content: ${p.content_performance.peak_content}`)
  if (p.biography) lines.push(`  Bio: ${p.biography}`)

  return lines.join('\n')
}

function buildVoiceBlock(refs: VoiceRef[]): string {
  if (refs.length === 0) return ''

  // Sort by weight so the dominant voice leads. Claude reads top-down.
  const sorted = [...refs].sort((a, b) => b.weight - a.weight)
  const blocks = sorted.map(buildRefBlock).join('\n\n')

  // Compute weighted structural targets from refs that have percentages.
  // This gives Claude concrete targets instead of vague "blend cadence".
  const weighted = weightedStructural(sorted)
  const targets: string[] = []
  if (weighted.lowercase != null) targets.push(`lowercase ~${weighted.lowercase}% of the time`)
  if (weighted.short != null) targets.push(`aim for ${weighted.short}% chance the caption is <10 words`)
  if (weighted.noHashtags != null && weighted.noHashtags >= 50) targets.push('no hashtags in the caption body')

  const targetLine = targets.length
    ? `\nWEIGHTED STRUCTURAL TARGETS (derived from the blend above):\n- ${targets.join('\n- ')}`
    : ''

  return `VOICE REFERENCES — real deep-dive data from scans. Blend by weight (higher = stronger influence). Treat style_rules as binding voice instructions, not suggestions.\n\n${blocks}${targetLine}`
}

/** Weight-average the structural percentages across refs that have them. */
function weightedStructural(refs: VoiceRef[]): {
  lowercase: number | null
  short: number | null
  noHashtags: number | null
} {
  const acc = { lowercase: [0, 0], short: [0, 0], noHashtags: [0, 0] }
  for (const r of refs) {
    const p = r.profile
    if (!p) continue
    const w = r.weight || 0
    if (typeof p.lowercase_pct === 'number') {
      acc.lowercase[0] += p.lowercase_pct * w
      acc.lowercase[1] += w
    }
    if (typeof p.short_caption_pct === 'number') {
      acc.short[0] += p.short_caption_pct * w
      acc.short[1] += w
    }
    if (typeof p.no_hashtags_pct === 'number') {
      acc.noHashtags[0] += p.no_hashtags_pct * w
      acc.noHashtags[1] += w
    }
  }
  const avg = ([sum, wsum]: number[]) => wsum > 0 ? Math.round(sum / wsum) : null
  return {
    lowercase: avg(acc.lowercase),
    short: avg(acc.short),
    noHashtags: avg(acc.noHashtags),
  }
}

const VARIANT_GUIDE: Record<CaptionVariant, string> = {
  safe:  'Safe: the most restrained read. One or two short lines. Lands a concrete stance, not a vibe. Uses NM signatures (first-person plural, 🌓 sign-off) if they fit. Lowercase-leaning, but proper nouns stay capitalised.',
  loose: 'Loose: more confident. One concrete detail earned from the image + context (a gear name, a city, a day, a collaborator). Tight. 🌓 where natural. Lowercase-leaning, proper nouns keep their caps.',
  raw:   'Raw: shortest possible. A fragment, a single word, a timestamp. Texts-to-a-friend energy. Ending with 🌓 is encouraged. Default to lowercase, but if a proper noun appears (a venue, a person, NIGHT, a city) keep it capitalised.',
}

/**
 * Few-shot examples: WRONG (AI fortune-cookie) vs RIGHT (NM-aligned).
 * These sit in the system prompt so Claude has a crisp bar to clear. The
 * "wrong" row is drawn from actual bad outputs the user flagged — the
 * "cold side warm side" and "somewhere between the take and the final mix"
 * failure modes. The "right" row reflects NM's real style_rules:
 * first-person plural, crescent-moon sign-off, concrete subject, no vague
 * atmospherics.
 */
const FEW_SHOT = `EXAMPLES — calibrate to these.

WRONG (AI fortune-cookie, never ship these):
  ✗ "somewhere between the take and the final mix."
  ✗ "cold side, warm side. we never really split the difference."
  ✗ "the space between what we wanted and what we got."
  ✗ "moments like this don't ask for permission."
  ✗ "a study in light and shadow."
  ✗ "blue on one side, amber on the other. the colours argue."

Every "WRONG" example shares the same failure: metaphor about the image, no subject, no stance, no signature. Generic enough that ANY artist could have posted it. That's the fail.

RIGHT (NM-aligned, ship these):
  ✓ "press. 🌓"                                ← context: "press shots, no info"
  ✓ "album press with Dot. 🌓"                  ← context: "dot + nm press shots for the album" → names collaborator + hook
  ✓ "press shots. album incoming. 🌓"           ← same context → names the hook
  ✓ "album's coming. photos by [photographer]. 🌓" ← tease without fabricating a date
  ✓ "dot + nm. album shots. 🌓"                 ← ultra-short but still carries collab + hook
  ✓ "we're back Saturday. 🌓"                   ← weekday keeps its capital
  ✓ "remix EP out now. 🌓"                      ← EP stays uppercase
  ✓ "records that shaped us, part 2 🌓"
  ✓ "studio. OB-6 doing work."                  ← gear names stay correct case
  ✓ "full live show announced. dates in bio. 🌓"
  ✓ "thank you [venue]. one of ours."
  ✓ "NIGHT manoeuvres live on Rinse tonight. 🌓"   ← proper nouns capitalised
  ✓ "warehouse 9 with Dot. 🌓"                  ← first names capitalised
  ✓ "one for Manchester. 🌓"                    ← cities capitalised

ANTI-PATTERN — DO NOT SHIP. These look NM but strip the context down to nothing:
  ✗ "new photos. 🌓"          ← what photos? if context said "album press", surface it.
  ✗ "new photos. us. 🌓"      ← same failure, adding "us" doesn't save it.
  ✗ "shots." / "pics." / "photos." → all drop the reason. If context named it, name it.

Casing rule: lowercase is the DEFAULT, not a ceiling. Real NM data is ~72% lowercase, meaning ~28% of captions have at least one capital. Proper nouns (people's first names, venue names, city names, "NIGHT" in NIGHT manoeuvres, gear model names like OB-6/CDJ-3000) ALWAYS keep their natural capitalisation. Never lowercase "Saturday" to "saturday" — that reads as an affectation, not as authenticity.

Every "RIGHT" example has either: a concrete subject (press, release, tour, gear), a signature (first-person plural, 🌓), or radical brevity. Never poetic paraphrase of the image.`

/**
 * Banned sentence PATTERNS — surgical list of the literal AI tropes Claude
 * reaches for when it's avoiding commitment. Listed explicitly because
 * "avoid AI-sounding output" is too vague to enforce.
 */
const BANNED_PATTERNS = `BANNED SENTENCE PATTERNS — if your draft contains any of these, rewrite:
- "somewhere between ___ and ___" / "between the ___ and the ___"
- "the space between ___" / "the moment when ___" / "caught between ___"
- "a study in ___" / "a meditation on ___" / "an exercise in ___"
- "ask(ing) permission" / "refus(ing) to apologise" / "unapologetic(ally)"
- "raw" used as an adjective about your own work (we don't say it about ourselves)
- "diving in" / "unlock(ing)" / "unleash(ing)" / "elevate(d)"
- "colour/light arguing" / "X on one side, Y on the other"
- any sentence of the shape "ADJECTIVE noun, ADJECTIVE noun. [vague claim about both]"

If your draft reads like something a generic "moody artist AI" would write, it's wrong. NM writes plainly about real subjects, with one concrete detail per caption, signed off with 🌓 when natural.`

export async function generateCaptionVariants(args: {
  scan: ChainScanResult
  refs: VoiceRef[]
  platform: Platform
  fileName: string
  /** Base-64 data URL of the image (or best video frame) for Claude vision. */
  imageDataUrl: string | null
  /** Freeform context from the user: "dot + nm press shots", "announce warehouse 9",
   *  "track id dropped in chat", etc. Single highest-leverage input for quality —
   *  without it Claude falls back to describing the image. */
  context?: string
}): Promise<{ safe: string; loose: string; raw: string; rationale: string }> {
  const { scan, refs, platform, fileName, imageDataUrl, context } = args
  const hasContext = !!(context && context.trim())

  const system = `You write social captions for NIGHT manoeuvres, an electronic music duo. You are looking at the actual image that will be posted. NM reads every caption before shipping. If it sounds like AI, they lose faith in this entire product and switch it off. Your job is to never trigger that.

${SKILLS_CAPTION_GEN}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES — violations invalidate the caption
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- NEVER describe what's in the image. The image is visible — narration is redundant. Write FROM the image, not ABOUT it.
- NEVER open with "a photo of", "here's a", "this is", "this shows", or any colour-adjective pileup.
- NEVER use em-dashes (—) or en-dashes (–). Commas, full stops, or line breaks only.
- NEVER include @mentions or hashtags inside the caption. Tags go in the first comment.
- NEVER mention AI, models, prompts, or that this was generated.
- NEVER fabricate facts. If you don't know (venue, date, release title, photographer), don't invent. Use "[photographer]", "[venue]", "[date]" as an editable placeholder and stop there, OR reach for the generic NM stance (short fragment + 🌓).
- NEVER use generic CTAs ("check it out", "link in bio", "tap to listen", "who's coming").
- NEVER reference gear other than NM's canonical rig: 4× CDJ-3000, V10 mixer, Technics 1210s, OB-6, Ableton Move. (Do NOT say TEO-5 — that is wrong in older baselines.)
- If you mention the act, render it EXACTLY "NIGHT manoeuvres" (NIGHT uppercase, manoeuvres lowercase with "oe" not "œ").
- Use first-person plural (we, us, our) — NM is a duo.
- 🌓 (waxing gibbous moon) is the signature sign-off. Use it naturally, not mechanically. Not every caption needs it — but "loose" and "raw" variants default to ending with it.
- Stay inside ${PLATFORM_LIMITS[platform]} chars for ${PLATFORM_LABEL[platform]}.
- CASING: lowercase is the DEFAULT, not an all-caps-off hard rule. NM's real data is ~72% lowercase, so ~28% of captions carry at least one capital. Proper nouns (people, venues, cities, days of the week, gear model names like OB-6 / CDJ-3000, "NIGHT" in NIGHT manoeuvres, "EP", "LP", "DJ") ALWAYS keep their natural capitalisation. Never flatten "Saturday" to "saturday" — it reads affected, not authentic. The sentence can still begin lowercase; just preserve proper-noun casing inside it.
- COHERENCE: the caption has to stand on its own. Read cold (no image, no context visible), a stranger should still understand what this post is FOR — a release, a show, a thanks, a tease. If removing the image makes the caption meaningless or ambiguous, rewrite.

${FEW_SHOT}

${BANNED_PATTERNS}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DECISION TREE — how to write when context is thin
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Is there a CONTEXT line in the user message? → Use it as the subject. That's the angle. Don't drift.
2. No context, but the image clearly shows a concrete subject (press shot, studio session, gig, gear, record)? → Name it in one word plus 🌓. "press. 🌓" / "studio. 🌓" / "live. 🌓"
3. No context, ambiguous image? → Go even shorter. A single word or fragment. "new." / "back. 🌓" / "we're cooking."
4. NEVER fill the void with poetry. Silence > metaphor.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY this JSON object. No markdown, no commentary, no outer quotes.
{"safe":"…","loose":"…","raw":"…","rationale":"one short sentence of receipts: which concrete noun(s) from the context you surfaced, which ref's cadence dominated the blend, and one tradeoff you made (e.g. 'kept Dot + album from context; leaned 72% lowercase from You with Burial's brevity; skipped date tease because no date was given')."}`

  const contextBlock = hasContext
    ? `CONTEXT (what this post is FOR — the angle/reason, from the artist themselves):
"${context!.trim()}"

HARD CONTEXT RULES (violations invalidate the caption):
1. The caption MUST name the single most specific concrete noun from the context — album, tour, release, venue, collaborator, gear, city, day. If the context says "press shots for the album", "album" (or "press" + "album") must appear in at least ONE of the three variants. If it says "warehouse 9 with Dot", "warehouse 9" and "Dot" must appear.
2. The caption MUST NOT defuse the context into a generic. "dot + nm press shots for the album" → NEVER write "new photos" — that strips the collaborator, the occasion, and the hook in one move. It is the exact failure mode NM hates.
3. If the context mentions a collaborator by handle or name (e.g. "dot + nm"), surface the collaborator in at least the LOOSE variant. Capitalise first names ("Dot").
4. If the context includes a tease ("no date yet", "soon", "incoming"), the caption may tease — "album incoming.", "dates soon." — but NEVER invent a date, venue, or title.
5. The image informs tone; the CONTEXT is the subject. If image and context disagree, context wins.`
    : `NO CONTEXT GIVEN.
Default to extreme brevity — a fragment, a single word, a timestamp, a lowercase observation. Examples of acceptable output: "press.", "dot + nm.", "new.", "saturday.", "today's work."
DO NOT invent an event, release, or collaboration. DO NOT describe the image. When in doubt, make it shorter.`

  const userText = `${buildVoiceBlock(refs)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contextBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Platform: ${PLATFORM_LABEL[platform]} (file: ${fileName})
Scanner mood read: ${scan.tone_match || 'unstated'}
Scanner tags: ${(scan.tags || []).join(', ') || 'none'}

Write three caption variants for the SAME post, each applying the weighted voice blend above.

- SAFE: ${VARIANT_GUIDE.safe}
- LOOSE: ${VARIANT_GUIDE.loose}
- RAW: ${VARIANT_GUIDE.raw}

Self-check each variant before returning:
1. Does it narrate/describe the image? → rewrite.
2. Does it use any banned phrasing (em-dash, "cold side warm side"-style poetic paraphrase, "dive in", "unlock", generic CTA)? → rewrite.
3. If no context was given, is it 8 words or fewer? If not, shorten.
4. Does it read like the blend of refs above, or like generic AI? If generic, rewrite using a concrete detail from style_rules / peak_content.

Return the JSON object described in the system prompt.`

  // Build multimodal content. Image first (Claude sees before reading).
  const content: object[] = []
  if (imageDataUrl) {
    const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/)
    if (match) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: match[1], data: match[2] },
      })
    }
  }
  content.push({ type: 'text', text: userText })

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: 1200,
      messages: [{ role: 'user', content }],
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `Caption API error ${res.status}`)
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty caption response')

  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
    safe?: string
    loose?: string
    raw?: string
    rationale?: string
  }
  return {
    safe:  scrubAiTells(parsed.safe  || ''),
    loose: scrubAiTells(parsed.loose || ''),
    raw:   scrubAiTells(parsed.raw   || ''),
    // rationale is receipts text shown to the artist, not a caption. Skip
    // scrubAiTells (which is tuned for captions) and just trim.
    rationale: (parsed.rationale || '').trim(),
  }
}
