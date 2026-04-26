import { NextRequest, NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'
import { requireUser } from '@/lib/api-auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { data, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', params.id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ gig: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const body = await req.json()

    // Fetch current gig to detect changes
    const { data: current } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', params.id)
      .single()

    const { data, error } = await supabase
      .from('gigs')
      .update({
        title: body.title,
        venue: body.venue,
        location: body.location,
        date: body.date,
        time: body.time,
        fee: parseInt(body.fee) || 0,
        currency: body.currency || 'EUR',
        audience: parseInt(body.audience) || 0,
        status: body.status,
        promoter_email: body.promoter_email || null,
        promoter_phone: body.promoter_phone || null,
        al_name: body.al_name || null,
        al_phone: body.al_phone || null,
        al_email: body.al_email || null,
        driver_name: body.driver_name || null,
        driver_phone: body.driver_phone || null,
        driver_notes: body.driver_notes || null,
        notes: body.notes || null,
        ticket_url: body.ticket_url || null,
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fire notifications for significant changes
    if (current) {
      const title = data.title || current.title

      // Set time changed
      if (body.time && body.time !== current.time) {
        await createNotification({
          type: 'set_time_changed',
          title: `Set time changed — ${title}`,
          message: `${current.time} → ${body.time} at ${current.venue}`,
          href: `/gigs/${params.id}`,
          gig_id: params.id,
          metadata: { old_time: current.time, new_time: body.time },
          user_id: user.id,
        })
      }

      // Date changed
      if (body.date && body.date !== current.date) {
        await createNotification({
          type: 'set_time_changed',
          title: `Show date changed — ${title}`,
          message: `${new Date(current.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} → ${new Date(body.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
          href: `/gigs/${params.id}`,
          gig_id: params.id,
          metadata: { old_date: current.date, new_date: body.date },
          user_id: user.id,
        })
      }

      // Status changed to cancelled
      if (body.status === 'cancelled' && current.status !== 'cancelled') {
        await createNotification({
          type: 'gig_cancelled',
          title: `Show cancelled — ${title}`,
          message: `${current.venue} · ${new Date(current.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
          href: `/gigs/${params.id}`,
          gig_id: params.id,
          user_id: user.id,
        })
      }
    }

    return NextResponse.json({ gig: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { error } = await supabase.from('gigs').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
