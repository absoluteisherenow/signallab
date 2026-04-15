import { NextRequest } from 'next/server'

// Runs on Cloudflare Workers via OpenNext — native streaming support; no
// explicit edge-runtime directive needed (and it conflicts with bundling).

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 })
  }

  try {
    const body = await req.json()
    const model = body.model || 'claude-sonnet-4-6'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: body.max_tokens || 1200,
        stream: true,
        ...(body.system && { system: body.system }),
        messages: body.messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return new Response(err, { status: response.status })
    }

    // Pipe the SSE stream through to the client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
