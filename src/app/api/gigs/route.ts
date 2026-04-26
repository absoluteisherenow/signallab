import { NextRequest, NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'
import { requireUser } from '@/lib/api-auth'

// All handlers below run as the signed-in user — RLS policies (user_owns_row_*)
// scope reads/writes to that user's rows. Service-role usage was removed so
// public signups can't see Anthony's data.

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { data, error } = await supabase
      .from('gigs')
      .select('*')
      .order('date', { ascending: true })
    if (error) throw error
    return NextResponse.json({ success: true, gigs: data || [] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, gigs: [] })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('gigs')
      .insert([{
        user_id: user.id,
        title: body.title,
        venue: body.venue,
        location: body.location,
        date: body.date,
        time: body.time,
        fee: parseInt(body.fee) || 0,
        currency: body.currency || 'EUR',
        audience: parseInt(body.audience) || 0,
        status: body.status || 'pending',
        promoter_email: body.promoter_email || null,
        notes: body.notes || null,
        ticket_url: body.ticket_url || null,
      }])
      .select()
    if (error) throw error
    const gig = data?.[0]
    if (gig) {
      await createNotification({
        type: 'gig_added',
        title: `New gig added — ${gig.title}`,
        message: `${gig.venue} · ${new Date(gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        href: `/gigs/${gig.id}`,
        gig_id: gig.id,
        user_id: user.id,
      })

      // Fire gig-to-content bridge for confirmed gigs (fire and forget — don't block)
      if (gig.status === 'confirmed') {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        fetch(`${appUrl}/api/agents/gig-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gigId: gig.id }),
        }).catch(async (error) => {
          await createNotification({ type: 'cron_error', title: 'Gig content generation failed', message: error instanceof Error ? error.message : 'Unknown error', user_id: user.id })
        })
      }

      // Auto-create invoice if fee is set (with duplicate check)
      if (gig.fee && gig.fee > 0) {
        const { data: existingInv } = await supabase
          .from('invoices')
          .select('id')
          .eq('gig_id', gig.id)
          .limit(1)

        if (!existingInv?.length) {
          const gigDate = new Date(gig.date)
          const dueDate = new Date(gigDate.getTime() + 30 * 86400000) // 30 days after gig
          const { data: newInvoice } = await supabase.from('invoices').insert([{
            user_id: user.id,
            gig_id: gig.id,
            gig_title: gig.title,
            amount: gig.fee,
            currency: gig.currency || 'EUR',
            type: 'full',
            status: 'pending',
            due_date: dueDate.toISOString().split('T')[0],
          }]).select()

          if (newInvoice?.[0]) {
            await createNotification({
              type: 'invoice_created',
              title: `Invoice created — ${gig.title}`,
              message: `Due ${dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
              href: `/api/invoices/${newInvoice[0].id}`,
              gig_id: gig.id,
              user_id: user.id,
            })
          }
        }
      }
    }
    return NextResponse.json({ success: true, gig })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const body = await req.json()
    const { id, ...updates } = body
    // Strip user_id from updates if a client tries to spoof it — RLS would
    // reject anyway, but be explicit.
    delete (updates as any).user_id
    const { data, error } = await supabase
      .from('gigs')
      .update(updates)
      .eq('id', id)
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, gig: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { id } = await req.json()
    const { error } = await supabase.from('gigs').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
