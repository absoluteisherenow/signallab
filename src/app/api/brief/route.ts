import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    const { gigs, posts, overdueInvoices, quarterStats } = await req.json()

    const dataSummary = JSON.stringify({ gigs, posts, overdueInvoices, quarterStats })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: 'You are a concise briefing assistant for an electronic music artist. Generate a single plain sentence (no quotes) summarizing their week based on the data provided. Be specific, natural, encouraging but honest. Never use emojis.',
        messages: [
          {
            role: 'user',
            content: `Here is the artist's current week data: ${dataSummary}. Write one sentence summarising their week.`,
          },
        ],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data?.error?.message || `Anthropic API error ${response.status}`
      return NextResponse.json({ error: msg }, { status: response.status })
    }

    const brief = data.content?.[0]?.text?.trim() || ''
    return NextResponse.json({ brief })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
