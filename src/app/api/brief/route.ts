import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'

export async function POST(req: NextRequest) {
  const apiKey = await env('ANTHROPIC_API_KEY')

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
        model: 'claude-sonnet-4-6',
        max_tokens: 150,
        system: `You are a concise briefing assistant for an electronic music artist. Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Generate a single plain sentence (no quotes) summarizing their week based on the data provided. Be specific about dates — say the actual day name (e.g. "Thursday" not "this Friday"). Natural, encouraging but honest. Never use emojis. Never say you're an AI. IMPORTANT: Never include specific numbers, amounts, currencies, or figures in the greeting — no fees, invoice totals, or counts. Keep it qualitative, not quantitative.`,
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
