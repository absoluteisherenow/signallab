// Single entry point for every Anthropic API call. All routes MUST go through
// this helper so usage is tracked in `api_usage` with correct pricing per model.
//
// Features:
//  - Automatic prompt caching on static system prompts (cache_control: ephemeral).
//    Saves ~90% on repeated input tokens (Anthropic caches for 5 min).
//  - Usage logging to Supabase `api_usage` table (user_id, feature, tokens, cost).
//  - Correct per-model pricing (Sonnet 4.6, Opus 4.6, Haiku 4.5).
//  - Swallows logging errors — never breaks the primary API call.

import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { headers: { 'Accept-Encoding': 'identity' } } }
)

// Per-million-tokens USD. Source: anthropic.com/pricing, 2026-04.
// Cache reads ≈ 10% of input rate. Cache writes ≈ 125% of input rate (1× for ephemeral).
type ModelId =
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-6'
  | 'claude-opus-4-7'
  | 'claude-haiku-4-5'
  | 'claude-haiku-4-5-20251001'

const PRICING: Record<ModelId, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-opus-4-7':           { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku-4-5':          { input: 1.00, output: 5.00, cacheRead: 0.10, cacheWrite: 1.25 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00, cacheRead: 0.10, cacheWrite: 1.25 },
}

export type SystemBlock = string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>

export interface CallClaudeOptions {
  userId?: string | null      // null/undefined for cron/system calls
  feature: string              // e.g. 'gmail_scanner', 'assistant', 'media_scan'
  model: ModelId
  max_tokens: number
  system?: SystemBlock         // string → auto-cached. Array → you control cache_control.
  messages: Array<{ role: 'user' | 'assistant'; content: any }>
  temperature?: number
  stop_sequences?: string[]
  // When true, the `system` string is wrapped in a cache-enabled content block.
  // Default true — every static system prompt should be cached. Pass false if
  // the system prompt changes per call (e.g. embedded user-specific data).
  cacheSystem?: boolean
}

export interface CallClaudeResponse {
  ok: boolean
  status: number
  data: any
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_tokens: number
    cache_write_tokens: number
    cost_usd: number
  }
  text: string  // convenience — content[0].text if present
}

function buildSystem(system: SystemBlock | undefined, cacheSystem: boolean): SystemBlock | undefined {
  if (!system) return undefined
  if (typeof system === 'string') {
    if (!cacheSystem) return system
    return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
  }
  return system
}

function computeCost(model: ModelId, u: {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}) {
  const p = PRICING[model] || PRICING['claude-sonnet-4-6']
  const input = u.input_tokens || 0
  const output = u.output_tokens || 0
  const cacheRead = u.cache_read_input_tokens || 0
  const cacheWrite = u.cache_creation_input_tokens || 0
  const cost =
    (input / 1_000_000) * p.input +
    (output / 1_000_000) * p.output +
    (cacheRead / 1_000_000) * p.cacheRead +
    (cacheWrite / 1_000_000) * p.cacheWrite
  return { input, output, cacheRead, cacheWrite, cost }
}

async function logUsage(params: {
  userId: string | null | undefined
  feature: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost_usd: number
  duration_ms: number
}) {
  try {
    await supabase.from('api_usage').insert({
      user_id: params.userId || null,
      feature: params.feature,
      model: params.model,
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      cache_read_tokens: params.cache_read_tokens,
      cache_write_tokens: params.cache_write_tokens,
      cost_usd: params.cost_usd,
      duration_ms: params.duration_ms,
      called_at: new Date().toISOString(),
    })
  } catch {
    // Never let telemetry break the primary call.
  }
}

export async function callClaude(opts: CallClaudeOptions): Promise<CallClaudeResponse> {
  const apiKey = (await env('ANTHROPIC_API_KEY'))!
  const started = Date.now()

  const body: Record<string, any> = {
    model: opts.model,
    max_tokens: opts.max_tokens,
    messages: opts.messages,
  }
  const sys = buildSystem(opts.system, opts.cacheSystem !== false)
  if (sys !== undefined) body.system = sys
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.stop_sequences) body.stop_sequences = opts.stop_sequences

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  const duration = Date.now() - started

  const u = data.usage || {}
  const cost = computeCost(opts.model, u)

  // Fire-and-forget logging.
  void logUsage({
    userId: opts.userId,
    feature: opts.feature,
    model: opts.model,
    input_tokens: cost.input,
    output_tokens: cost.output,
    cache_read_tokens: cost.cacheRead,
    cache_write_tokens: cost.cacheWrite,
    cost_usd: cost.cost,
    duration_ms: duration,
  })

  const text = data?.content?.[0]?.text || ''
  return {
    ok: res.ok,
    status: res.status,
    data,
    usage: {
      input_tokens: cost.input,
      output_tokens: cost.output,
      cache_read_tokens: cost.cacheRead,
      cache_write_tokens: cost.cacheWrite,
      cost_usd: cost.cost,
    },
    text,
  }
}
