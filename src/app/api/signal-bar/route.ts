import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

// Command-bar assistant. Brain injects artist identity/casing/voice/rules/priority
// automatically — we only add the pre-fetched user data (invoices/gigs/releases/
// contacts) and the action schema. Previous hardcoded "Night Manoeuvres /
// ABSOLUTE." block removed; the brain loads ctx.artist.name per user.

const ACTION_SCHEMA = `You are Signal — the command bar assistant for Signal Lab OS, a creative business operating system for electronic music artists.

When the user types a command, return ONLY valid JSON in this exact format:
{
  "reply": "<short sentence confirming what you did or answering the question>",
  "action": <action object or null>
}

Action types:
- Mark paid: { "type": "mark_paid", "invoice_id": "..." }
- Update invoice: { "type": "update_invoice", "invoice_id": "...", "updates": { "amount"?: number, "due_date"?: "YYYY-MM-DD", "currency"?: "AUD|GBP|EUR|USD", "status"?: "pending|paid|overdue", "artist_name"?: string } }
- Add invoice: { "type": "add_invoice", "gig_title": "...", "amount": number, "currency": "...", "type": "full|deposit|balance", "due_date"?: "YYYY-MM-DD", "artist_name"?: string }
- Delete invoice: { "type": "delete_invoice", "invoice_id": "..." }
- Add gig: { "type": "add_gig", "venue": "...", "city": "...", "date": "YYYY-MM-DD", "fee"?: number, "currency"?: "...", "set_time"?: "HH:MM", "promoter_email"?: "..." }
- Update gig: { "type": "update_gig", "gig_id": "...", "updates": { ... } }
- Navigate: { "type": "navigate", "href": "/path" }
- Info only (no change): null

Navigable pages: /dashboard, /today, /broadcast, /broadcast/calendar, /broadcast/media, /broadcast/plan, /broadcast/ideas, /broadcast/strategy, /broadcast/voice, /grow, /grow/ads, /grow/growth, /grow/automations, /setlab, /sonix, /gigs, /gigs/new, /releases, /releases/new, /contracts, /business/finances, /business/settings, /logistics, /meditate

Today's date: ${new Date().toISOString().split('T')[0]}
Keep replies short — max 12 words. No markdown. Be helpful with anything they ask.`

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id
  const service = gate.serviceClient

  try {
    const { message } = await req.json()
    if (!message?.trim()) return NextResponse.json({ reply: 'Type a command to get started.' })

    // User-scoped data fetch. serviceClient (service-role) must always filter
    // by user_id explicitly — RLS isn't assumed here.
    const [invoicesR, gigsR, releasesR, contactsR] = await Promise.allSettled([
      service.from('invoices').select('id, gig_title, amount, currency, status, due_date, type, artist_name').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      service.from('gigs').select('id, venue, city, date, set_time, status, fee, currency, promoter_email, al_name').eq('user_id', userId).order('date', { ascending: true }).limit(20),
      service.from('releases').select('id, title, artist, type, release_date, label, status').eq('user_id', userId).order('release_date', { ascending: false }).limit(10),
      service.from('contacts').select('id, name, email, role, company').eq('user_id', userId).limit(20),
    ])

    const invoices = invoicesR.status === 'fulfilled' ? invoicesR.value.data || [] : []
    const gigs = gigsR.status === 'fulfilled' ? gigsR.value.data || [] : []
    const releases = releasesR.status === 'fulfilled' ? releasesR.value.data || [] : []
    const contacts = contactsR.status === 'fulfilled' ? contactsR.value.data || [] : []

    const invoiceContext = invoices
      .map((i: any) => `- ${i.gig_title} (${i.artist_name || '?'}) | ${i.currency} ${i.amount} | ${i.status} | due ${i.due_date || 'none'} | id:${i.id}`)
      .join('\n')

    const gigContext = gigs
      .map((g: any) => `- ${g.venue}, ${g.city} | ${g.date}${g.set_time ? ` @ ${g.set_time}` : ''} | ${g.status || 'confirmed'}${g.fee ? ` | ${g.currency || 'GBP'} ${g.fee}` : ''} | id:${g.id}`)
      .join('\n')

    const releaseContext = releases
      .map((r: any) => `- ${r.title}${r.artist ? ` by ${r.artist}` : ''} | ${r.type} | ${r.release_date}${r.label ? ` on ${r.label}` : ''} | id:${r.id}`)
      .join('\n')

    const contactContext = contacts
      .map((c: any) => `- ${c.name}${c.role ? ` (${c.role})` : ''}${c.company ? ` @ ${c.company}` : ''}${c.email ? ` — ${c.email}` : ''} | id:${c.id}`)
      .join('\n')

    const fullContext = [
      invoiceContext ? `Invoices:\n${invoiceContext}` : '',
      gigContext ? `Gigs:\n${gigContext}` : '',
      releaseContext ? `Releases:\n${releaseContext}` : '',
      contactContext ? `Contacts:\n${contactContext}` : '',
    ].filter(Boolean).join('\n\n')

    const result = await callClaudeWithBrain({
      userId,
      task: 'assistant.chat',
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      taskInstruction: ACTION_SCHEMA,
      userMessage: `${fullContext || 'No data loaded'}\n\nCommand: ${message}`,
      runPostCheck: false,
    })

    const raw = (result.text || '{}').trim()
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: { reply: string; action: Record<string, unknown> | null }
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      return NextResponse.json({ reply: "Didn't understand that — try again." })
    }

    const action = parsed.action
    if (action?.type === 'mark_paid') {
      await service.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', action.invoice_id).eq('user_id', userId)
    } else if (action?.type === 'update_invoice') {
      await service.from('invoices').update(action.updates as Record<string, unknown>).eq('id', action.invoice_id).eq('user_id', userId)
    } else if (action?.type === 'add_invoice') {
      const { type: _, ...insertData } = action as Record<string, unknown>
      await service.from('invoices').insert([{ ...insertData, user_id: userId, status: 'pending' }])
    } else if (action?.type === 'delete_invoice') {
      await service.from('invoices').delete().eq('id', action.invoice_id).eq('user_id', userId)
    } else if (action?.type === 'add_gig') {
      const { type: _, ...gigData } = action as Record<string, unknown>
      await service.from('gigs').insert([{ ...gigData, user_id: userId, status: 'confirmed' }])
    } else if (action?.type === 'update_gig') {
      await service.from('gigs').update(action.updates as Record<string, unknown>).eq('id', action.gig_id).eq('user_id', userId)
    }

    return NextResponse.json({ reply: parsed.reply, action: action?.type || null, navigate: action?.type === 'navigate' ? action.href : null })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ reply: message }, { status: 500 })
  }
}
