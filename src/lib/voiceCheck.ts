/**
 * Client-side AI-tell check — runs on every generated caption before it's
 * allowed to Preview + Approve. Hard-enforces the brand rules around em-dashes,
 * AI-sounding clichés, generic superlatives, and literal-description openers.
 */

const EM_DASH = /[—–]/
const CLICHES = [
  /\bdiving into\b/i,
  /\bunpack(ing)?\b/i,
  /\bdeep dive\b/i,
  /\bat the end of the day\b/i,
  /\blet me take you\b/i,
  /\bjourney\b/i,
  /\bunlock\b/i,
  /\bunleash\b/i,
  /\belevate\b/i,
  /\bnavigating\b/i,
  /\bgame[- ]?chang(ing|er)\b/i,
  /\bharness\b/i,
  /\bunmissable\b/i,
  /\bmust[- ]see\b/i,
  /\btapestry\b/i,
  /\brealm\b/i,
  /\bin (today'?s|the) (digital )?landscape\b/i,
  /\bat the forefront\b/i,
]
const SUPERLATIVES = [
  /\bunbeliev(able|ably)\b/i,
  /\bincredib(le|ly)\b/i,
  /\bamazing\b/i,
  /\bmagical\b/i,
  /\bepic\b/i,
  /\blegendary\b/i,
]
const LITERAL_OPENERS = [
  /^(a|the)\s+(photo|shot|picture|image|snap)\s+/i,
  /^here'?s\s+(a|the|some)\s+/i,
  /^this\s+(is|shows)\s+/i,
]
const AI_MENTIONS = /\b(AI|artificial intelligence|llm|chatgpt|claude)\b/i

export interface VoiceCheck {
  em_dash: { ok: boolean; detail?: string }
  cliches: { ok: boolean; detail?: string[] }
  specific: { ok: boolean; detail?: string }
  human: { ok: boolean; detail?: string[] }
  on_voice: { ok: boolean; detail?: string }
  overall: boolean
}

/**
 * Highlight the exact substrings that would trip the voice check.
 * Used by the Artist Voice proof page to render the inline red flags.
 */
export interface FlaggedRange { start: number; end: number; kind: 'em_dash' | 'cliche' | 'superlative' | 'literal' | 'ai' }

export function flagCaption(text: string): FlaggedRange[] {
  const out: FlaggedRange[] = []
  let m: RegExpExecArray | null

  const scan = (re: RegExp, kind: FlaggedRange['kind']) => {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    while ((m = r.exec(text))) {
      out.push({ start: m.index, end: m.index + m[0].length, kind })
      if (m[0].length === 0) r.lastIndex++
    }
  }

  scan(EM_DASH, 'em_dash')
  CLICHES.forEach(re => scan(re, 'cliche'))
  SUPERLATIVES.forEach(re => scan(re, 'superlative'))
  LITERAL_OPENERS.forEach(re => scan(re, 'literal'))
  scan(AI_MENTIONS, 'ai')
  return out.sort((a, b) => a.start - b.start)
}

export function runVoiceCheck(text: string): VoiceCheck {
  const trimmed = (text || '').trim()
  const emDash = EM_DASH.test(text)
  const clicheHits = CLICHES.filter(re => re.test(text)).map(re => re.source)
  const superHits = SUPERLATIVES.filter(re => re.test(text)).map(re => re.source)
  const literalOpener = LITERAL_OPENERS.some(re => re.test(trimmed))
  const aiMention = AI_MENTIONS.test(text)

  // Short fragments ARE the NM voice (72% lowercase, 12% <10 words). "new
  // photos. more soon. 🌓" is on-voice; gating on digits/weekdays/proper
  // nouns punishes exactly the output we want. Treat any of these as
  // sufficient evidence of concreteness:
  //   - ≤ 6 words (fragment = signature)
  //   - contains an emoji (NM signs off with 🌓)
  //   - has a digit, weekday, or proper-noun-looking word
  //   - contains a known NM subject word (press, studio, live, tour, etc.)
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  const emojiRe = /\p{Extended_Pictographic}/u
  const nmSubject = /\b(press|studio|live|tour|show|release|remix|radio|record|records|rehearsal|soundcheck|new|back|saturday|sunday|friday|monday|tuesday|wednesday|thursday|tonight|tomorrow|today)\b/i
  const traditional = /\d|\b[A-Z][a-z]+/
  const hasConcrete =
    wordCount <= 6 ||
    emojiRe.test(text) ||
    nmSubject.test(text) ||
    traditional.test(text)

  const humanDetail = [
    ...clicheHits.map(c => `cliche: ${c}`),
    ...superHits.map(s => `superlative: ${s}`),
    literalOpener ? ['literal opener'] : [],
    aiMention ? ['AI mention'] : [],
  ].flat() as string[]

  // Overall = only the hard fails. `specific` is advisory — it no longer
  // gates publish, because short on-brand fragments were being flagged
  // drifted and blocking the Preview+Approve button for good captions.
  const overall = !emDash && humanDetail.length === 0 && !aiMention

  return {
    em_dash: { ok: !emDash, detail: emDash ? 'em-dash found' : undefined },
    cliches: { ok: clicheHits.length === 0, detail: clicheHits },
    specific: { ok: hasConcrete, detail: hasConcrete ? undefined : 'nothing concrete' },
    human: { ok: humanDetail.length === 0, detail: humanDetail.length ? humanDetail : undefined },
    on_voice: { ok: overall, detail: undefined },
    overall,
  }
}

/**
 * Scrub mechanical AI-tells out of a caption. Used as a last-line defence on
 * generated captions — the prompt also forbids these, but prompt-level
 * instructions don't reliably enforce character-level bans.
 */
export function scrubAiTells(raw: string): string {
  let s = (raw || '').trim()
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
  s = s.replace(/^caption\s*:\s*/i, '')
  s = s.replace(/^(a |the )?(photo|shot|picture|image|snap|capture)( of)?\s+/i, '')
  s = s.replace(/^here'?s (a |the |some )?/i, '')
  s = s.replace(/^this (is |shows )/i, '')
  // em-dash / en-dash → comma
  s = s.replace(/\s*[—–]\s*/g, ', ')
  s = s.replace(/,\s*,/g, ',')
  s = s.replace(/,\s*\./g, '.')
  return s.trim()
}
