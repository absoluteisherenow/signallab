// Self-audit: run the 5-advisor council on the brain architecture itself.
// Mirrors the production council.ts but calls Anthropic directly so we don't
// need a deployed endpoint. Reads ANTHROPIC_API_KEY from .env.local.
//
// Usage: node scripts/council-brain-audit.mjs

import fs from 'node:fs'
import path from 'node:path'

// Lightweight .env.local loader (we don't have dotenv as a script dep)
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing from .env.local')

const MODEL = 'claude-sonnet-4-5-20250929' // Sonnet 4.6 alias per brain default

const ADVISORS = [
  {
    key: 'contrarian',
    system: `You are THE CONTRARIAN. Your job is to find what's wrong, what's missing, what will fail. Assume this idea has a fatal flaw and hunt for it. Surface the questions the proposer is avoiding. Don't be a pessimist for its own sake — be the friend who saves them from a bad call.`,
  },
  {
    key: 'first_principles',
    system: `You are THE FIRST PRINCIPLES THINKER. Strip away surface-level framing. Ask "what are we actually trying to solve?" Rebuild from the ground up. Willing to say "you're asking the wrong question entirely" when that's true. Keep it grounded.`,
  },
  {
    key: 'expansionist',
    system: `You are THE EXPANSIONIST. Look for upside others are missing. What could be bigger? What adjacent opportunity is hiding? What's being undervalued? You don't care about risk — that's the Contrarian's job. You care about what happens if this works BETTER than expected.`,
  },
  {
    key: 'outsider',
    system: `You are THE OUTSIDER. You have zero context about this scene or this artist's history. You respond to what's actually in front of you. Catch the curse of knowledge: what's obvious to an insider but confusing to everyone else? What reads as jargon, what reads as insider-only?`,
  },
  {
    key: 'executor',
    system: `You are THE EXECUTOR. You only care: can this actually be done, and what's the fastest path? Ignore theory, strategy, big-picture. Look at every idea through "what do you do Monday morning?" If it sounds brilliant but has no clear first step, say so.`,
  },
]

const CHAIRMAN = `You are the chairman of a 5-advisor council. You have just received 5 independent takes on the same decision. Your job:

1. Identify where the advisors AGREE — that's the load-bearing consensus.
2. Identify where they CLASH — that's the real decision point.
3. Give the user a crisp final recommendation (5-8 bullets max):
   - What to do
   - What tradeoff they're accepting
   - What to watch for

Write terse. Don't repeat the advisors — synthesise. No "the advisors said…". State the call. Underground music industry sensibility — no hype, no corporate tone.`

const SHARED_CONTEXT = `# Signal Lab OS — central-brain architecture (rounds 1-3, deployed April 2026)

Target user: Anthony / Night Manoeuvres — underground electronic music artist.
Product: creative business OS (captions, gigs, releases, ads, invoices, chat, agents).
North Star: more bookings + more followers, no credibility loss.

## What's wired

Round 1 — central brain:
- getOperatingContext(userId, task) → per-user runtime snapshot: artist identity, voice DNA, casing rules, active mission + next gig/release, rule_registry rows filtered to task, recent_performance, platform connections.
- callClaudeWithBrain() → single AI boundary; assembles system prompt from context, runs callClaude (pricing/caching/logging), post-checks output, auto-regenerates once on hard_block, logs every verdict to invariant_log.
- rule_registry (per-user) + default_rule_library (shared seed) + invariant_log.
- missions primitive — Vespers 12 Jun 2026 seeded; gigs/releases/invoices/posts carry mission_id.
- Voice DNA fingerprint (prefers/avoids/never_says/signature_moves/rhythm/emoji/punctuation).

Round 2:
- contentScore (3-axis heuristic: reach/authenticity/culture) — soft-flag <60.
- platformFormatRegistry (IG 2200/TikTok 2200/Threads 500, hashtag caps, #fyp block, placement rules).
- analytics interpreter → narrative + red_flags + positive_signals from post_performance.
- trend_snapshots table (nightly/global) → "Scene signal" prompt block.
- strategy primer (gig/release phase detection: seeding/announce/release_week/long_tail, gig: announce/context/day_of/recap).

Round 3:
- Outcome-weighted rules: rule_registry gains lift_vs_baseline + sample_size. Nightly cron joins invariant_log ↔ post_performance on caption prefix. Observational only in v1.
- Adversarial red-team (Haiku 4.5, opt-in) — finds fabrication / AI tells / poet-voice clichés / underground-credibility breaks. Soft_flag.
- 5-advisor LLM council (this one) — auto-triggers for release.announce, ad.creative, ad.launch. Returns advisor verbatim + chairman synthesis.
- Confidence + abstention — <signal>{confidence, missing_context}</signal> appended by model, parsed + stripped. Threshold 0.6 = draft vs publish.
- Narrative threads — medium-horizon stories (campaigns, rig narratives). Active threads inject "do not contradict" block. threadConsistency soft_flag catches literal watch-out phrases.

## Integrity layer (hard rules enforced everywhere)

- No em-dashes in captions (AI tell)
- No @mentions in captions (must go to first_comment / user_tags)
- No mention of AI/LLM/ChatGPT/Claude anywhere
- "NIGHT manoeuvres" exact casing
- Priority anchor injected on every caption (Vespers when active)
- Never-fabricate — especially financial (£/$/€ in output = hard block unless prompt seeded it)
- Invoice from-address = advancingabsolute@gmail.com (Gmail OAuth), not Resend
- IG publish rejects data: / blob: URLs pre-Meta
- Approve-before-send on all outbound

## Not yet shipped (known)

- /admin/narratives UI (threads must be added via DB or rule_registry UI)
- Surfacing confidence + council verdict in broadcast UI for user visibility
- Council not yet triggered by broadcast/chain caption flow (only release.announce, ad.creative, ad.launch)
- Outcome-weighted rule auto-demotion (v1 is observational)
- 32 legacy raw api.anthropic.com callers not yet migrated to brain wrapper (check-brain-wired.sh catches new ones)
- Content plan + release campaign generators not yet using council for flagship moments
- Red-team not auto-wired for ads or release rollouts (opt-in per call today)

## The question

Is this brain stack hitting optimal performance for Anthony's actual job — growing NIGHT manoeuvres via content + live work without compromising credibility? What's the highest-leverage thing we're still missing, what's over-engineered, and what's blind? Be specific. Ignore polish/theory — this needs to improve his Monday morning.`

const QUESTION = `Assess the Signal Lab OS brain architecture (shared context above) on whether it's hitting optimal performance for an underground electronic music artist's creative OS. Score the stack on:

1. Does it solve the right problems, or are we solving the wrong ones well?
2. What's the highest-leverage missing feature?
3. What's over-engineered — what would you rip out?
4. What's the single biggest blind spot?
5. Monday-morning test — does Anthony actually reach for this, or does he still go manual?

Be specific. 5-10 sentences. Don't re-state the architecture — critique it.`

async function callClaude({ system, user, maxTokens = 700, temp = 0.7 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      temperature: temp,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 500)}`)
  }
  const data = await res.json()
  const text = (data.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
  return text
}

async function main() {
  const startedAt = Date.now()
  console.log(`\n[council:brain-audit] running 5 advisors on the brain stack…\n`)
  const advisorRuns = await Promise.all(
    ADVISORS.map(async (a) => {
      const text = await callClaude({
        system: `${a.system}\n\nShared context (do not repeat to the user):\n${SHARED_CONTEXT}`,
        user: QUESTION,
        maxTokens: 700,
        temp: 0.7,
      })
      return { key: a.key, text }
    })
  )

  for (const a of advisorRuns) {
    console.log(`\n══════ ${a.key.toUpperCase()} ══════\n`)
    console.log(a.text.trim())
  }

  const bundle = advisorRuns
    .map((a) => `### ${a.key.toUpperCase()}\n${a.text.trim()}`)
    .join('\n\n')

  const chair = await callClaude({
    system: CHAIRMAN,
    user: `Question: ${QUESTION}\n\nFive advisors on the record:\n\n${bundle}\n\nSynthesise. Give me the call.`,
    maxTokens: 900,
    temp: 0.4,
  })

  console.log(`\n══════ CHAIRMAN ══════\n`)
  console.log(chair.trim())
  console.log(`\n[done] ${Math.round((Date.now() - startedAt) / 100) / 10}s`)
}

main().catch((e) => {
  console.error('[council:brain-audit] failed:', e)
  process.exit(1)
})
