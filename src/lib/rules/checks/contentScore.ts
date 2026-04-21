// Heuristic content-score check. Ported from
// ~/.claude/skills/content-scoring-framework/SKILL.md — the 4-score framework
// (Reach / Authenticity / Culture / Visual Identity) adapted for a text-only
// post-check context (visuals scored elsewhere). Returns a weighted composite
// 0–100; soft-flags below SCORE_MIN so the brain logs drift without blocking.
//
// Philosophy: this is a guardrail, not an arbiter. The model is already voice-
// primed via the brain; this catches captions that slipped through looking
// generic, promo-ish, or low-hook. Calibration is deliberately conservative —
// every real NM caption in testing scored 65+.

import type { CheckResult, OutputCheckFn } from '../types'

const SCORE_MIN = 60

// --- Reach signals ----------------------------------------------------------

// A concrete noun or number in the first sentence = hook. We reward specificity.
const CONCRETE_FIRST_SENTENCE = /[0-9]|[A-Z][a-z]+\s+[A-Z][a-z]+|\b(bpm|hz|khz|vinyl|cdj|modular|reel|808|909|303)\b/i

// Corporate/promo openers drag Reach. These are the classic "sounds like a label did it" starters.
const PROMO_OPENERS = [
  /^(so |honestly |excited |thrilled |blessed |humbled |grateful |just |really )/i,
  /\b(excited to (announce|share)|thrilled to (announce|share)|without further ado)\b/i,
  /^check (it |this |us )/i,
  /^new (music|single|track|release|ep)/i,
]

// Engagement bait kills underground credibility AND flags as low-Reach because
// platforms now penalise obvious bait.
const ENGAGEMENT_BAIT = [
  /\btag (a |your )?(friend|mate|someone)\b/i,
  /\bwho('s| is) (ready|coming|going)\b/i,
  /\bdouble tap\b/i,
  /\bcomment (below|if|your)\b/i,
  /\b(let me know|what do you think|thoughts\?)\b/i,
  /\bwhich (track|song|one)\b/i,
  /\blink in bio\s*[!.?]*$/i,
]

// --- Culture signals (underground red flags) -------------------------------

const CULTURE_RED_FLAGS = [
  /\bexcited to announce\b/i,
  /\bblessed\b/i,
  /\bhumbled\b/i,
  /\bgrateful (to|for)\b/i,
  /\bcountdown\b/i,
  /\bwho['']s ready\b/i,
  /\bmust[- ]?(see|hear|watch)\b/i,
  /\bunmissable\b/i,
  /\bdon['']?t miss\b/i,
]

// --- Authenticity signals ---------------------------------------------------

// These are the patterns that scream "marketing team wrote this".
const INAUTHENTIC_MARKERS = [
  /!{2,}/,                              // multiple exclamations
  /\?{2,}/,                             // multiple questions
  /[A-Z]{4,}/,                          // shouty caps (except known acronyms handled via casing rules)
  /\ud83d\udd25|\ud83d\udc4a|\ud83c\udf89|\ud83d\ude0d/u, // 🔥 👊 🎉 😍 = tell
]

// --- Helpers ---------------------------------------------------------------

function firstSentence(text: string): string {
  const trimmed = text.trim()
  const m = trimmed.match(/^[^.!?\n]+/)
  return m ? m[0] : trimmed
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function countHashtags(text: string): number {
  const m = text.match(/#\w+/g)
  return m ? m.length : 0
}

// --- The scorer -------------------------------------------------------------

export interface ContentScoreBreakdown {
  reach: number
  authenticity: number
  culture: number
  composite: number
  weakest: 'reach' | 'authenticity' | 'culture'
  reasons: string[]
}

export function scoreCaption(output: string): ContentScoreBreakdown {
  const reasons: string[] = []
  const first = firstSentence(output)
  const wc = wordCount(output)
  const hashtags = countHashtags(output)

  // --- REACH (0–100) -------------------------------------------------------
  let reach = 60
  if (CONCRETE_FIRST_SENTENCE.test(first)) {
    reach += 15
    reasons.push('concrete first sentence (+reach)')
  } else if (first.length < 20) {
    reach -= 5
  }
  if (PROMO_OPENERS.some((r) => r.test(output.trim()))) {
    reach -= 20
    reasons.push('promo opener detected (-reach)')
  }
  if (ENGAGEMENT_BAIT.some((r) => r.test(output))) {
    reach -= 25
    reasons.push('engagement bait detected (-reach)')
  }
  if (wc > 180) {
    reach -= 10
    reasons.push('caption too long for most feeds (-reach)')
  } else if (wc < 4) {
    reach -= 5
  }
  if (hashtags > 8) {
    reach -= 10
    reasons.push(`${hashtags} hashtags (platform caps at ~8) (-reach)`)
  }
  reach = Math.max(0, Math.min(100, reach))

  // --- AUTHENTICITY (0–100) ------------------------------------------------
  let authenticity = 75
  if (INAUTHENTIC_MARKERS.some((r) => r.test(output))) {
    authenticity -= 20
    reasons.push('inauthentic markers (caps / !! / party emoji) (-auth)')
  }
  if (PROMO_OPENERS.some((r) => r.test(output.trim()))) {
    authenticity -= 15
  }
  // Lowercase-default voice is an NM-style marker; not penalising non-lowercase,
  // just rewarding the existing-voice pattern. Ctx handles artist-specific targets.
  const caps = (output.match(/[A-Z]/g) || []).length
  const alpha = (output.match(/[A-Za-z]/g) || []).length
  if (alpha > 0 && caps / alpha > 0.15) {
    authenticity -= 5
  }
  authenticity = Math.max(0, Math.min(100, authenticity))

  // --- CULTURE (0–100) -----------------------------------------------------
  let culture = 80
  const flagHits = CULTURE_RED_FLAGS.filter((r) => r.test(output))
  if (flagHits.length) {
    culture -= 20 * flagHits.length
    reasons.push(`${flagHits.length} underground red flag(s) (-culture)`)
  }
  if (hashtags > 8) culture -= 10
  if (ENGAGEMENT_BAIT.some((r) => r.test(output))) culture -= 15
  culture = Math.max(0, Math.min(100, culture))

  // Weighted composite (Reach .25, Auth .40, Culture .35 — Visual scored elsewhere,
  // so we re-allocate its .20 weight to authenticity + culture, the text-native axes).
  const composite = Math.round(reach * 0.25 + authenticity * 0.4 + culture * 0.35)

  const scores = { reach, authenticity, culture }
  let weakest: 'reach' | 'authenticity' | 'culture' = 'reach'
  let min = scores.reach
  for (const k of ['authenticity', 'culture'] as const) {
    if (scores[k] < min) {
      min = scores[k]
      weakest = k
    }
  }

  return { reach, authenticity, culture, composite, weakest, reasons }
}

// --- The check_fn -----------------------------------------------------------

export const contentScore: OutputCheckFn = (output): CheckResult => {
  const { composite, reach, authenticity, culture, weakest, reasons } = scoreCaption(output)
  if (composite >= SCORE_MIN) return { passed: true }
  const reasonBlob = reasons.length ? ` — ${reasons.join('; ')}` : ''
  return {
    passed: false,
    detail: `content score ${composite}/100 (reach ${reach}, auth ${authenticity}, culture ${culture}, weakest=${weakest})${reasonBlob}`,
  }
}
