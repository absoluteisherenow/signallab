import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SYSTEM_PROMPT = `You are Signal — the command bar assistant for Signal Lab OS, a creative business operating system for electronic music artists. You help NIGHT MANOEUVRES / ABSOLUTE. with everything: gigs, invoices, releases, content, set prep, contacts, and anything else they need.

You understand shorthand: "southwave" = Southwave, "hoopla" = Mighty Hoopla, "poof doof" or "pd" = POOF DOOF, "pitch" = Pitch Music & Arts.
Artist aliases: ABSOLUTE. (POOF DOOF, Southwave, Mighty Hoopla), Night Manoeuvres (Pitch Music & Arts).

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
  const apiKey = await env('ANTHROPIC_API_KEY')
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  try {
    const { message } = await req.json()
    if (!message?.trim()) return NextResponse.json({ reply: 'Type a command to get started.' })

    // Fetch full context — invoices, gigs, releases, contacts
    const [invoicesR, gigsR, releasesR, contactsR] = await Promise.allSettled([
      supabase.from('invoices').select('id, gig_title, amount, currency, status, due_date, type, artist_name').order('created_at', { ascending: false }).limit(20),
      supabase.from('gigs').select('id, venue, city, date, set_time, status, fee, currency, promoter_email, al_name').order('date', { ascending: true }).limit(20),
      supabase.from('releases').select('id, title, artist, type, release_date, label, status').order('release_date', { ascending: false }).limit(10),
      supabase.from('contacts').select('id, name, email, role, company').limit(20),
    ])

    const invoices = invoicesR.status === 'fulfilled' ? invoicesR.value.data || [] : []
    const gigs = gigsR.status === 'fulfilled' ? gigsR.value.data || [] : []
    const releases = releasesR.status === 'fulfilled' ? releasesR.value.data || [] : []
    const contacts = contactsR.status === 'fulfilled' ? contactsR.value.data || [] : []

    const invoiceContext = invoices
      .map((i: any) => `- ${i.gig_title} (${i.artist_name || 'NM'}) | ${i.currency} ${i.amount} | ${i.status} | due ${i.due_date || 'none'} | id:${i.id}`)
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

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `${fullContext || 'No data loaded'}\n\nCommand: ${message}`,
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
    } else if (action?.type === 'add_gig') {
      const { type: _, ...gigData } = action as Record<string, unknown>
      await supabase.from('gigs').insert([{ ...gigData, status: 'confirmed' }])
    } else if (action?.type === 'update_gig') {
      await supabase.from('gigs').update(action.updates as Record<string, unknown>).eq('id', action.gig_id)
    }

    return NextResponse.json({ reply: parsed.reply, action: action?.type || null, navigate: action?.type === 'navigate' ? action.href : null })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ reply: message }, { status: 500 })
  }
}
