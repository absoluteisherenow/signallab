// LLM Council — ported from ~/.claude/skills/llm-council/SKILL.md.
// Five advisors with intentionally clashing thinking styles run on the same
// decision, then a chairman synthesises. Opt-in for high-stakes TaskTypes
// (release.announce, ad.creative, ad.launch) or any call passing
// `council: true`. Not the default path — each session costs 6 Sonnet calls.
//
// Usage:
//   const verdict = await runCouncil({ userId, question, context, task })
//   // verdict.summary = chairman's final call
//   // verdict.advisors = per-advisor raw outputs (for audit)

import { callClaude } from '../callClaude'
import type { TaskType } from '../rules/types'

const ADVISORS = [
  {
    key: 'contrarian',
    prompt: `You are THE CONTRARIAN. Your job is to find what's wrong, what's missing, what will fail. Assume this idea has a fatal flaw and hunt for it. Surface the questions the proposer is avoiding. Don't be a pessimist for its own sake — be the friend who saves them from a bad call.`,
  },
  {
    key: 'first_principles',
    prompt: `You are THE FIRST PRINCIPLES THINKER. Strip away surface-level framing. Ask "what are we actually trying to solve?" Rebuild from the ground up. Willing to say "you're asking the wrong question entirely" when that's true. Keep it grounded.`,
  },
  {
    key: 'expansionist',
    prompt: `You are THE EXPANSIONIST. Look for upside others are missing. What could be bigger? What adjacent opportunity is hiding? What's being undervalued? You don't care about risk — that's the Contrarian's job. You care about what happens if this works BETTER than expected.`,
  },
  {
    key: 'outsider',
    prompt: `You are THE OUTSIDER. You have zero context about this scene or this artist's history. You respond to what's actually in front of you. Catch the curse of knowledge: what's obvious to an insider but confusing to everyone else? What reads as jargon, what reads as insider-only?`,
  },
  {
    key: 'executor',
    prompt: `You are THE EXECUTOR. You only care: can this actually be done, and what's the fastest path? Ignore theory, strategy, big-picture. Look at every idea through "what do you do Monday morning?" If it sounds brilliant but has no clear first step, say so.`,
  },
] as const

export type AdvisorKey = typeof ADVISORS[number]['key']

export interface CouncilAdvisorOutput {
  key: AdvisorKey
  text: string
}

export interface CouncilVerdict {
  question: string
  advisors: CouncilAdvisorOutput[]
  chairman: string
  model_used: string
}

const CHAIRMAN_SYSTEM = `You are the chairman of a 5-advisor council. You have just received 5 independent takes on the same decision. Your job:

1. Identify where the advisors AGREE — that's the load-bearing consensus.
2. Identify where they CLASH — that's the real decision point.
3. Give the user a crisp final recommendation (3-5 bullets max):
   - What to do
   - What tradeoff they're accepting
   - What to watch for

Write terse. Don't repeat the advisors — synthesise. No "the advisors said…". State the call. Underground music industry sensibility — no hype, no corporate tone.`

/**
 * Run the council on a high-stakes question. Returns per-advisor raw output
 * + a chairman synthesis. All 5 advisors + chairman = 6 calls total.
 */
export async function runCouncil(params: {
  userId: string
  question: string
  /** Context to share with every advisor (artist identity, priority, rules etc.). */
  sharedContext: string
  task: TaskType
}): Promise<CouncilVerdict> {
  const { userId, question, sharedContext, task } = params
  const model = 'claude-sonnet-4-6' as const

  const advisorRuns = await Promise.all(
    ADVISORS.map(async (a) => {
      const res = await callClaude({
        userId,
        feature: `brain.${task}.council.${a.key}`,
        model,
        max_tokens: 600,
        system: `${a.prompt}\n\nShared context (do not repeat to the user):\n${sharedContext}`,
        messages: [{ role: 'user', content: question }],
        temperature: 0.7,
      })
      return { key: a.key, text: res.text } as CouncilAdvisorOutput
    })
  )

  const bundle = advisorRuns
    .map((a) => `### ${a.key.toUpperCase()}\n${a.text}`)
    .join('\n\n')

  const chair = await callClaude({
    userId,
    feature: `brain.${task}.council.chairman`,
    model,
    max_tokens: 800,
    system: CHAIRMAN_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Question: ${question}\n\nFive advisors on the record:\n\n${bundle}\n\nSynthesise. Give me the call.`,
      },
    ],
    temperature: 0.4,
  })

  return {
    question,
    advisors: advisorRuns,
    chairman: chair.text,
    model_used: model,
  }
}

/** TaskTypes where the brain should auto-trigger the council by default. */
export const COUNCIL_AUTO_TASKS: TaskType[] = [
  'release.announce',
  'ad.creative',
  'ad.launch',
]

export function shouldAutoCouncil(task: TaskType): boolean {
  return COUNCIL_AUTO_TASKS.includes(task)
}
