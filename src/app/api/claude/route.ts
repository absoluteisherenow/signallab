import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// -- SQL to create the cache table (run once in Supabase SQL editor) --
// CREATE TABLE claude_cache (
//   cache_key text primary key,
//   response text not null,
//   created_at timestamptz default now(),
//   expires_at timestamptz not null
// );

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Haiku pricing (per 1M tokens, as of 2025)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6':        { input: 3.00, output: 15.00 },
  'claude-opus-4-6':          { input: 15.00, output: 75.00 },
}

/** Simple non-cryptographic hash — good enough for cache keys */
function hashKey(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(16)
}

/** Try to read a valid (non-expired) cache entry. Returns null on miss or error. */
async function getCached(key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('claude_cache')
      .select('response, expires_at')
      .eq('cache_key', key)
      .single()

    if (error || !data) return null
    if (new Date(data.expires_at) <= new Date()) return null
    return data.response as string
  } catch {
    return null
  }
}

/** Write a response to the cache. Silently swallows errors (e.g. table missing). */
async function setCached(key: string, response: string, ttlMs: number): Promise<void> {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlMs)
    await supabase.from('claude_cache').upsert({
      cache_key: key,
      response,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
  } catch {
    // Table doesn't exist or network error — proceed without caching
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const model = body.model || 'claude-sonnet-4-6'
    const nocache: boolean = body.nocache === true

    // --- Server-side cache check ---
    // TTL: 1 hour for "brief" prompts, 24 hours otherwise
    const isBrief = body.type === 'brief'
    const ttlMs = isBrief ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000

    let cacheKey: string | null = null

    if (!nocache) {
      const systemPart = body.system ?? ''
      const messagesPart = JSON.stringify(body.messages ?? [])
      cacheKey = hashKey(model + ':' + systemPart + messagesPart)

      const cached = await getCached(cacheKey)
      if (cached) {
        return NextResponse.json(JSON.parse(cached), {
          headers: { 'x-cache': 'HIT' },
        })
      }
    }
    // --- End cache check ---

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: body.max_tokens || 600,
        ...(body.system && { system: body.system }),
        messages: body.messages,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data?.error?.message || `Anthropic API error ${response.status}`
      return NextResponse.json({ error: msg }, { status: response.status })
    }

    // --- Write to server-side cache (fire and forget) ---
    if (!nocache && cacheKey) {
      setCached(cacheKey, JSON.stringify(data), ttlMs)
    }
    // --- End cache write ---

    // Track usage in Supabase (fire and forget — don't block response)
    const inputTokens = data.usage?.input_tokens || 0
    const outputTokens = data.usage?.output_tokens || 0
    const pricing = PRICING[model] || PRICING['claude-haiku-4-5-20251001']
    const costUsd = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
    const month = new Date().toISOString().slice(0, 7)

    supabase.from('api_usage').insert({
      month,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      called_at: new Date().toISOString(),
    }).then(() => {})
    // Note: upsert adds to existing — handled via DB trigger or RPC ideally, but simple insert works for now

    return NextResponse.json(data, {
      headers: { 'x-cache': 'MISS' },
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
