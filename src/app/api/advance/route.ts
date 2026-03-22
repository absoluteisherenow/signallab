import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabase } from '@/lib/supabase'

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
      html: `<div style="font-family:monospace;background:#070706;color:#f0ebe2;padding:40px"><div style="color:#b08d57;margin-bottom:24px">NIGHT MANOEUVRES — ADVANCE REQUEST</div><h2>${gigTitle}</h2><p style="color:#8a8780">${venue} · ${date}</p><p>Please complete the advance form for this show.</p><a href="${formUrl}" style="display:inline-block;background:#b08d57;color:#070706;padding:14px 28px;text-decoration:none">Complete advance form</a></div>`,
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
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
