import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

// Weekly one-sentence briefing. Brain-wired so the line respects the artist's
// voice (no em-dashes, no fabricated numbers, casing rules) and is anchored
// to the active mission/gig/release without the route needing to know what
// that is. Also post-checks the output against hard rules; `feedback_blur_fees`
// / `feedback_never_fabricate` have check_fn guards that flag currency leaks.
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    const { gigs, posts, overdueInvoices, quarterStats } = await req.json()

    const today = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    const dataSummary = JSON.stringify({ gigs, posts, overdueInvoices, quarterStats })

    const taskInstruction = `Today is ${today}. Write a SINGLE plain sentence (no quotes, no emojis) summarising this artist's week from the data provided.

Rules:
- Be specific about dates — say the actual day name ("Thursday", not "this Friday").
- Natural, encouraging but honest.
- Never say you're an AI.
- NEVER include specific numbers, amounts, currencies, or figures. No fees, invoice totals, or counts. Keep it qualitative, not quantitative.
- Output exactly one sentence.`

    const result = await callClaudeWithBrain({
      userId,
      task: 'brief.weekly',
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      userMessage: `Here is the artist's current week data: ${dataSummary}. Write one sentence summarising their week.`,
      taskInstruction,
    })

    return NextResponse.json({ brief: result.text.trim() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
