import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const model = body.model || 'claude-haiku-4-5-20251001'

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

    return NextResponse.json(data)

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
