import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { env } from '@/lib/env'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Called by Vercel cron daily at 9am
// Creates DRAFTS — never sends directly. User approves before send.

export async function GET(req: NextRequest) {
  return handler()
}

export async function POST(req: NextRequest) {
  return handler()
}

type Milestone = '7d_before' | 'due_today' | '3d_overdue' | '14d_overdue'

function getMilestone(daysUntilDue: number): Milestone | null {
  if (daysUntilDue === 7) return '7d_before'
  if (daysUntilDue === 0) return 'due_today'
  if (daysUntilDue === -3) return '3d_overdue'
  if (daysUntilDue === -14) return '14d_overdue'
  return null
}

function getToneInstruction(milestone: Milestone): string {
  switch (milestone) {
    case '7d_before':
      return 'Tone: friendly and warm — a heads-up, not a demand. Mention the show and that payment is coming up.'
    case 'due_today':
      return 'Tone: neutral and matter-of-fact — simply note that payment falls due today. No pressure, just a clear reminder.'
    case '3d_overdue':
      return 'Tone: firmer but still professional. Note the invoice is now overdue and ask for prompt settlement or an update.'
    case '14d_overdue':
      return 'Tone: formal. This is a final chase before further action. Be direct and clear that immediate payment is required.'
  }
}

async function generateChaseEmail({
  gigTitle,
  venue,
  gigDate,
  amount,
  currency,
  promoterName,
  daysUntilDue,
  milestone,
}: {
  gigTitle: string
  venue: string
  gigDate: string
  amount: number
  currency: string
  promoterName: string
  daysUntilDue: number
  milestone: Milestone
}): Promise<string> {
  const apiKey = await env('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('No ANTHROPIC_API_KEY set')

  const daysLabel =
    daysUntilDue > 0
      ? `due in ${daysUntilDue} days`
      : daysUntilDue === 0
      ? 'due today'
      : `${Math.abs(daysUntilDue)} days overdue`

  const toneInstruction = getToneInstruction(milestone)

  const prompt = `Write a brief, professional but warm payment reminder email for a DJ/electronic music artist chasing a fee from a promoter.

Details:
- Promoter first name: ${promoterName}
- Show: ${gigTitle} at ${venue}
- Show date: ${new Date(gigDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
- Invoice amount: ${currency} ${amount.toLocaleString()}
- Status: ${daysLabel}
- Milestone: ${milestone}

${toneInstruction}

Use the promoter's first name. Reference the specific show. Keep it under 100 words. No subject line — just the body. Sign off as Night Manoeuvres.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text?.trim()
  if (!text) throw new Error('Empty response from Claude')
  return text
}

function bodyToHtml(bodyText: string, subject: string): string {
  const lines = bodyText.split('\n').map((line: string) => {
    if (line.trim() === '') return '<br/>'
    return `<p style="margin:0 0 8px;line-height:1.6">${line}</p>`
  }).join('\n')

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;background:#050505;color:#f2f2f2;padding:40px;max-width:580px">
  <div style="color:#ff2a1a;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:24px">NIGHT MANOEUVRES — PAYMENT REMINDER</div>
  <div style="color:#f2f2f2;font-size:14px;line-height:1.7">
    ${lines}
  </div>
  <a href="https://signallabos.com/waitlist" style="display:inline-flex;align-items:center;gap:6px;margin-top:40px;padding-top:20px;border-top:1px solid #1d1d1d;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#909090;text-decoration:none"><svg width="12" height="12" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" stroke-width="1.5" opacity="0.4"/><polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#ff2a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>Powered by Signal Lab OS</a>
</div>`
}

async function handler() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: invoices, error } = await supabase
      .from('invoices')
      // NOTE: gigs has no promoter_name column — selecting it aborts the whole query.
      // Promoter name (if known) lives in gigs.notes or is derived from the email local-part.
      .select('*, gigs(promoter_email, title, venue, date)')
      .eq('status', 'pending')

    if (error) throw error
    if (!invoices?.length) return NextResponse.json({ drafts: 0, message: 'No pending invoices' })

    const results: string[] = []

    for (const invoice of invoices) {
      if (!invoice.due_date) continue

      const dueDate = new Date(invoice.due_date)
      dueDate.setHours(0, 0, 0, 0)
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)

      const milestone = getMilestone(daysUntilDue)
      if (!milestone) continue

      const gig = (invoice as any).gigs
      const promoterEmail = gig?.promoter_email
      if (!promoterEmail) {
        results.push(`Skipped ${invoice.gig_title}: no promoter email`)
        continue
      }

      // Check if draft already exists for this invoice + milestone
      const { data: existingDraft } = await supabase
        .from('invoice_reminder_drafts')
        .select('id')
        .eq('invoice_id', invoice.id)
        .eq('milestone', milestone)
        .in('status', ['draft', 'sent'])
        .single()

      if (existingDraft) {
        results.push(`Skipped ${invoice.gig_title} [${milestone}]: draft already exists`)
        continue
      }

      // Derive greeting name from email local-part: "archie@turbomgmt" → "Archie".
      // Skip generic inboxes (hello/info/bookings/team) → "there".
      const promoterFullName: string = (() => {
        const local = (promoterEmail as string).split('@')[0] || ''
        if (!local || /^(hello|info|bookings|team|accounts|finance|contact)$/i.test(local)) return ''
        return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase()
      })()
      const promoterFirstName = promoterFullName || 'there'

      const gigTitle: string = invoice.gig_title || gig?.title || 'your show'
      const venue: string = gig?.venue || ''
      const gigDate: string = gig?.date || invoice.due_date
      const amount: number = invoice.amount || 0
      const currency: string = invoice.currency || 'EUR'

      const subject =
        daysUntilDue > 0
          ? `Payment reminder — ${gigTitle} (due ${new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })})`
          : daysUntilDue === 0
          ? `Invoice due today — ${gigTitle}`
          : `Overdue invoice — ${gigTitle} (${Math.abs(daysUntilDue)} days overdue)`

      let bodyText: string
      try {
        bodyText = await generateChaseEmail({
          gigTitle,
          venue,
          gigDate,
          amount,
          currency,
          promoterName: promoterFirstName,
          daysUntilDue,
          milestone,
        })
      } catch (claudeErr: any) {
        bodyText = `Hi ${promoterFirstName},\n\nJust a reminder that the invoice for ${gigTitle} (${currency} ${amount.toLocaleString()}) is ${daysUntilDue === 0 ? 'due today' : daysUntilDue > 0 ? `due in ${daysUntilDue} days` : `${Math.abs(daysUntilDue)} days overdue`}.\n\nPlease arrange payment at your earliest convenience.\n\nNight Manoeuvres`
        results.push(`Claude fallback for ${invoice.gig_title}: ${claudeErr.message}`)
      }

      const bodyHtml = bodyToHtml(bodyText, subject)

      // Create draft — NOT send
      const { error: insertErr } = await supabase
        .from('invoice_reminder_drafts')
        .insert({
          invoice_id: invoice.id,
          gig_id: invoice.gig_id || null,
          milestone,
          promoter_email: promoterEmail,
          promoter_name: promoterFullName,
          subject,
          body_text: bodyText,
          body_html: bodyHtml,
          status: 'draft',
          generated_at: new Date().toISOString(),
        })

      if (insertErr) {
        results.push(`Failed to create draft for ${invoice.gig_title}: ${insertErr.message}`)
        continue
      }

      results.push(`Draft created [${milestone}] for ${promoterEmail}: ${subject}`)
    }

    // Notify the artist there are drafts to review
    const draftCount = results.filter(r => r.startsWith('Draft created')).length
    if (draftCount > 0) {
      await createNotification({
        type: 'invoice_overdue',
        title: `${draftCount} invoice reminder${draftCount > 1 ? 's' : ''} ready to review`,
        message: 'Review and approve before sending',
        href: '/finances',
      })
    }

    return NextResponse.json({
      success: true,
      drafts: draftCount,
      results,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
