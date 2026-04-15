import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cron: daily at 11:00
// Finds confirmed gigs with a fee but no linked invoice → auto-creates them
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all gigs with a fee > 0 that aren't cancelled
    const { data: gigs, error: gigsError } = await supabase
      .from('gigs')
      .select('id, title, fee, currency, date, promoter_email')
      .gt('fee', 0)
      .neq('status', 'cancelled')

    if (gigsError) throw gigsError
    if (!gigs?.length) return NextResponse.json({ ran: true, created: 0 })

    // Get all existing invoice gig_ids to avoid duplicates
    const { data: existingInvoices, error: invError } = await supabase
      .from('invoices')
      .select('gig_id')

    if (invError) throw invError

    const invoicedGigIds = new Set((existingInvoices || []).map(i => i.gig_id).filter(Boolean))

    // Find gigs without invoices
    const missing = gigs.filter(g => !invoicedGigIds.has(g.id))
    if (!missing.length) return NextResponse.json({ ran: true, created: 0 })

    let created = 0

    for (const gig of missing) {
      const gigDate = new Date(gig.date)
      const dueDate = new Date(gigDate.getTime() + 30 * 86400000)

      const { data: newInvoice, error: insertError } = await supabase.from('invoices').insert([{
        gig_id: gig.id,
        gig_title: gig.title,
        amount: gig.fee,
        currency: gig.currency || 'EUR',
        type: 'full',
        status: 'pending',
        due_date: dueDate.toISOString().split('T')[0],
      }]).select()

      if (insertError) {
        console.error(`Failed to create invoice for gig ${gig.id}:`, insertError.message)
        continue
      }

      created++

      if (newInvoice?.[0]) {
        await createNotification({
          type: 'invoice_created',
          title: `Invoice created — ${gig.title}`,
          message: `Due ${dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
          href: `/api/invoices/${newInvoice[0].id}`,
          gig_id: gig.id,
        })
      }
    }

    return NextResponse.json({ ran: true, created, checked: gigs.length })
  } catch (err: any) {
    console.error('Invoice backfill error:', err.message)
    await createNotification({ type: 'cron_error', title: 'Invoice backfill failed', message: err instanceof Error ? err.message : 'Unknown error' })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
