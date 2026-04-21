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

    // If a specific gig was requested, also return gig details + rider + prefill data for the public advance form
    let gig = null
    let techRider = null
    let hospitalityRider = null
    let prefill: Record<string, string> = {}
    if (gigId) {
      const [gigRes, settingsRes, advanceRes, travelRes] = await Promise.all([
        supabase.from('gigs').select('title, venue, date, location, al_name, al_phone, driver_name, driver_phone, promoter_name, promoter_phone').eq('id', gigId).single(),
        supabase.from('artist_settings').select('tech_rider, hospitality_rider, tech_rider_presets, profile').single(),
        supabase.from('advance_requests').select('*').eq('gig_id', gigId).maybeSingle(),
        supabase.from('travel_bookings').select('*').eq('gig_id', gigId),
      ])
      gig = gigRes.data
      hospitalityRider = settingsRes.data?.hospitality_rider || null

      // Use the preset matching the rider_type stored on this advance, or fall back to default tech_rider
      const riderType = advanceRes?.data?.rider_type
      const presets = settingsRes.data?.tech_rider_presets as Record<string, string> | null
      if (riderType && presets && presets[riderType]) {
        techRider = presets[riderType]
      } else {
        techRider = settingsRes.data?.tech_rider || null
      }

      // Prefill: start from any previously-saved advance row, layer on gig contacts + travel
      const adv = advanceRes?.data as Record<string, any> | null
      if (adv) {
        const KEYS = [
          'local_contact_name','local_contact_phone','driver_name','driver_contact',
          'artist_liaison_name','artist_liaison_contact','videographer_name','videographer_contact',
          'sound_tech_name','sound_tech_contact','set_time','running_order','additional_notes',
          'hotel_name','hotel_address','hotel_checkin_date','hotel_checkin_time','hotel_reference',
          'transfer_driver_name','transfer_driver_phone','transfer_pickup_location','transfer_pickup_time',
        ]
        for (const k of KEYS) if (adv[k]) prefill[k] = String(adv[k])
      }
      const g = gig as Record<string, any> | null
      if (g) {
        if (!prefill.local_contact_name && (g.promoter_name || g.al_name)) prefill.local_contact_name = g.promoter_name || g.al_name
        if (!prefill.local_contact_phone && (g.promoter_phone || g.al_phone)) prefill.local_contact_phone = g.promoter_phone || g.al_phone
        if (!prefill.driver_name && g.driver_name) prefill.driver_name = g.driver_name
        if (!prefill.driver_contact && g.driver_phone) prefill.driver_contact = g.driver_phone
      }
      const travel = travelRes.data || []
      const hotel = travel.find((t: any) => t.type === 'hotel')
      if (hotel) {
        if (!prefill.hotel_name && hotel.name) prefill.hotel_name = hotel.name
        if (!prefill.hotel_address && hotel.from_location) prefill.hotel_address = hotel.from_location
        if (!prefill.hotel_checkin_date && hotel.check_in) prefill.hotel_checkin_date = String(hotel.check_in).slice(0, 10)
        if (!prefill.hotel_reference && hotel.reference) prefill.hotel_reference = hotel.reference
      }
      const transfer = travel.find((t: any) => t.source === 'advance' && (t.type === 'train' || t.type === 'transfer')) || travel.find((t: any) => t.type === 'transfer')
      if (transfer) {
        if (!prefill.transfer_driver_name && transfer.name) prefill.transfer_driver_name = transfer.name
        if (!prefill.transfer_pickup_time && transfer.departure_at) prefill.transfer_pickup_time = transfer.departure_at
      }
    }

    return NextResponse.json({ requests: data || [], gig, techRider, hospitalityRider, prefill })
  } catch (err: any) {
    if (err?.code === '42P01') return NextResponse.json({ requests: [], gig: null })
    return NextResponse.json({ error: err.message, requests: [], gig: null }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { gigId, gigTitle, venue, date, promoterEmail, riderType } = await req.json()
    if (!promoterEmail) return NextResponse.json({ error: 'No promoter email' }, { status: 400 })

    // Store rider type on the advance request so the form shows the right preset
    if (riderType) {
      await supabase.from('advance_requests').upsert({ gig_id: gigId, rider_type: riderType, completed: false }, { onConflict: 'gig_id' })
    }

    const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'}/advance/${gigId}`
    await resend.emails.send({
      from: 'NIGHT manoeuvres <onboarding@resend.dev>',
      to: promoterEmail,
      subject: `Advance sheet request — ${gigTitle} at ${venue}`,
      html: `<div style="font-family:monospace;background:#050505;color:#f2f2f2;padding:40px"><div style="color:#ff2a1a;margin-bottom:24px">NIGHT MANOEUVRES — ADVANCE REQUEST</div><h2>${gigTitle}</h2><p style="color:#909090">${venue} · ${date}</p><p>Please complete the advance form for this show.</p><a href="${formUrl}" style="display:inline-block;background:#ff2a1a;color:#050505;padding:14px 28px;text-decoration:none">Complete advance form</a><a href="https://signallabos.com/waitlist" style="display:inline-flex;align-items:center;gap:6px;margin-top:40px;padding-top:20px;border-top:1px solid #1d1d1d;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#909090;text-decoration:none"><svg width="12" height="12" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" stroke-width="1.5" opacity="0.4"/><polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#ff2a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>Powered by Signal Lab OS</a></div>`,
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
            check_in: data.hotel_checkin_date || null,
            reference: data.hotel_reference || null,
            source: 'advance',
          }])
        }
      }

      // Cross-populate transfer into travel_bookings
      if (data.transfer_driver_name) {
        const existingTransfer = await supabase
          .from('travel_bookings')
          .select('id')
          .eq('gig_id', data.gig_id)
          .eq('type', 'train')
          .eq('source', 'advance')
          .maybeSingle()
        if (!existingTransfer.data) {
          await supabase.from('travel_bookings').insert([{
            gig_id: data.gig_id,
            type: 'train',
            name: data.transfer_driver_name,
            notes: `Phone: ${data.transfer_driver_phone || ''}. Pickup: ${data.transfer_pickup_location || ''}`,
            departure_at: data.transfer_pickup_time ? new Date(data.transfer_pickup_time).toISOString() : null,
            source: 'advance',
          }])
        }

        // Cross-populate driver details to gig
        const driverUpdate: Record<string, string> = {}
        if (data.transfer_driver_name) driverUpdate.driver_name = data.transfer_driver_name
        if (data.transfer_driver_phone) driverUpdate.driver_phone = data.transfer_driver_phone
        if (Object.keys(driverUpdate).length > 0) {
          await supabase.from('gigs').update(driverUpdate).eq('id', data.gig_id)
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
