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

    // If a specific gig was requested, also return gig details + rider for the public advance form
    let gig = null
    let techRider = null
    let hospitalityRider = null
    if (gigId) {
      const [gigRes, settingsRes] = await Promise.all([
        supabase.from('gigs').select('title, venue, date, location').eq('id', gigId).single(),
        supabase.from('artist_settings').select('tech_rider, hospitality_rider, profile').single(),
      ])
      gig = gigRes.data
      techRider = settingsRes.data?.tech_rider || null
      hospitalityRider = settingsRes.data?.hospitality_rider || null
    }

    return NextResponse.json({ requests: data || [], gig, techRider, hospitalityRider })
  } catch (err: any) {
    if (err?.code === '42P01') return NextResponse.json({ requests: [], gig: null })
    return NextResponse.json({ error: err.message, requests: [], gig: null }, { status: 500 })
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

    // Cross-populate gig contacts from advance data
    if (data.gig_id) {
      const contactUpdate: Record<string, string> = {}
      if (data.local_contact_name) contactUpdate.al_name = data.local_contact_name
      if (data.local_contact_phone) contactUpdate.al_phone = data.local_contact_phone
      if (Object.keys(contactUpdate).length > 0) {
        await supabase.from('gigs').update(contactUpdate).eq('id', data.gig_id)
      }

      // Cross-populate hotel into travel_bookings
      if (data.hotel_name) {
        const existing = await supabase
          .from('travel_bookings')
          .select('id')
          .eq('gig_id', data.gig_id)
          .eq('type', 'hotel')
          .eq('source', 'advance')
          .maybeSingle()
        if (!existing.data) {
          await supabase.from('travel_bookings').insert([{
            gig_id: data.gig_id,
            type: 'hotel',
            name: data.hotel_name,
            from_location: data.hotel_address || null,
            check_in: data.hotel_checkin || null,
            source: 'advance',
          }])
        }
      }
    }

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
