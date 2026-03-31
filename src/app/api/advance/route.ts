import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabase } from '@/lib/supabase'
import { createNotification } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const gigId = searchParams.get('gigId')

    let query = supabase.from('advance_requests').select('*')
    if (gigId) query = query.eq('gig_id', gigId)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ requests: data || [] })
  } catch (err: any) {
    if (err?.code === '42P01') return NextResponse.json({ requests: [] })
    return NextResponse.json({ error: err.message, requests: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { gigId, gigTitle, venue, date, promoterEmail } = await req.json()
    if (!promoterEmail) return NextResponse.json({ error: 'No promoter email' }, { status: 400 })

    const formUrl = `https://signal-lab-rebuild.vercel.app/advance/${gigId}`
    await resend.emails.send({
      from: 'NIGHT manoeuvres <onboarding@resend.dev>',
      to: promoterEmail,
      subject: `Advance sheet request — ${gigTitle} at ${venue}`,
      html: `<div style="font-family:monospace;background:#070706;color:#f0ebe2;padding:40px"><div style="color:#b08d57;margin-bottom:24px">NIGHT MANOEUVRES — ADVANCE REQUEST</div><h2>${gigTitle}</h2><p style="color:#8a8780">${venue} · ${date}</p><p>Please complete the advance form for this show.</p><a href="${formUrl}" style="display:inline-block;background:#b08d57;color:#070706;padding:14px 28px;text-decoration:none">Complete advance form</a><div style="margin-top:40px;padding-top:20px;border-top:1px solid #1a1917;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#52504c">Signal Lab OS &middot; Tailored Artist OS &middot; signallabos.com</div></div>`,
    })

    // Create in-app notification
    await createNotification({
      type: 'advance_sent',
      title: `Advance sent — ${gigTitle}`,
      message: `Request sent to ${promoterEmail}`,
      href: `/gigs/${gigId}`,
      gig_id: gigId,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    await supabase.from('advance_requests').upsert({ ...data, completed: true }, { onConflict: 'gig_id' })

    // Fetch gig title for the notification
    let gigTitle = 'Unknown show'
    if (data.gig_id) {
      const { data: gig } = await supabase.from('gigs').select('title, venue').eq('id', data.gig_id).single()
      if (gig) gigTitle = `${gig.title} at ${gig.venue}`
    }

    await createNotification({
      type: 'advance_received',
      title: `Advance received — ${gigTitle}`,
      message: 'Promoter has completed the advance form.',
      href: `/advance/${data.gig_id}`,
      gig_id: data.gig_id,
      sendEmail: true,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
