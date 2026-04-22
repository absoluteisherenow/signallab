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
import { scrubBrandText } from './scrubBrandText'
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

/**
 * Format the FULL scanner read as a block Claude can anchor to.
 *
 * Before this existed, caption gen only saw `tone_match` and `tags` — two
 * strings out of ~12 fields of rich intelligence the scanner had already
 * produced (the best moment, what's shareable, what the post is FOR, the
 * platform fit + reasoning, the energy score). That meant the scanner and
 * the voice generator were effectively disconnected — the scanner knew the
 * clip was "Dot on the OB-6 at 2:14 AM" and the caption gen only saw
 * "studio, intimate". The fortune-cookie failure mode was baked in.
 *
 * This block wires every concrete noun the scanner identified directly into
 * the caption prompt, so Claude can never write "new." when the scanner
 * already said "Dot doing an OB-6 pad at the 14s mark."
 */
function buildScannerBlock(scan: ChainScanResult): string {
  // Dedupe moment reasons from best_moment + moments[]. Cap to 4 so Claude
  // has specifics but doesn't over-fit to a transient.
  const reasons = new Set<string>()
  if (scan.best_moment?.reason) reasons.add(scan.best_moment.reason.trim())
  for (const m of scan.moments || []) {
    if (m?.reason) reasons.add(m.reason.trim())
    if (reasons.size >= 4) break
  }

  const bits: string[] = []
  if (scan.wow_note) bits.push(`Editorial director's WOW read: ${scan.wow_note.trim()}`)
  if (scan.editorial_angle) bits.push(`Editorial posting call: ${scan.editorial_angle.trim()}`)
  if (scan.caption_context) bits.push(`What the clip's about: ${scan.caption_context.trim()}`)
  if (scan.post_recommendation) bits.push(`What to do with it: ${scan.post_recommendation.trim()}`)
  if (scan.content_score?.shareable_core_note && scan.content_score.shareable_core_note.toLowerCase() !== 'none found') {
    bits.push(`The shareable core: ${scan.content_score.shareable_core_note.trim()}`)
  }
  if (reasons.size) bits.push(`Moments the scanner flagged:\n  - ${Array.from(reasons).join('\n  - ')}`)
  if (typeof scan.overall_energy === 'number') bits.push(`Energy read: ${scan.overall_energy}/10`)
  if (scan.tone_match) bits.push(`Closest tone reference: ${scan.tone_match.trim()}`)
  if (scan.tags?.length) bits.push(`Tags: ${scan.tags.slice(0, 8).join(', ')}`)
  const top = [...(scan.platform_ranking || [])].sort((a, b) => b.score - a.score)[0]
  if (top) bits.push(`Best platform fit: ${top.platform} (${top.score}/100) — ${top.reason}`)

  if (!bits.length) {
    return `SCANNER READ (content analysis of the actual image/video):
(no structured read available — rely on the image only)`
  }

  return `SCANNER READ — this is what a deep vision scan ALREADY identified in the exact image/video you are looking at. These are facts, not prompts. Treat every concrete noun below as available material for the caption. If the scanner named a specific subject (a collaborator, a gear piece, a moment, a setting), you MAY surface it in a variant — it is not invented, it is confirmed visible. You must NOT write in a way that contradicts the scanner's read.

${bits.join('\n')}

RULES FOR USING THE SCANNER READ:
- The scanner's job is to tell you what the clip is FOR (studio / press / live / release), not to script the caption. Use the ANGLE, not the noun-pile.
- Gear model names from the scanner are GUESSES unless the context line confirms them. The scanner cannot read serial numbers — it guesses "Nord" or "OB-6" from silhouettes. NEVER surface a specific gear model from the scanner alone. Only surface a gear model if: (a) the context line names it, OR (b) it is NM's canonical rig (4× CDJ-3000, V10, Technics 1210s, OB-6, Ableton Move) AND the scanner agrees. If in doubt, use generic ("synth", "the rig", "studio"), not the model.
- If the user's CONTEXT line is present, the context is the PRIMARY angle; the scanner is confirmation + detail. If context is absent, the scanner read supplies the subject (not the narration).
- Never contradict the scanner on POST TYPE. If the scanner says "studio shot", do NOT write "live." or invent a venue.
- Do NOT parrot the scanner's language verbatim ("the shareable core is..."). Translate it into NM voice.
- NEVER convert the scanner's compositional description (e.g. "wide overhead, dual-keyboard, LED glow, blonde hair, watch detail") into caption copy. That is image narration. The viewer can see it.`
}

const VARIANT_GUIDE: Record<CaptionVariant, string> = {
  long:  'Long: the extended, heartfelt register. Target 3–6 sentences, still plain NM voice. Use this for thank-yous, release notes, tour recaps, milestone reflections — posts that earn length because they carry real substance. Name actual people, venues, days, gear. First-person plural. Everything in BANNED PATTERNS still applies — no mystical fragments, no metaphors about the image, no "somewhere between" / "a study in" / "moments like this". Real feeling, plainly stated, grounded in concrete nouns. Can end with 🌓 but does not have to. LENGTH FLOOR: if the CONTEXT line contains a concrete noun, collaborator, occasion, or substance worth saying, LONG MUST be at least 2 full sentences and at least 20 words. Collapsing to a 2-word fragment ("back in it.", "in it.", "studio.") is ONLY acceptable when there is zero context AND the scanner shows nothing nameable — in that rare case, return one plain sentence, never a poetic fragment. Never collapse LONG below SAFE length when context is present.',
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
  ✗ "studio. Nord stacked on top, lower board glowing underneath, both hands working across both at once. building out the live rig, no arrangement, no safety net, just seeing what holds up when we play it through. more of this coming. 🌓"
     ↑ this is the exact failure mode NM flagged. Three compounded sins: (1) image narration — gear stack + body position + LED glow are all ALREADY VISIBLE; (2) process-poetry — "no arrangement, no safety net, just seeing what holds up" is romanticised studio-diary flourish, not how real people speak; (3) generic tease — "more of this coming" adds nothing. Also over-commits to "Nord" — scanner guessed it, but NM only names gear when confirmed. Correct rewrite: "studio. 🌓" OR "building the live rig. 🌓" (if context warrants it) OR "back in it." — nothing more.

Every "WRONG" example shares the same failure: metaphor/narration about the image, no subject, no stance, no signature. Generic enough that ANY artist could have posted it. That's the fail.

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

LONG variant — extended/heartfelt register. SAME NM voice, just more of it. Only goes long when the context gives substance to fill it with. Never pads. Never reaches for metaphor.

RIGHT (LONG — ship when context earns it):
  ✓ "we played warehouse 9 on Saturday. first room that ever said yes to this. the crowd stayed for the last track at 3. thank you for turning up, all of you. we're back in June with Dot. 🌓"
  ✓ "album's done. twelve months of sessions between London and Bristol, mostly on the OB-6. Dot mixed it. we didn't know if it'd land like this, so if it moves you, tell us. dates for the live show drop next week."
  ✓ "last show of the year. thank you to every promoter who booked us, every photographer who shot us, and everyone who stayed past last train. see you in 2027. 🌓"
  ✓ "records that shaped us, part 2. this one is Burial, Untrue, 2007. bought it on CD from Fopp the week it came out. still the reason half our tracks breathe the way they do. 🌓"
  ✓ "radio tonight on Rinse, 10pm. three hours, all new material we've been sitting on. first time any of it leaves the studio. tune in if you can, replay's up after."

WRONG (LONG — never ship these, even at length):
  ✗ "somewhere between the take and the final mix, we found something we didn't know we were looking for. this is for everyone who's been patient."   ← mystical + vague, zero concrete nouns
  ✗ "the last year has been a journey. thank you to everyone who has been part of it."   ← "journey" is banned, zero specifics
  ✗ "we've been making music for a long time. this feels different. we hope you feel it too."   ← no subject, no venue, no collaborator, no gear, no date — just vibes

The ONLY thing that licenses length in LONG is substance: real people named, real venues, real dates, real gear, real numbers. If you can't name any of those from the context, write SHORT instead.

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

PROCESS-POETRY PATTERNS (newly banned — these are the exact failure mode NM flagged):
- "no safety net" / "no net" / "no map" / "no blueprint" / "no plan"
- "no arrangement" / "no script" / "no rehearsal" (as romanticised boast)
- "just seeing what ___" / "seeing what holds up" / "seeing where it goes" / "seeing what sticks"
- "what holds up" / "what lands" / "what breaks" (as evaluative closers)
- "building out" / "working through" / "figuring out" (as studio-diary flourishes)
- "more of this coming" / "more coming" / "more soon" (generic tease without a real noun)
- "no safety / no rules / no anything" construction
- "playing it through" / "seeing it through" / "running it through" — process-stagey
- Compound gear-narration like "X on top, Y underneath, both hands working" — this is DESCRIBING THE IMAGE. Don't.

HARD ANTI-NARRATION RULE:
- The image is visible. Do NOT describe what the viewer will already see. Lists of gear + body positions + lighting conditions = image narration. Kill on detect.
- "Nord stacked on top, lower board glowing underneath, both hands working across both at once" is the exact failure. It reads the image back at the viewer. Rewrite to NM stance: name the subject once ("studio.") + one earned detail OR a stance ("back in it.") + 🌓. Nothing else.

If your draft reads like something a generic "moody artist AI" would write, it's wrong. NM writes plainly about real subjects, with one concrete detail per caption, signed off with 🌓 when natural.`

// ── Post-polish validators ─────────────────────────────────────────────
// Code-level guards that catch the failure modes the in-prompt rules keep
// missing. The model gets two chances: draft + polish. If LONG is still
// under floor or no variant surfaces the context subject, a single
// targeted repair pass fires. This is the brain pattern in miniature —
// deterministic validation of AI output, narrow retry when it fails.

const CONTEXT_STOPWORDS = new Set([
  'the','a','an','and','or','but','for','to','of','in','on','at','by','with','from',
  'no','yet','not','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','it','this','that','these','those','i','we','us',
  'our','you','your','some','any','all','more','most','much','very','just','here',
  'there','soon','now','then','when','where','what','why','how','if','so','up','out',
  'as','am','my','me','he','she','him','her','them','they','their','its','over','into',
  'next','last','new','old','still','also','only','even','got','get','got','yet','still',
])

function wordCount(s: string): number {
  return (s || '').trim().split(/\s+/).filter(Boolean).length
}

function sentenceCount(s: string): number {
  return (s || '').split(/[.!?]+/).map((x) => x.trim()).filter(Boolean).length
}

/** Extract candidate concrete nouns from a user-written context line.
 *  Heuristic, not grammar-aware: lowercase-tokenise, drop stopwords +
 *  very short tokens, keep the rest. Good enough to flag "album/press/
 *  dot/vespers" as substance vs. "for the / no date yet" as noise. */
function extractContextNouns(context: string): string[] {
  if (!context) return []
  const raw = context
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'+-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length >= 2)
    .filter((t) => !CONTEXT_STOPWORDS.has(t))
  return [...new Set(raw)]
}

/** LONG fails the floor when the user's context names real substance
 *  but the LONG variant collapses to a fragment. 20 words + 2 sentences
 *  matches the in-prompt rule; enforced here so the model can't ignore
 *  it. If no context nouns were detected, fragment LONG is permitted. */
function longFloorFails(long: string, contextNouns: string[]): boolean {
  if (contextNouns.length === 0) return false
  if (!long || !long.trim()) return true
  return wordCount(long) < 20 || sentenceCount(long) < 2
}

/** Context-coverage check: if the user wrote a context with concrete
 *  nouns and NO variant surfaces any of them, the set as a whole has
 *  drifted. One token-in-caption hit is enough to pass. Case-insensitive. */
function noVariantMentionsContext(
  variants: { long: string; safe: string; loose: string; raw: string },
  contextNouns: string[],
): boolean {
  if (contextNouns.length === 0) return false
  const haystack = [variants.long, variants.safe, variants.loose, variants.raw]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return !contextNouns.some((n) => haystack.includes(n))
}

/** Targeted repair pass — runs ONLY when a post-polish validator fails.
 *  Cheap Sonnet call with a narrow rewrite brief that names the exact
 *  failure + the exact nouns the output must surface. Falls back to the
 *  current variants on any error, so the user is never blocked. */
async function runCaptionRepair(args: {
  variants: { long: string; safe: string; loose: string; raw: string }
  context: string
  contextNouns: string[]
  needsLongFloor: boolean
  needsContextCoverage: boolean
  platform: Platform
  priorityContext?: string
}): Promise<{ long: string; safe: string; loose: string; raw: string } | null> {
  const issues: string[] = []
  if (args.needsLongFloor) {
    issues.push(
      `LONG variant is under floor (current: "${args.variants.long}"). CONTEXT has substance (nouns: ${args.contextNouns.join(', ')}). Rewrite LONG as 3-5 full sentences, ≥20 words, grounded in the context. Name at least one concrete noun from the list. Plain NM voice (first-person plural, lowercase default, no em-dashes, no AI tells). Never ship a one-word fragment as LONG when context is present.`,
    )
  }
  if (args.needsContextCoverage) {
    issues.push(
      `No variant mentions any concrete noun from the CONTEXT (${args.contextNouns.join(', ')}). The caption must name the subject — rewrite LONG and LOOSE so each surfaces at least one of these nouns. SAFE and RAW can stay brief as long as LONG + LOOSE carry the subject.`,
    )
  }
  if (issues.length === 0) return args.variants

  const system = `You are fixing specific failures in caption drafts for NIGHT manoeuvres (electronic music duo). Apply ONLY the requested fixes. Keep untouched variants verbatim. NM voice is: lowercase default, first-person plural (we/us/our), concrete nouns over abstractions, 🌓 as the sign-off when natural, no em-dashes, no @mentions, no hashtags, no AI tells. Brand casing: NIGHT manoeuvres (NIGHT caps, manoeuvres lowercase). NEVER invent specifics that aren't in the context.`

  const userText = `CONTEXT (from the artist): "${args.context}"
${args.priorityContext ? `\nPRIORITY ANCHOR (active phase): "${args.priorityContext}"\n` : ''}
CURRENT DRAFTS (repair these):
LONG: ${args.variants.long || '(empty)'}
SAFE: ${args.variants.safe || '(empty)'}
LOOSE: ${args.variants.loose || '(empty)'}
RAW: ${args.variants.raw || '(empty)'}

FIXES REQUIRED:
${issues.map((i, n) => `${n + 1}. ${i}`).join('\n\n')}

Platform: ${PLATFORM_LABEL[args.platform]} (${PLATFORM_LIMITS[args.platform]} chars max).

Return ONLY this JSON: {"long":"…","safe":"…","loose":"…","raw":"…"}. Apply the fixes above. Leave variants that already pass verbatim.`

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        system,
        max_tokens: 1200,
        messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) return null
    const text = data.content?.[0]?.text
    if (!text) return null
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      long?: string
      safe?: string
      loose?: string
      raw?: string
    }
    return {
      long:  parsed.long  || args.variants.long,
      safe:  parsed.safe  || args.variants.safe,
      loose: parsed.loose || args.variants.loose,
      raw:   parsed.raw   || args.variants.raw,
    }
  } catch {
    return null
  }
}

/**
 * Opus oversight pass. Runs AFTER Sonnet has drafted the 4 variants.
 * Reviews each draft against the full NM voice standard, rewrites any
 * that drift (AI clichés, missed context, weak hooks, wrong casing,
 * fabricated specifics), and returns the final publish-ready set.
 *
 * This is the architecture the user asked for: Sonnet does the grunt
 * work (the expensive vision + structured writing), Opus oversees for
 * quality. Cost-wise this is cheaper than an Opus pre-pass because
 * the oversight call is text-only (no image tokens) and input is
 * bounded to the 4 drafts + source material.
 *
 * Non-fatal: if Opus errors, we ship Sonnet's drafts directly.
 */
async function runCaptionPolish(args: {
  drafts: { long: string; safe: string; loose: string; raw: string }
  scan: ChainScanResult
  refs: VoiceRef[]
  platform: Platform
  context?: string
  priorityContext?: string
}): Promise<{
  long: string
  safe: string
  loose: string
  raw: string
} | null> {
  const { drafts, scan, refs, platform, context, priorityContext } = args
  const hasContext = !!(context && context.trim())
  const hasPriority = !!(priorityContext && priorityContext.trim())

  const system = `You are the QUALITY DIRECTOR for NIGHT manoeuvres' caption system. A faster writer (Sonnet) has drafted four caption variants for a specific post. Your job is to oversee, polish, and publish-gate them.

NIGHT manoeuvres is an electronic music duo. If ONE caption ships and sounds like AI, they lose faith in this whole product. You catch what Sonnet missed.

${SKILLS_CAPTION_GEN}

${FEW_SHOT}

${BANNED_PATTERNS}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR REVIEW PROCESS (apply to every variant)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Read the variant cold. Does it sound like a real person posting? If it reads AI-ish in any dimension, rewrite.
2. Does it surface the actual subject from the scan + context? If not, rewrite using the real concrete noun.
3. Does it hit a banned pattern ("somewhere between", "a study in", "diving in", etc.)? Rewrite.
4. Does proper-noun casing hold (Saturday, OB-6, Dot, NIGHT, Rinse)? Fix if not.
5. Does it use em-dashes / @mentions / hashtags in the caption body? Strip.
6. Is it within the platform char limit (${PLATFORM_LIMITS[platform]} for ${PLATFORM_LABEL[platform]})? Trim if over.
7. Does it fit its variant's register? (LONG = 2–6 sentences with real substance; SAFE = 1–2 short lines; LOOSE = one concrete detail + 🌓; RAW = fragment/word/timestamp.)

HARD LENGTH FLOOR — LONG variant only:
If CONTEXT contains a concrete noun, collaborator, occasion, or substance worth saying, LONG MUST be ≥ 2 sentences AND ≥ 20 words. If Sonnet's LONG draft is a fragment (e.g. "back in it.", "studio.", "in it. 🌓") AND there is real context, REWRITE LONG to 3–5 sentences grounded in that context — never ship a fragment as LONG. Collapsing to a fragment is ONLY acceptable when context is empty AND scanner has nothing concrete; in that rare case, return one plain sentence, never a single-word fragment. SAFE and LONG should NEVER be identical — LONG must carry more substance.

If Sonnet's draft already clears all 7 checks AND the length floor, keep it verbatim. If any check fails, rewrite the variant in NM voice. You are strict but not meddling — the bar is "would the artist ship this"? If yes, keep. If no, rewrite.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY this JSON object. No markdown, no commentary.
{
  "long":  "<final publish-ready LONG caption>",
  "safe":  "<final publish-ready SAFE caption>",
  "loose": "<final publish-ready LOOSE caption>",
  "raw":   "<final publish-ready RAW caption>"
}`

  const voiceBlock = buildVoiceBlock(refs)
  const scannerBlock = buildScannerBlock(scan)
  const priorityPolishBlock = hasPriority
    ? `PRIORITY ANCHOR (active phase — the post should quietly tie back here unless a specific CONTEXT overrides):\n"${priorityContext!.trim()}"\n`
    : ''
  const contextBlock = hasContext
    ? `CONTEXT (artist's stated angle):\n"${context!.trim()}"`
    : `NO CONTEXT GIVEN — ${hasPriority ? 'lean on the PRIORITY ANCHOR for craft-flavoured posts; use scanner read + image for subject.' : 'the captions must lean on the scanner read + image only. Brevity is the default.'}`

  const userText = `${voiceBlock}

${scannerBlock}

${priorityPolishBlock}${contextBlock}

Platform: ${PLATFORM_LABEL[platform]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SONNET'S DRAFTS (review + polish these, do not start from scratch unless a draft is unsalvageable)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LONG draft:
${drafts.long || '(empty)'}

SAFE draft:
${drafts.safe || '(empty)'}

LOOSE draft:
${drafts.loose || '(empty)'}

RAW draft:
${drafts.raw || '(empty)'}

Produce the JSON described in your instructions. Keep Sonnet's drafts verbatim when they already clear the bar. Rewrite only what needs rewriting.`

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        system,
        max_tokens: 1500,
        messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) return null
    const text = data.content?.[0]?.text
    if (!text) return null
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      long?: string
      safe?: string
      loose?: string
      raw?: string
    }
    if (!parsed.long && !parsed.safe && !parsed.loose && !parsed.raw) return null
    return {
      long:  parsed.long  || drafts.long,
      safe:  parsed.safe  || drafts.safe,
      loose: parsed.loose || drafts.loose,
      raw:   parsed.raw   || drafts.raw,
    }
  } catch {
    return null
  }
}

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
  /** Active priority gig/release the post should quietly anchor to (e.g.
   *  "Vespers · London · 12 June 2026 — 9-week audition"). Surfaced so that
   *  studio / process / live / teaser posts tie back to the north star
   *  (bookings + followers) instead of floating. See
   *  rule_caption_always_anchor_to_priority.md. Omit for posts where the
   *  anchor makes no sense (e.g. old archival footage, unrelated collab). */
  priorityContext?: string
  /** Caller's Supabase user id — enables brain post-check + invariant logging
   *  on the /api/claude side. Captions still generate without this, but drift
   *  telemetry is lost. Pass the current authed user.id whenever possible. */
  userId?: string
}): Promise<{ long: string; safe: string; loose: string; raw: string }> {
  const { scan, refs, platform, fileName, imageDataUrl, context, priorityContext, userId } = args
  const hasContext = !!(context && context.trim())
  const hasPriority = !!(priorityContext && priorityContext.trim())

  // Architecture: Sonnet drafts (fast + cheap + vision-capable), Opus
  // polishes (post-pass oversight). No pre-pass director — the brief is
  // produced by Opus as part of the polish call so we only pay for one
  // premium-model hop per caption generation, not two.

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
{"long":"…","safe":"…","loose":"…","raw":"…"}`

  const priorityBlock = hasPriority
    ? `PRIORITY ANCHOR (active phase — what NM is currently pushing):
"${priorityContext!.trim()}"

HOW TO USE THIS ANCHOR:
- If the user's CONTEXT line directly names a different subject (a press shoot, a remix drop, a thank-you), CONTEXT WINS. Do not force the anchor.
- If the user's CONTEXT line is absent, OR names a craft-flavoured subject (studio, process, rehearsal, new music, live rig, writing, recording, tour prep, teaser), at least one of the LOOSE or LONG variants SHOULD tie back to this anchor. Example: "new music for Hybrid Live. Vespers, 12 June. 🌓" or "writing for the Hybrid Live set. Vespers, London. 🌓"
- Never shoehorn the anchor into thank-you or release posts where it doesn't fit. Silence > forced tie-in.
- Capitalise proper nouns in the anchor exactly as shown ("Hybrid Live", "Vespers", "London", "12 June").
- Treat the anchor as a soft north star, not a hard constraint. SAFE / RAW can stay anchor-less if their brevity demands it.
`
    : ''

  const contextBlock = hasContext
    ? `CONTEXT (what this post is FOR — the angle/reason, from the artist themselves):
"${context!.trim()}"

HARD CONTEXT RULES (violations invalidate the caption):
1. The caption MUST name the single most specific concrete noun from the context — album, tour, release, venue, collaborator, gear, city, day. If the context says "press shots for the album", "album" (or "press" + "album") must appear in at least ONE of the three variants. If it says "warehouse 9 with Dot", "warehouse 9" and "Dot" must appear.
2. The caption MUST NOT defuse the context into a generic. "dot + nm press shots for the album" → NEVER write "new photos" — that strips the collaborator, the occasion, and the hook in one move. It is the exact failure mode NM hates.
3. If the context mentions a collaborator by handle or name (e.g. "dot + nm"), surface the collaborator in at least the LOOSE variant. Capitalise first names ("Dot").
4. If the context includes a tease ("no date yet", "soon", "incoming"), the caption may tease — "album incoming.", "dates soon." — but NEVER invent a date, venue, or title.
5. The image informs tone; the CONTEXT is the subject. If image and context disagree, context wins.`
    : `NO EXPLICIT CONTEXT GIVEN.
${hasPriority
  ? `Default behaviour: for craft-flavoured posts (studio, process, writing, live rig, teaser) anchor at least one variant to the PRIORITY ANCHOR above. For ambiguous / pure-vibe posts, go fragment-short per the decision tree. Never invent specifics beyond what the anchor contains.`
  : `Default to extreme brevity — a fragment, a single word, a timestamp, a lowercase observation. Examples: "press.", "dot + nm.", "new.", "saturday.", "today's work."`}
DO NOT invent an event, release, or collaboration outside what the anchor states. DO NOT describe the image.`

  const userText = `${buildVoiceBlock(refs)}

${hasPriority ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${priorityBlock}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

` : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contextBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${buildScannerBlock(scan)}

Platform: ${PLATFORM_LABEL[platform]} (file: ${fileName})

Write four caption variants for the SAME post, each applying the weighted voice blend above. Variants span from extended to minimal — pick different stances, never pad.

- LONG: ${VARIANT_GUIDE.long}
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
      // Brain hook: server-side rule post-check + invariant_log telemetry.
      // No-ops gracefully if userId is absent.
      task: platform === 'instagram' ? 'caption.instagram' : platform === 'tiktok' ? 'caption.tiktok' : 'caption.threads',
      userId,
      feature: 'chain_caption_gen',
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `Caption API error ${res.status}`)
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty caption response')

  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
    long?: string
    safe?: string
    loose?: string
    raw?: string
  }

  // Sonnet's drafts, pre-polish. These still go through the scrubbers
  // because the polish pass can error (network, parse, rate-limit) and
  // we need a non-embarrassing fallback.
  const sonnetDrafts = {
    long:  scrubBrandText(scrubAiTells(parsed.long  || '')),
    safe:  scrubBrandText(scrubAiTells(parsed.safe  || '')),
    loose: scrubBrandText(scrubAiTells(parsed.loose || '')),
    raw:   scrubBrandText(scrubAiTells(parsed.raw   || '')),
  }

  // Opus oversight. Reviews all four variants against the full NM voice
  // standard, rewrites what drifted, and returns the brief. Text-only
  // call (no image re-upload) to keep cost down. Falls back to Sonnet's
  // drafts on error so the user is never blocked.
  const polished = await runCaptionPolish({
    drafts: sonnetDrafts,
    scan,
    refs,
    platform,
    context,
    priorityContext,
  })

  // Post-polish validators. Catches the two failure modes the in-prompt
  // rules keep missing: LONG collapsing to a fragment when context has
  // substance, and the whole set drifting off the context subject.
  // Runs the repair pass only when something fails — normal flow is a no-op.
  const preRepair = polished || sonnetDrafts
  const contextNouns = extractContextNouns(context || '')
  const needsLongFloor = longFloorFails(preRepair.long, contextNouns)
  const needsContextCoverage = noVariantMentionsContext(preRepair, contextNouns)

  let final = preRepair
  if (needsLongFloor || needsContextCoverage) {
    const repaired = await runCaptionRepair({
      variants: preRepair,
      context: (context || '').trim(),
      contextNouns,
      needsLongFloor,
      needsContextCoverage,
      platform,
      priorityContext,
    })
    if (repaired) final = repaired
  }

  return {
    long:  scrubBrandText(scrubAiTells(final.long)),
    safe:  scrubBrandText(scrubAiTells(final.safe)),
    loose: scrubBrandText(scrubAiTells(final.loose)),
    raw:   scrubBrandText(scrubAiTells(final.raw)),
  }
}
