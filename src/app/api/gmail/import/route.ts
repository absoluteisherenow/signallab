import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Finding = {
  messageId: string
  type: string
  extracted: any
  gig_id: string | null
  from?: string
}

async function importFinding(finding: Finding): Promise<string | null> {
  const { type, extracted, gig_id, from: fromEmail } = finding

  switch (type) {
    case 'new_gig': {
      if (!extracted.title && !extracted.venue) return null
      const { data } = await supabase.from('gigs').insert([{
        title: extracted.title || `Show @ ${extracted.venue}`,
        venue: extracted.venue || '',
        location: extracted.location || '',
        date: extracted.date || null,
        time: extracted.time || '22:00',
        fee: extracted.fee || 0,
        currency: extracted.currency || 'EUR',
        status: 'confirmed',
        promoter_email: extracted.promoter_email || fromEmail || '',
        promoter_name: extracted.promoter_name || '',
        notes: extracted.notes || '',
        created_at: new Date().toISOString(),
      }]).select()
      return data?.[0]?.id ? 'gig' : null
    }

    case 'hotel':
    case 'flight':
    case 'train': {
      const booking: Record<string, unknown> = {
        gig_id: gig_id || null,
        type,
        name: extracted.name || null,
        reference: extracted.reference || null,
        cost: extracted.cost || null,
        currency: extracted.currency || 'EUR',
        source: 'gmail',
        created_at: new Date().toISOString(),
      }
      if (type === 'hotel') {
        booking.check_in = extracted.check_in || null
        booking.check_out = extracted.check_out || null
      } else {
        booking.from_location = extracted.from || null
        booking.to_location = extracted.to || null
        booking.departure_at = extracted.departure_at || null
        booking.arrival_at = extracted.arrival_at || null
        if (type === 'flight') booking.flight_number = extracted.flight_number || null
      }
      await supabase.from('travel_bookings').insert([booking])
      if (extracted.cost) {
        const label = type === 'hotel'
          ? `Hotel: ${extracted.name || 'accommodation'}`
          : `${type === 'flight' ? 'Flight' : 'Train'}: ${extracted.from || ''} → ${extracted.to || ''}`
        await supabase.from('expenses').insert([{
          date: (type === 'hotel' ? extracted.check_in : extracted.departure_at?.slice(0, 10)) || new Date().toISOString().slice(0, 10),
          description: label,
          category: type === 'hotel' ? 'Accommodation' : 'Travel',
          amount: extracted.cost,
          currency: extracted.currency || 'EUR',
          notes: extracted.reference ? `Ref: ${extracted.reference}` : null,
        }])
      }
      return type
    }

    case 'rider':
    case 'tech_spec': {
      if (!gig_id) return null
      const field = type === 'rider' ? 'rider_notes' : 'tech_notes'
      await supabase.from('gigs').update({
        [field]: extracted.details || '',
        updated_at: new Date().toISOString(),
      }).eq('id', gig_id)
      return type
    }

    case 'invoice': {
      const { data: gig } = gig_id
        ? await supabase.from('gigs').select('title').eq('id', gig_id).single()
        : { data: null }
      await supabase.from('invoices').insert([{
        gig_id: gig_id || null,
        gig_title: gig?.title || extracted.gig_title || extracted.description || 'Email import',
        amount: extracted.amount || 0,
        currency: extracted.currency || 'EUR',
        type: extracted.type || 'full',
        status: 'pending',
        due_date: extracted.due_date || null,
      }])
      return 'invoice'
    }

    case 'release': {
      if (!extracted.title) return null
      await supabase.from('releases').insert([{
        title: extracted.title,
        type: extracted.type || 'single',
        release_date: extracted.release_date || null,
        label: extracted.label || null,
        streaming_url: extracted.streaming_url || null,
        notes: extracted.notes || null,
        source: 'gmail',
        created_at: new Date().toISOString(),
      }])
      return 'release'
    }

    case 'gig_update': {
      if (!gig_id) return null
      const { data: gig } = await supabase.from('gigs').select('notes').eq('id', gig_id).single()
      const existingNotes = gig?.notes || ''
      await supabase.from('gigs').update({
        notes: existingNotes ? `${existingNotes}\n\n${extracted.update}` : extracted.update,
        updated_at: new Date().toISOString(),
      }).eq('id', gig_id)
      return 'gig_update'
    }

    default:
      return null
  }
}

// POST /api/gmail/import — create records from user-confirmed email findings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const findings: Finding[] = body.findings || []

    if (findings.length === 0) {
      return NextResponse.json({ ok: true, created: [] })
    }

    const created: string[] = []
    const messageIds: string[] = []

    for (const finding of findings) {
      try {
        const result = await importFinding(finding)
        if (result) created.push(result)
        messageIds.push(finding.messageId)
      } catch {
        // Continue with remaining findings
      }
    }

    // Mark all as processed so they're not re-scanned
    if (messageIds.length > 0) {
      await supabase
        .from('processed_gmail_ids')
        .upsert(
          messageIds.map(id => ({ message_id: id, processed_at: new Date().toISOString() })),
          { onConflict: 'message_id', ignoreDuplicates: true }
        )
    }

    return NextResponse.json({ ok: true, created })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
