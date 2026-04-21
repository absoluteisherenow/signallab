// Text-based rule checks. Each runs on AI output (caption body, email body,
// etc.) and returns { passed, detail }. Pure — no DB, no I/O — so they're
// cheap to run against every generation and safe for unit tests.

import type { CheckResult, OutputCheckFn } from '../types'
import { humanizer } from './humanizer'

const EM_DASH_RE = /[—–]/
const AI_MENTION_RE = /\b(AI|artificial intelligence|llm|chatgpt|claude)\b/i
const AT_TAG_RE = /@[\w.]+/

// Ported from voiceCheck.ts — the regexes that actually catch AI-tells. Kept
// identical so migrating chainCaptionGen over to the brain doesn't change the
// catch surface. Update this list, not the old voiceCheck.ts.
const CLICHES: RegExp[] = [
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
  /\bsafety net\b/i,
  /\bno arrangement\b/i,
  /\bno script\b/i,
  /\bno blueprint\b/i,
  /\bno rehearsal\b/i,
  /\bno plan\b/i,
  /\bjust seeing\b/i,
  /\bseeing what (holds|sticks|lands|breaks)\b/i,
  /\bwhat holds up\b/i,
  /\bplay(ing)? it through\b/i,
  /\bsee(ing)? it through\b/i,
  /\brun(ning)? it through\b/i,
  /\bbuilding (it |them |the )?out\b/i,
  /\bmore (of this )?coming\b/i,
  /\bmore soon\b/i,
  /\bfiguring (it )?out\b/i,
  /\bworking through\b/i,
]

const FABRICATED_MONEY_RE = /[£$€]\s?\d{1,3}(?:,?\d{3})*(?:\.\d+)?/

function ok(): CheckResult {
  return { passed: true }
}

export const emDash: OutputCheckFn = (output) =>
  EM_DASH_RE.test(output)
    ? { passed: false, detail: 'em-dash/en-dash found — use commas, periods, or line breaks' }
    : ok()

export const aiMention: OutputCheckFn = (output) =>
  AI_MENTION_RE.test(output)
    ? { passed: false, detail: 'AI/LLM/ChatGPT/Claude mentioned — strip any reference to AI' }
    : ok()

export const noAtTagsInCaption: OutputCheckFn = (output) =>
  AT_TAG_RE.test(output)
    ? { passed: false, detail: 'caption contains @mentions — move to first_comment or user_tags' }
    : ok()

export const captionCliches: OutputCheckFn = (output) => {
  const hits = CLICHES.filter((re) => re.test(output)).map((re) => re.source.replace(/\\b/g, '').replace(/\(.*?\)/g, ''))
  return hits.length
    ? { passed: false, detail: `clichés detected: ${hits.join(', ')}` }
    : ok()
}

// Enforce artist.casing_rules. Each entry is { canonical: string, banned?: string[] }.
// Default behaviour: if the canonical phrase's case-insensitive form appears
// in the output but the exact casing doesn't match the canonical, fail.
export const artistCasing: OutputCheckFn = (output, ctx) => {
  const rules = ctx.artist.casing_rules || {}
  const misses: string[] = []
  for (const canonical of Object.keys(rules)) {
    if (!canonical) continue
    const re = new RegExp(canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const m = re.exec(output)
    if (m && m[0] !== canonical) {
      misses.push(`"${m[0]}" → should be "${canonical}"`)
    }
  }
  return misses.length
    ? { passed: false, detail: `casing: ${misses.join('; ')}` }
    : ok()
}

// Advisory — if priority is set, flag when the output doesn't reference it.
// This is `soft_flag` severity: logs but doesn't block.
export const captionMentionsPriority: OutputCheckFn = (output, ctx) => {
  const anchor = ctx.priority.formatted
  if (!anchor) return ok()
  const venue = ctx.priority.gig?.venue?.toLowerCase() || ''
  const title = ctx.priority.gig?.title?.toLowerCase() || ''
  const missionName = ctx.priority.mission?.name?.toLowerCase() || ''
  const lo = output.toLowerCase()
  const mentioned =
    (venue && lo.includes(venue.toLowerCase())) ||
    (title && title.length > 3 && lo.includes(title.toLowerCase())) ||
    (missionName && lo.includes(missionName.split('·')[0].trim().toLowerCase()))
  return mentioned
    ? ok()
    : { passed: false, detail: `priority (${anchor}) not referenced — consider anchoring caption` }
}

// Hard-block fabricated financial numbers. Only fails if output contains a
// currency+amount AND the AI wasn't explicitly told "use this number from DB".
// Since the brain builds the prompt, we know the AI shouldn't produce £ from
// thin air unless the prompt seeded it.
export const noFabricatedNumbers: OutputCheckFn = (output) =>
  FABRICATED_MONEY_RE.test(output)
    ? { passed: false, detail: 'output contains a £/$/€ amount — verify it came from live data, not a fabricated figure' }
    : ok()

// Named-check registry: the DB column `check_fn` references keys of this map.
// Extendable — new rules add a new key + handler here.
export const textCheckRegistry: Record<string, OutputCheckFn> = {
  emDash,
  aiMention,
  noAtTagsInCaption,
  captionCliches,
  artistCasing,
  captionMentionsPriority,
  noFabricatedNumbers,
  humanizer,
}
