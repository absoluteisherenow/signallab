// The single AI boundary for brain-wrapped calls. Every feature that generates
// text through Claude SHOULD go through this (raw callClaude is allowed but
// loses the rules/context wiring that stops features silently drifting apart).
//
// Flow:
//   1. Load OperatingContext for this user + task
//   2. Assemble system prompt: artist identity → casing → voice → rules → priority → task instruction
//   3. callClaude (pricing, caching, api_usage logging)
//   4. Post-check outputs against every rule with a check_fn
//   5. One auto-regenerate on hard_block fail; second fail throws with detail
//   6. Fire-and-forget write to invariant_log
//   7. Return { text, invariant_report, operating_context, usage }

import { callClaude } from './callClaude'
import { getOperatingContext, type OperatingContext } from './operatingContext'
import {
  buildRulesPromptBlock,
  runOutputChecks,
  logInvariants,
  hardBlockFailures,
} from './rules'
import type { TaskType, InvariantVerdict } from './rules/types'
import { buildStrategyPrimer } from './brain/strategyPrimer'
import { formatTrendsBlock } from './brain/trends'

type ModelId =
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-6'
  | 'claude-opus-4-7'
  | 'claude-haiku-4-5'
  | 'claude-haiku-4-5-20251001'

export interface CallClaudeWithBrainOptions {
  userId: string
  task: TaskType
  model: ModelId
  max_tokens: number
  /** The user's raw message / request text that becomes the final user turn.
   *  Ignored if `messagesOverride` is supplied. */
  userMessage?: string
  /** For multi-turn callers (assistant/chat). When present, replaces the
   *  single-userMessage default turn. The brain still injects the system
   *  prompt + runs post-check on the final assistant text. */
  messagesOverride?: Array<{ role: 'user' | 'assistant'; content: any }>
  /** What the model should DO with the context — the task-specific instruction. */
  taskInstruction: string
  /** Optional overrides — useful for tests or unusual callers. */
  overrideContext?: Partial<OperatingContext>
  /** Default true for caption/post tasks. Set false for assistant chat / freeform. */
  runPostCheck?: boolean
  temperature?: number
  /** Optional extra system-prompt sections appended after the standard blocks. */
  extraSystem?: string
  /** Controls whether recent-performance block is loaded (extra DB read). */
  includeRecentPerf?: boolean
}

export interface CallClaudeWithBrainResponse {
  text: string
  invariant_report: InvariantVerdict[]
  operating_context: OperatingContext
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_tokens: number
    cache_write_tokens: number
    cost_usd: number
  }
  regenerated: boolean
}

function assembleSystemPrompt(
  ctx: OperatingContext,
  taskInstruction: string,
  extra?: string
): string {
  const sections: string[] = []

  // 1. Artist identity
  if (ctx.artist.name || ctx.artist.handle) {
    sections.push(
      `# Artist identity\nName: ${ctx.artist.name}\nHandle: ${ctx.artist.handle}${
        ctx.artist.genre ? `\nGenre: ${ctx.artist.genre}` : ''
      }${ctx.artist.bio ? `\nBio: ${ctx.artist.bio}` : ''}`
    )
  }

  // 2. Casing rules (critical for NIGHT manoeuvres style enforcement)
  const casingKeys = Object.keys(ctx.artist.casing_rules || {})
  if (casingKeys.length) {
    sections.push(
      `# Exact casing (enforce letter-perfect)\n${casingKeys
        .map((k) => `- "${k}" — write EXACTLY like this, never normalize`)
        .join('\n')}`
    )
  }

  // 3. Voice — banned patterns + samples (truncated) + DNA fingerprint
  if (ctx.artist.voice.banned_patterns.length) {
    sections.push(
      `# Banned patterns (do not produce)\n${ctx.artist.voice.banned_patterns
        .map((p) => `- ${p}`)
        .join('\n')}`
    )
  }

  // Voice DNA — optional richer fingerprint. Injected only when any sub-field
  // is populated so legacy artists (samples-only) are unaffected.
  const dna = ctx.artist.voice.dna || {}
  const dnaLines: string[] = []
  if (dna.word_choice?.prefers?.length) {
    dnaLines.push(`- Prefers these words/phrases: ${dna.word_choice.prefers.map((w) => `"${w}"`).join(', ')}`)
  }
  if (dna.word_choice?.avoids?.length) {
    dnaLines.push(`- Avoids these words/phrases: ${dna.word_choice.avoids.map((w) => `"${w}"`).join(', ')}`)
  }
  if (dna.never_says?.length) {
    dnaLines.push(`- NEVER says: ${dna.never_says.map((w) => `"${w}"`).join(', ')}`)
  }
  if (dna.signature_moves?.length) {
    dnaLines.push(`- Signature moves: ${dna.signature_moves.map((m) => `"${m}"`).join(', ')}`)
  }
  if (dna.rhythm?.avg_sentence_length) {
    const variance = dna.rhythm.variance ? ` (${dna.rhythm.variance} variance)` : ''
    dnaLines.push(`- Sentence rhythm: ~${dna.rhythm.avg_sentence_length} words avg${variance}`)
  }
  if (dna.emoji_use) {
    dnaLines.push(`- Emoji use: ${dna.emoji_use}`)
  }
  if (dna.punctuation_quirks?.length) {
    dnaLines.push(`- Punctuation: ${dna.punctuation_quirks.join('; ')}`)
  }
  if (dnaLines.length) {
    sections.push(`# Voice DNA (emulate precisely)\n${dnaLines.join('\n')}`)
  }

  if (ctx.artist.voice.samples.length) {
    const samples = ctx.artist.voice.samples.slice(0, 5)
    sections.push(`# Voice reference (emulate tone + rhythm)\n${samples.map((s) => `> ${s}`).join('\n')}`)
  }

  // 4. Active rules, grouped by severity
  const rulesBlock = buildRulesPromptBlock(ctx.rules)
  if (rulesBlock) sections.push(rulesBlock)

  // 5. Strategy primer — platform/algorithm/release-phase knowledge per task.
  // Replaces the bespoke strategy blocks scattered across chainCaptionGen,
  // assistant, agents/*. Empty string when no primer applies (invoice etc).
  const primer = buildStrategyPrimer(ctx.task, ctx)
  if (primer) sections.push(primer)

  // 6. Scene signal (nightly trend snapshot) — empty when no snapshot/ stale.
  const trendsBlock = formatTrendsBlock(ctx.trends)
  if (trendsBlock) sections.push(trendsBlock)

  // 7. Recent performance narrative + red flags — skip when include_recent_perf
  // was false (interpreter returns empty narrative in that case).
  if (ctx.recent_performance.narrative || ctx.recent_performance.red_flags.length) {
    const perfLines: string[] = ['# Recent performance signal']
    if (ctx.recent_performance.narrative) perfLines.push(ctx.recent_performance.narrative)
    if (ctx.recent_performance.positive_signals.length) {
      perfLines.push('Working right now:')
      for (const s of ctx.recent_performance.positive_signals) perfLines.push(`- ${s}`)
    }
    if (ctx.recent_performance.red_flags.length) {
      perfLines.push('Watch-outs:')
      for (const f of ctx.recent_performance.red_flags) perfLines.push(`- ${f}`)
    }
    sections.push(perfLines.join('\n'))
  }

  // 8. Priority anchor (mission / gig / release)
  if (ctx.priority.formatted) {
    sections.push(`# Priority context\n${ctx.priority.formatted}`)
  }

  // 9. Task instruction (the what-to-do)
  sections.push(`# Task\n${taskInstruction}`)

  if (extra) sections.push(extra)

  return sections.join('\n\n')
}

function mergeContext(
  base: OperatingContext,
  override?: Partial<OperatingContext>
): OperatingContext {
  if (!override) return base
  return {
    ...base,
    ...override,
    artist: { ...base.artist, ...(override.artist || {}) },
    priority: { ...base.priority, ...(override.priority || {}) },
    connections: { ...base.connections, ...(override.connections || {}) },
    recent_performance: { ...base.recent_performance, ...(override.recent_performance || {}) },
    rules: override.rules || base.rules,
  }
}

/**
 * Run Claude with the full central-brain stack: context load, rules injection,
 * post-check, auto-regenerate on hard_block, invariant logging.
 *
 * @throws If a hard_block rule fails twice in a row (original + regen).
 */
export async function callClaudeWithBrain(
  opts: CallClaudeWithBrainOptions
): Promise<CallClaudeWithBrainResponse> {
  const baseCtx = await getOperatingContext({
    userId: opts.userId,
    task: opts.task,
    opts: { include_recent_perf: !!opts.includeRecentPerf },
  })
  const ctx = mergeContext(baseCtx, opts.overrideContext)

  const system = assembleSystemPrompt(ctx, opts.taskInstruction, opts.extraSystem)
  const runChecks = opts.runPostCheck !== false

  const messages: Array<{ role: 'user' | 'assistant'; content: any }> =
    opts.messagesOverride && opts.messagesOverride.length
      ? opts.messagesOverride
      : [{ role: 'user', content: opts.userMessage ?? '' }]

  const first = await callClaude({
    userId: opts.userId,
    feature: `brain.${opts.task}`,
    model: opts.model,
    max_tokens: opts.max_tokens,
    system,
    messages,
    temperature: opts.temperature,
  })

  let text = first.text
  let usage = first.usage
  let regenerated = false
  let verdicts: InvariantVerdict[] = runChecks ? runOutputChecks(text, ctx.rules, ctx) : []

  // One auto-regenerate if anything hard-blocked. Tells the model exactly what
  // failed so it can correct rather than re-rolling blindly.
  if (runChecks && hardBlockFailures(verdicts).length) {
    const failures = hardBlockFailures(verdicts)
    const correction = `Your previous output failed these hard rules:\n${failures
      .map((f) => `- ${f.rule_slug}: ${f.detail || 'failed'}`)
      .join('\n')}\n\nRewrite the output fixing every failure. Keep the same intent and length.`

    const regen = await callClaude({
      userId: opts.userId,
      feature: `brain.${opts.task}.regen`,
      model: opts.model,
      max_tokens: opts.max_tokens,
      system,
      messages: [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: correction },
      ],
      temperature: opts.temperature,
    })

    text = regen.text
    regenerated = true
    usage = {
      input_tokens: usage.input_tokens + regen.usage.input_tokens,
      output_tokens: usage.output_tokens + regen.usage.output_tokens,
      cache_read_tokens: usage.cache_read_tokens + regen.usage.cache_read_tokens,
      cache_write_tokens: usage.cache_write_tokens + regen.usage.cache_write_tokens,
      cost_usd: usage.cost_usd + regen.usage.cost_usd,
    }
    verdicts = runOutputChecks(text, ctx.rules, ctx)
  }

  // Log every verdict (pass + fail). Fire-and-forget.
  void logInvariants({
    userId: opts.userId,
    task: opts.task,
    verdicts,
    outputSample: text,
  })

  // Second hard-block failure = hard error. Better to surface than ship bad output.
  const stillFailing = hardBlockFailures(verdicts)
  if (stillFailing.length) {
    const msg = stillFailing.map((f) => `${f.rule_slug}: ${f.detail || 'failed'}`).join('; ')
    throw new Error(`Hard-block rules still failing after regenerate: ${msg}`)
  }

  return {
    text,
    invariant_report: verdicts,
    operating_context: ctx,
    usage,
    regenerated,
  }
}
