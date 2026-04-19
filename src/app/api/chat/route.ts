import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { env } from '@/lib/env'

/**
 * POST /api/chat
 * Generic Claude passthrough used by Set Lab (debrief summary, crowd pattern analysis).
 * Body: { messages: [{ role, content }], model?: string, max_tokens?: number, system?: string }
 * Returns: { response: string } (also aliased as `content` for legacy callers)
 */
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const apiKey = await env('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const messages = Array.isArray(body.messages) ? body.messages : []
    if (!messages.length) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    // Accept legacy 'claude-sonnet-4-20250514' and normalise to current ID.
    // All interactive Signal Lab features use Sonnet (per project_model_policy).
    const requestedModel: string = body.model || 'claude-sonnet-4-6'
    const model = requestedModel.startsWith('claude-haiku') ? 'claude-sonnet-4-6' : requestedModel

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: body.max_tokens || 2048,
        ...(body.system ? { system: body.system } : {}),
        messages,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err?.error?.message || `Anthropic API ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    const text = data?.content?.[0]?.text || ''
    return NextResponse.json({ response: text, content: text })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message || 'chat failed' }, { status: 500 })
  }
}
