// Platform-native formatter check_fns. Ported from
// ~/.claude/skills/platform-native-formatter/SKILL.md.
//
// Each platform has hard character limits (breaks publish) and soft targets
// (underperforms). We enforce both, with the brain flagging soft-targets as
// soft_flag and hard-limits as hard_block so the regenerate loop fires.

import type { CheckResult, OutputCheckFn } from '../types'

// --- Character-limit checks -------------------------------------------------

// Instagram caption max 2,200 chars. First 125 shown before "more…".
export const captionCharsInstagram: OutputCheckFn = (output) => {
  if (output.length > 2200) {
    return { passed: false, detail: `caption ${output.length} chars — IG max 2200` }
  }
  return { passed: true }
}

// TikTok caption max 2,200 chars (was 150 in 2022, loosened since). We stay
// under 2200 as hard limit; content-score will nudge toward sub-150 for
// performance.
export const captionCharsTikTok: OutputCheckFn = (output) => {
  if (output.length > 2200) {
    return { passed: false, detail: `caption ${output.length} chars — TikTok max 2200` }
  }
  return { passed: true }
}

// Threads max 500 chars per post.
export const captionCharsThreads: OutputCheckFn = (output) => {
  if (output.length > 500) {
    return { passed: false, detail: `caption ${output.length} chars — Threads max 500` }
  }
  return { passed: true }
}

// --- Hashtag count checks ---------------------------------------------------

function countHashtags(text: string): number {
  const m = text.match(/#\w+/g)
  return m ? m.length : 0
}

// Instagram: 3–8 targeted hashtags. Above 8 = spammy / platform deprioritises.
export const hashtagCountInstagram: OutputCheckFn = (output) => {
  const n = countHashtags(output)
  if (n > 8) {
    return { passed: false, detail: `${n} hashtags — IG underground cap is 8` }
  }
  return { passed: true }
}

// TikTok: 3–5 relevant hashtags. #fyp #foryou no longer help.
export const hashtagCountTikTok: OutputCheckFn = (output) => {
  const n = countHashtags(output)
  if (n > 5) {
    return { passed: false, detail: `${n} hashtags — TikTok target is 3–5` }
  }
  if (/#(fyp|foryou|foryoupage|viral)\b/i.test(output)) {
    return { passed: false, detail: 'generic discovery tags (#fyp/#foryou) no longer help — use genre-specific' }
  }
  return { passed: true }
}

// Threads: no hashtags (not a discovery mechanism).
export const noHashtagsThreads: OutputCheckFn = (output) => {
  if (countHashtags(output) > 0) {
    return { passed: false, detail: 'hashtags found — Threads is not hashtag-driven' }
  }
  return { passed: true }
}

// --- Hashtag placement ------------------------------------------------------

// Hashtags must sit at the end of the caption (or in first comment), not mid-sentence.
// Heuristic: if a hashtag is followed by more than 40 chars of non-hashtag prose, fail.
export const hashtagPlacement: OutputCheckFn = (output) => {
  const matches = [...output.matchAll(/#\w+/g)]
  if (!matches.length) return { passed: true }
  const first = matches[0].index ?? 0
  const afterFirst = output.slice(first).replace(/#\w+/g, '').replace(/\s+/g, ' ').trim()
  // After first tag we allow short spacing/final punctuation; more than 40 chars of
  // actual prose = hashtag is embedded mid-sentence.
  if (afterFirst.length > 40) {
    return { passed: false, detail: 'hashtags embedded mid-caption — move to end or first comment' }
  }
  return { passed: true }
}

// --- Cross-platform watermark (negative signal) -----------------------------

// Flag captions that clearly ported from another platform with meta-references.
export const platformCrossPostTell: OutputCheckFn = (output) => {
  if (/\b(link in bio|swipe up|tap the link|check my stories)\b/i.test(output)) {
    return { passed: false, detail: 'cross-platform CTA (link in bio / swipe up) weakens native feel' }
  }
  return { passed: true }
}

// --- Registry ---------------------------------------------------------------

export const platformFormatRegistry = {
  captionCharsInstagram,
  captionCharsTikTok,
  captionCharsThreads,
  hashtagCountInstagram,
  hashtagCountTikTok,
  noHashtagsThreads,
  hashtagPlacement,
  platformCrossPostTell,
}
