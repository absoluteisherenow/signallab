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

async function handler() {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, gigs(promoter_email, title, venue)')
      .eq('status', 'pending')

    if (error) throw error
    if (!invoices?.length) return NextResponse.json({ sent: 0, message: 'No pending invoices' })

    const results: string[] = []

    for (const invoice of invoices) {
      if (!invoice.due_date) continue

      const dueDate = new Date(invoice.due_date)
      dueDate.setHours(0, 0, 0, 0)
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)

      // Reminder thresholds: 7 days before, due today, 3 days overdue, 14 days overdue
      const shouldSend = [7, 0, -3, -14].includes(daysUntilDue)
      if (!shouldSend) continue

      const subject = daysUntilDue > 0
        ? `Payment reminder — ${invoice.gig_title} (due ${new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })})`
        : daysUntilDue === 0
        ? `Invoice due today — ${invoice.gig_title}`
        : `Overdue invoice — ${invoice.gig_title} (${Math.abs(daysUntilDue)} days overdue)`

      const body = daysUntilDue >= 0
        ? `
Hi,

This is a reminder that the following invoice is ${daysUntilDue === 0 ? 'due today' : `due in ${daysUntilDue} days`}.

Show: ${invoice.gig_title}
Amount: ${invoice.currency} ${invoice.amount?.toLocaleString()}
Type: ${invoice.type}
Due: ${new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

Please arrange payment at your earliest convenience.

Night Manoeuvres
        `
        : `
Hi,

The following invoice is now ${Math.abs(daysUntilDue)} days overdue.

Show: ${invoice.gig_title}
Amount: ${invoice.currency} ${invoice.amount?.toLocaleString()}
Type: ${invoice.type}
Was due: ${new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

Please arrange payment immediately or get in touch to discuss.

Night Manoeuvres
        `

      // Get promoter email from linked gig
      const gig = (invoice as any).gigs
      const promoterEmail = gig?.promoter_email
      
      if (promoterEmail) {
        try {
          await resend.emails.send({
            from: 'bookings@nightmanoeuvres.com',
            to: promoterEmail,
            subject,
            text: body,
          })
          results.push(`Sent to ${promoterEmail}: ${subject}`)
        } catch (emailErr: any) {
          results.push(`Failed to send to ${promoterEmail}: ${emailErr.message}`)
        }
      } else {
        results.push(`Skipped ${invoice.gig_title}: no promoter email`)
      }
    }

    // Save reminder log to Supabase
    if (results.length > 0) {
      await supabase.from('reminder_log').insert(
        results.map(r => ({ message: r, sent_at: new Date().toISOString() }))
      ); // log saved
    }

    return NextResponse.json({
      success: true,
      sent: results.length,
      reminders: results
    })

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
