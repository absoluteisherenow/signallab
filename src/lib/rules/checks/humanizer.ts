// Humanizer — AI-writing pattern detector. Ported from the humanizer skill
// (~/.claude/skills/humanizer/SKILL.md). Runs as a brain post-check over every
// generated caption / outreach / press-copy output. Catches the mechanical AI
// tells that aren't covered by emDash/aiMention/captionCliches (which handle
// narrower cases). Registered in textChecks.ts under `humanizer`.
//
// Severity guidance: start as soft_flag so it logs to invariant_log without
// forcing a regen. Ratchet to hard_block once the hit-rate is low and
// confidence is high.

import type { CheckResult, OutputCheckFn } from '../types'

// AI-tell vocabulary (pattern #9). Each word is a concrete giveaway. Intentionally
// conservative — common words like "foster" only matter in marketing-copy context
// but false positives here are cheap (soft flag only).
const AI_VOCAB: RegExp[] = [
  /\bdelve(s|d|ing)?\b/i,
  /\btapestry\b/i,
  /\bin (today'?s|the) (digital )?landscape\b/i,
  /\bpivotal\b/i,
  /\bmultifaceted\b/i,
  /\bnuanced\b/i,
  /\btestament\b/i,
  /\bfoster(s|ed|ing)?\b/i,
  /\bleverag(e|es|ed|ing)\b/i,
  /\bparadigm\b/i,
  /\bcornerstone\b/i,
  /\bspearhead(s|ed|ing)?\b/i,
  /\brealm of\b/i,
  /\brobust\b/i,
  /\bcomprehensive\b/i,
  /\bintricate\b/i,
  /\bgroundbreaking\b/i,
  /\btransformative\b/i,
  /\bmeticulous(ly)?\b/i,
  /\bseamless(ly)?\b/i,
]

// Copula avoidance (pattern #10) — "serves as", "stands as"
const COPULA_AVOIDANCE: RegExp[] = [
  /\bserves as\b/i,
  /\bstands as\b/i,
  /\brepresents\b(?! a|:)/i, // 'represents X as Y' style
]

// Negative parallelism (pattern #11) — "not just X but Y", "not only X but Y"
const NEGATIVE_PARALLELISM: RegExp[] = [
  /\bnot just [^,.!?]+? but\b/i,
  /\bnot only [^,.!?]+? but\b/i,
]

// Sycophantic / servile (pattern #22)
const SYCOPHANTIC: RegExp[] = [
  /^(great question|absolutely|that'?s a great|happy to help|i'?d be happy)/im,
  /\b(great question|wonderful question|excellent question)\b/i,
]

// Filler phrases (pattern #23)
const FILLER: RegExp[] = [
  /\bit'?s worth noting\b/i,
  /\bit'?s important to note\b/i,
  /\bin today'?s (landscape|world|climate|era|market)\b/i,
  /\bat the end of the day\b/i,
  /\bwithout further ado\b/i,
  /\blet'?s dive in(to)?\b/i,
]

// Excessive hedging (pattern #24)
const HEDGING: RegExp[] = [
  /\bcould potentially\b/i,
  /\bmay potentially\b/i,
  /\bit could be argued\b/i,
  /\bone might say\b/i,
  /\bsome might argue\b/i,
]

// Generic positive conclusions (pattern #25)
const GENERIC_CONCLUSIONS: RegExp[] = [
  /\bpromises to (redefine|transform|revolutionize|reshape|elevate)\b/i,
  /\bexciting (development|journey|chapter|milestone)\b/i,
  /\bmarks a pivotal\b/i,
  /\ba new era of\b/i,
]

// Collaborative artifacts (pattern #26) — I-hope-this-helps and sign-offs
const COLLAB_ARTIFACTS: RegExp[] = [
  /\bi hope this helps\b/i,
  /\blet me know if\b/i,
  /\bfeel free to\b/i,
  /\bplease don'?t hesitate\b/i,
]

// Knowledge-cutoff disclaimers (pattern #27)
const KNOWLEDGE_CUTOFF: RegExp[] = [
  /\bas of my (last|knowledge) (update|cutoff)\b/i,
  /\bi don'?t have (real[- ]time|live|current) (access|information|data)\b/i,
  /\bmy training data\b/i,
]

// Curly quotes (pattern #29) — platforms often auto-convert, but AI output
// frequently contains them verbatim.
const CURLY_QUOTES = /[\u2018\u2019\u201C\u201D]/

// Promotional / ad language (pattern #4)
const PROMO_LANGUAGE: RegExp[] = [
  /\bdon'?t miss (this|out on)\b/i,
  /\bgrab your (tickets|copy|spot)\b/i,
  /\bunmissable\b/i,
  /\bmust[- ]see\b/i,
  /\bmust[- ]have\b/i,
]

interface PatternGroup {
  label: string
  patterns: RegExp[]
}

const GROUPS: PatternGroup[] = [
  { label: 'AI vocabulary', patterns: AI_VOCAB },
  { label: 'copula avoidance', patterns: COPULA_AVOIDANCE },
  { label: 'negative parallelism', patterns: NEGATIVE_PARALLELISM },
  { label: 'sycophantic', patterns: SYCOPHANTIC },
  { label: 'filler', patterns: FILLER },
  { label: 'hedging', patterns: HEDGING },
  { label: 'generic conclusion', patterns: GENERIC_CONCLUSIONS },
  { label: 'collaborative artifact', patterns: COLLAB_ARTIFACTS },
  { label: 'knowledge-cutoff disclaimer', patterns: KNOWLEDGE_CUTOFF },
  { label: 'promotional', patterns: PROMO_LANGUAGE },
]

function collectHits(text: string): string[] {
  const hits: string[] = []
  for (const group of GROUPS) {
    for (const re of group.patterns) {
      const m = re.exec(text)
      if (m) {
        hits.push(`${group.label}: "${m[0]}"`)
      }
    }
  }
  if (CURLY_QUOTES.test(text)) hits.push('curly quotes (use straight quotes)')
  return hits
}

export const humanizer: OutputCheckFn = (output): CheckResult => {
  const hits = collectHits(output)
  if (!hits.length) return { passed: true }
  // Dedupe adjacent duplicates and cap detail length so invariant_log stays readable.
  const unique = Array.from(new Set(hits)).slice(0, 6)
  const more = hits.length > unique.length ? ` (+${hits.length - unique.length} more)` : ''
  return {
    passed: false,
    detail: `AI-writing tells: ${unique.join('; ')}${more}`,
  }
}
