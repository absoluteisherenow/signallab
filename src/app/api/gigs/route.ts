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
        artwork_url: body.artwork_url || null,
        ra_url: body.ra_url || null,
      }])
      .select()
    if (error) throw error
    const gig = data?.[0]
    if (gig) {
      const gigId = gig.id

      // --- GIG CREATION CASCADE ---
      // Run these in the background — don't block the response

      // Check if this is the user's first gig
      let isFirstGig = false
      try {
        const { count } = await supabase
          .from('gigs')
          .select('id', { count: 'exact', head: true })
        isFirstGig = (count || 0) <= 1
      } catch {}

      // 1. Auto-create advance request in draft status
      try {
        await supabase.from('advance_requests').upsert(
          { gig_id: gigId, completed: false, status: 'draft' },
          { onConflict: 'gig_id' }
        )
      } catch {}

      // 2. Auto-generate 3 content posts (pre-show, day-of, post-show)
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        fetch(`${appUrl}/api/agents/gig-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gigId,
            title: gig.title,
            venue: gig.venue,
            date: gig.date,
            location: gig.location,
          }),
        }).catch(() => {}) // Fire and forget
      } catch {}

      // 3. Create notification
      try {
        if (isFirstGig) {
          await createNotification({
            type: 'gig_added',
            title: `First gig added — ${gig.title}`,
            message: `Advance form, 3 content drafts, and night-before briefing are ready. You're set.`,
            href: `/gigs/${gigId}`,
            gig_id: gigId,
          })
        } else {
          await createNotification({
            type: 'gig_added',
            title: `Gig added — ${gig.title}`,
            message: `${gig.venue}, ${gig.location}. Advance form created, content drafts generating.`,
            href: `/gigs/${gigId}`,
            gig_id: gigId,
          })
        }
      } catch {}

      // 4. Auto-create invoice if fee is set
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
    return NextResponse.json({
      success: true,
      gig,
      cascade: { advance: true, content: true, notification: true },
    })
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
