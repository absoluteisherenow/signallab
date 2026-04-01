import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Called by Vercel cron daily at 9am
// Also callable manually via POST /api/invoices/reminders

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
  const apiKey = process.env.ANTHROPIC_API_KEY
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
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text?.trim()
  if (!text) throw new Error('Empty response from Claude')
  return text
}

async function handler() {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, gigs(promoter_email, promoter_name, title, venue, date)')
      .eq('status', 'pending')

    if (error) throw error
    if (!invoices?.length) return NextResponse.json({ sent: 0, message: 'No pending invoices' })

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

      // Derive promoter first name — fall back to "there" if not stored
      const promoterFullName: string = gig?.promoter_name || ''
      const promoterFirstName = promoterFullName.split(' ')[0] || 'there'

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

      let body: string
      try {
        body = await generateChaseEmail({
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
        // Fall back to plain text if Claude fails — don't skip the reminder
        body = `Hi ${promoterFirstName},\n\nJust a reminder that the invoice for ${gigTitle} (${currency} ${amount.toLocaleString()}) is ${daysUntilDue === 0 ? 'due today' : daysUntilDue > 0 ? `due in ${daysUntilDue} days` : `${Math.abs(daysUntilDue)} days overdue`}.\n\nPlease arrange payment at your earliest convenience.\n\nNight Manoeuvres`
        results.push(`Claude fallback for ${invoice.gig_title}: ${claudeErr.message}`)
      }

      try {
        await resend.emails.send({
          from: 'bookings@nightmanoeuvres.com',
          to: promoterEmail,
          subject,
          text: body,
        })
        results.push(`Sent [${milestone}] to ${promoterEmail}: ${subject}`)
      } catch (emailErr: any) {
        results.push(`Failed to send to ${promoterEmail}: ${emailErr.message}`)
      }
    }

    // Save reminder log to Supabase
    if (results.length > 0) {
      await supabase.from('reminder_log').insert(
        results.map(r => ({ message: r, sent_at: new Date().toISOString() }))
      )
    }

    return NextResponse.json({
      success: true,
      sent: results.length,
      reminders: results,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
