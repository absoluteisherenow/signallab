// Adversarial red-team pre-flight. Between generation and post-check, a small
// model is asked to actively try to fail the content — find clichés the
// humanizer missed, fabricated claims, tone drift, mission contradictions.
// Output feeds an extra soft-flag verdict row so the brain logs red-team
// concerns without auto-regenerating. Auto-regenerate stays reserved for
// hard-block rule failures — red-team is advisory, not blocking.
//
// Model: Haiku 4.5 — cheap, fast, adequate for "find the flaw" tasks. If this
// ever becomes the critical path we can escalate to Sonnet per TaskType.

import { callClaude } from '../callClaude'
import type { OperatingContext } from '../operatingContext'
import type { InvariantVerdict } from '../rules/types'

export interface RedTeamVerdict extends InvariantVerdict {
  rule_slug: 'red_team_adversarial'
  severity: 'soft_flag'
}

const RED_TEAM_SYSTEM = `You are a red-team editor for underground electronic music content. Your job is to find flaws in the caption/post you are shown — not to praise it. Be specific. Be harsh.

Look for:
- Fabricated claims: specific numbers, quotes, places, dates that weren't in the brief
- AI-writing tells the first-pass checker missed (odd rhythm, overly polished, copula avoidance)
- Clichés that feel "poet-voice" or mystical-gear
- Corporate/promo openers that slipped through
- Engagement bait
- Contradictions with the mission or priority context
- Any tell that this was written by an LLM rather than the artist themselves
- Mainstream music-marketing tropes that would damage underground credibility

Output a plain-text list of concerns. One concern per line. Lead each line with the concern type in brackets, e.g.:
[FABRICATION] mentions "3000 pre-saves" — that number isn't in the brief
[AI TELL] rhythm is too even; no variance
[CLICHE] "the sonic landscape" reads as poet-voice

If the content is genuinely clean, output the single line: CLEAN

Do not rewrite. Do not praise. Find flaws only. Max 6 concerns.`

/**
 * Run an adversarial pass. Returns a single soft-flag verdict whose `detail`
 * contains the red-team concerns (or "clean" when none found).
 */
export async function runRedTeam(params: {
  userId: string
  output: string
  ctx: OperatingContext
  taskInstruction: string
}): Promise<RedTeamVerdict> {
  const { userId, output, ctx, taskInstruction } = params

  const priorityLine = ctx.priority.formatted ? `\n\nPriority context the artist is working toward:\n${ctx.priority.formatted}` : ''
  const userPrompt = `Original task instruction given to the generator:\n${taskInstruction}${priorityLine}\n\nGenerated output to red-team:\n"""\n${output}\n"""`

  try {
    const res = await callClaude({
      userId,
      feature: `brain.${ctx.task}.redteam`,
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: RED_TEAM_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3,
    })
    const text = (res.text || '').trim()
    const cleaned = text.toUpperCase().startsWith('CLEAN')
    if (cleaned || !text) {
      return {
        rule_slug: 'red_team_adversarial',
        severity: 'soft_flag',
        passed: true,
      }
    }
    return {
      rule_slug: 'red_team_adversarial',
      severity: 'soft_flag',
      passed: false,
      detail: text.slice(0, 800),
    }
  } catch (e: any) {
    // Never let red-team failure break the main call.
    return {
      rule_slug: 'red_team_adversarial',
      severity: 'soft_flag',
      passed: true,
      detail: `red-team skipped: ${e?.message || 'error'}`,
    }
  }
}
