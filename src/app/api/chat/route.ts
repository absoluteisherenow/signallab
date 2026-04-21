import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

/**
 * POST /api/chat
 * Generic Claude passthrough used by Set Lab (debrief summary, crowd pattern analysis).
 * Body: { messages: [{ role, content }], model?: string, max_tokens?: number, system?: string }
 * Returns: { response: string } (also aliased as `content` for legacy callers)
 *
 * Brain-wired: the caller's system prompt becomes `extraSystem` so the brain's
 * identity/rules/priority block is always the base context, and the caller's
 * domain-specific instructions are appended. Post-check disabled because chat
 * output is freeform prose — we just want the rules *in* the prompt, not
 * enforced retroactively against a conversational reply.
 */
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    const body = await req.json()
    const messages = Array.isArray(body.messages) ? body.messages : []
    if (!messages.length) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    // Accept legacy 'claude-sonnet-4-20250514' and normalise to current ID.
    // All interactive Signal Lab features use Sonnet (per project_model_policy).
    const requestedModel: string = body.model || 'claude-sonnet-4-6'
    const normalised = requestedModel.startsWith('claude-haiku')
      ? 'claude-sonnet-4-6'
      : requestedModel.startsWith('claude-sonnet-4-')
      ? 'claude-sonnet-4-6'
      : requestedModel.startsWith('claude-opus-4-')
      ? 'claude-opus-4-7'
      : 'claude-sonnet-4-6'

    const result = await callClaudeWithBrain({
      userId,
      task: 'assistant.chat',
      model: normalised as any,
      max_tokens: body.max_tokens || 2048,
      taskInstruction:
        'Respond to the user as a concise assistant. Respect the identity, casing, voice, and rules above in every reply.',
      extraSystem: body.system ? `# Caller-specific instructions\n${body.system}` : undefined,
      messagesOverride: messages,
      runPostCheck: false,
    })

    const text = result.text
    return NextResponse.json({ response: text, content: text })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message || 'chat failed' }, { status: 500 })
  }
}
