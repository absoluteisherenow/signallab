import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SYSTEM_PROMPT = `You are the Signal Lab assistant for NIGHT MANOEUVRES / ABSOLUTE. — an electronic music artist OS. You manage tour finances, invoices, and gig data.

You understand shorthand: "southwave" = Southwave invoice, "hoopla" = Mighty Hoopla, "poof doof" or "pd" = POOF DOOF, "pitch" = Pitch Music & Arts.
Artist aliases: ABSOLUTE. (POOF DOOF, Southwave, Mighty Hoopla), Night Manoeuvres (Pitch Music & Arts).

When the user types a command, return ONLY valid JSON in this exact format:
{
  "reply": "<one short sentence confirming what you did or answering the question>",
  "action": <action object or null>
}

Action types:
- Mark paid: { "type": "mark_paid", "invoice_id": "..." }
- Update invoice: { "type": "update_invoice", "invoice_id": "...", "updates": { "amount"?: number, "due_date"?: "YYYY-MM-DD", "currency"?: "AUD|GBP|EUR|USD", "status"?: "pending|paid|overdue", "artist_name"?: string } }
- Add invoice: { "type": "add_invoice", "gig_title": "...", "amount": number, "currency": "...", "type": "full|deposit|balance", "due_date"?: "YYYY-MM-DD", "artist_name"?: string }
- Delete invoice: { "type": "delete_invoice", "invoice_id": "..." }
- Info only (no change): null

Today's date: ${new Date().toISOString().split('T')[0]}
Keep replies short — max 8 words. No markdown. Just confirm the action.`

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  try {
    const { message } = await req.json()
    if (!message?.trim()) return NextResponse.json({ reply: 'Type a command to get started.' })

    // Fetch current invoices for context
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, gig_title, amount, currency, status, due_date, type, artist_name')
      .order('created_at', { ascending: false })
      .limit(20)

    const invoiceContext = (invoices || [])
      .map(i => `- ${i.gig_title} (${i.artist_name || 'NM'}) | ${i.currency} ${i.amount} | ${i.status} | due ${i.due_date || 'none'} | id:${i.id}`)
      .join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Current invoices:\n${invoiceContext || 'None'}\n\nCommand: ${message}`,
          },
        ],
      }),
    })

    const data = await res.json()
    const raw = data?.content?.[0]?.text?.trim() || '{}'
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: { reply: string; action: Record<string, unknown> | null }
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      return NextResponse.json({ reply: "Didn't understand that — try again." })
    }

    // Execute the action
    const action = parsed.action
    if (action?.type === 'mark_paid') {
      await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', action.invoice_id)
    } else if (action?.type === 'update_invoice') {
      await supabase.from('invoices').update(action.updates as Record<string, unknown>).eq('id', action.invoice_id)
    } else if (action?.type === 'add_invoice') {
      const { type: _, ...insertData } = action as Record<string, unknown>
      await supabase.from('invoices').insert([{ ...insertData, status: 'pending' }])
    } else if (action?.type === 'delete_invoice') {
      await supabase.from('invoices').delete().eq('id', action.invoice_id)
    }

    return NextResponse.json({ reply: parsed.reply, action: action?.type || null })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ reply: message }, { status: 500 })
  }
}
