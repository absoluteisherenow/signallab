import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

// Proactive opener — fires when the artist opens /signal. Scans OperatingContext
// (priority, gigs, invoices, narrative threads, recent performance) and returns
// the single most actionable thing to tell them right now. One sentence.
//
// The wow moment: instead of "tap to speak", Signal greets you with a real
// observation grounded in today's state. "Three weeks to Daphni, flight not
// booked, last post six days ago." — pulled from the same brain every other
// feature reads.

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const result = await callClaudeWithBrain({
    userId: gate.user.id,
    task: 'assistant.chat',
    model: 'claude-sonnet-4-6',
    max_tokens: 80,
    userMessage: 'Open the session.',
    taskInstruction: `You are Signal, opening a voice-first session with the artist. Scan the context above — priority, upcoming gigs, overdue invoices, narrative threads, recent performance signals.

Return ONE SENTENCE — the single most useful or urgent thing you can tell the artist right now, grounded entirely in the data above.

Hard rules:
- Be specific: use real names, dates, numbers, venues — pulled verbatim from the context.
- Never invent. If you don't have enough signal to say anything useful, say exactly: "Ready when you are." Nothing else.
- No greeting ("hey", "morning"). No question marks. No emoji. Just the observation.
- Max 20 words. Natural speech rhythm — it will be spoken aloud.
- Prefer the most time-sensitive or highest-leverage fact: impending gig with missing logistics, overdue invoice, narrative thread needing a post, etc.`,
    runPostCheck: false,
    council: false,
  })

  return NextResponse.json({
    opener: result.text.trim(),
  })
}
