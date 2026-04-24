import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

// Signal voice assistant — routed through the central brain so every response
// inherits: artist identity, casing rules, Voice DNA, banned patterns, active
// rules, strategy primer, current narrative threads, priority anchor. This is
// the SAME context chainCaptionGen + agents use — Signal used to bypass it
// entirely via /api/claude/stream, which is why it fabricated set times and
// album names (commit f8eac46). Never again.
//
// Non-streaming: max_tokens is small (<400) and TTS can't start until we have
// the full response anyway. Streaming would add complexity for no UX win.

interface AskBody {
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const body = (await req.json()) as AskBody
  if (!body?.message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  // Build the message list — if the caller passed history, append the new user
  // message; otherwise single-turn.
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(body.history || []).slice(-8), // cap at last 8 turns to keep prompt lean
    { role: 'user', content: body.message },
  ]

  const result = await callClaudeWithBrain({
    userId: gate.user.id,
    task: 'assistant.chat',
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messagesOverride: messages,
    taskInstruction: `You are Signal — the artist's voice-first assistant. Your reply will be spoken aloud by TTS.

Hard rules:
- 2-3 sentences max. Natural speech. No bullet points, no markdown, no headings.
- Answer ONLY from the context above (artist identity, gigs, invoices, releases, narrative threads, priority, performance signals). If a detail isn't in the context, say "I don't have that yet" — never invent set times, album names, crowd sizes, ticket prices, billing order, travel times, or anything else.
- Speak like a trusted collaborator who already knows the artist's calendar and story. Don't greet. Don't ask them to tell you about themselves.
- Never mention you're AI. Never mention "the data" or "the context" — just speak the facts naturally.
- Never send, publish, or submit anything on behalf of the artist without them confirming the exact content first.`,
    // Assistant chat is freeform — the voice/casing/narrative-thread rules
    // still matter but we don't want the output checker to hard-block a
    // spoken response for failing a caption-shaped rule.
    runPostCheck: false,
    // Short voice reply — no need to invoke the council or red-team.
    council: false,
  })

  return NextResponse.json({
    text: result.text,
    usage: result.usage,
  })
}
