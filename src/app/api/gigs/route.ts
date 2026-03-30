import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
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
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('gigs')
      .insert([{
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
      })

      // Auto-create invoice if fee is set
      if (gig.fee && gig.fee > 0) {
        const gigDate = new Date(gig.date)
        const dueDate = new Date(gigDate.getTime() + 30 * 86400000) // 30 days after gig
        await supabase.from('invoices').insert([{
          gig_id: gig.id,
          gig_title: gig.title,
          amount: gig.fee,
          currency: gig.currency || 'EUR',
          type: 'full',
          status: 'pending',
          due_date: dueDate.toISOString().split('T')[0],
        }])
      }
    }
    return NextResponse.json({ success: true, gig })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
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
  try {
    const { id } = await req.json()
    const { error } = await supabase.from('gigs').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
