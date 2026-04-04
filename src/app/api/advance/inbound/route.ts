import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createNotification } from '@/lib/notifications'

// Webhook endpoint for Resend inbound emails (promoter replies to advance requests)
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()

    // Resend inbound webhook payload
    const from = payload.from || payload.sender || ''
    const subject = payload.subject || ''
    const textBody = payload.text || payload.plain || payload.body || ''
    const htmlBody = payload.html || ''

    if (!textBody && !htmlBody) {
      return NextResponse.json({ error: 'No email content' }, { status: 400 })
    }

    // Extract the sender email address
    const emailMatch = from.match?.(/<([^>]+)>/) || [null, from]
    const senderEmail = (emailMatch[1] || from).toLowerCase().trim()

    // Find the matching advance_request by promoter email
    const { data: advanceRecord, error: lookupError } = await supabase
      .from('advance_requests')
      .select('*, gigs!inner(id, title, venue, date)')
      .eq('promoter_email', senderEmail)
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      console.error('Advance inbound lookup error:', lookupError)
    }

    // Use plain text for extraction, fall back to stripping HTML
    const contentForExtraction = textBody || htmlBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

    // Call Claude to extract structured data from the freeform reply
    const extractionPrompt = `Extract advance/show details from this promoter's email reply. Return valid JSON only — no markdown fences, no extra text.

The JSON should have these keys (use null for any field not mentioned):
{
  "load_in_time": "string or null",
  "soundcheck_time": "string or null",
  "doors_time": "string or null",
  "set_time": "string or null",
  "set_length": "string or null",
  "parking": "string or null",
  "wifi_name": "string or null",
  "wifi_password": "string or null",
  "dressing_room": "string or null",
  "hospitality": "string or null",
  "hotel_name": "string or null",
  "hotel_address": "string or null",
  "hotel_checkin": "string or null",
  "local_contact_name": "string or null",
  "local_contact_phone": "string or null",
  "backline": "string or null",
  "additional_notes": "string or null"
}

Email reply:
${contentForExtraction}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: extractionPrompt },
        ],
        system: 'You extract structured data from emails. Output raw JSON only. No markdown code fences. Be precise — only include information explicitly stated in the email.',
      }),
    })

    let extracted: Record<string, string | null> = {}

    if (response.ok) {
      const result = await response.json()
      const text = result.content?.[0]?.text || ''
      try {
        extracted = JSON.parse(text)
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0])
        }
      }
    } else {
      console.error('Claude extraction failed:', response.status, await response.text())
    }

    // Build the update payload — only include non-null extracted fields
    const updateData: Record<string, any> = {
      completed: true,
      status: 'replied',
      raw_reply: contentForExtraction.slice(0, 10000),
    }

    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && value !== '') {
        updateData[key] = value
      }
    }

    // Determine which gig this belongs to
    const gigId = advanceRecord?.gig_id
    const gigTitle = advanceRecord?.gigs?.title
      ? `${advanceRecord.gigs.title} at ${advanceRecord.gigs.venue}`
      : subject || 'Unknown show'

    if (gigId) {
      // Upsert the advance request with extracted data
      await supabase.from('advance_requests').upsert(
        { gig_id: gigId, promoter_email: senderEmail, ...updateData },
        { onConflict: 'gig_id' }
      )

      // Cross-populate gig contacts
      const contactUpdate: Record<string, string> = {}
      if (extracted.local_contact_name) contactUpdate.al_name = extracted.local_contact_name
      if (extracted.local_contact_phone) contactUpdate.al_phone = extracted.local_contact_phone
      if (Object.keys(contactUpdate).length > 0) {
        await supabase.from('gigs').update(contactUpdate).eq('id', gigId)
      }

      // Cross-populate hotel into travel_bookings
      if (extracted.hotel_name) {
        const existing = await supabase
          .from('travel_bookings')
          .select('id')
          .eq('gig_id', gigId)
          .eq('type', 'hotel')
          .eq('source', 'advance')
          .maybeSingle()

        if (!existing.data) {
          await supabase.from('travel_bookings').insert([{
            gig_id: gigId,
            type: 'hotel',
            name: extracted.hotel_name,
            from_location: extracted.hotel_address || null,
            check_in: extracted.hotel_checkin || null,
            source: 'advance',
          }])
        }
      }

      // Notify the artist
      await createNotification({
        type: 'advance_received',
        title: `Advance reply received — ${gigTitle}`,
        message: `${senderEmail} replied with show details`,
        href: `/advance/${gigId}`,
        gig_id: gigId,
        sendEmail: true,
      })
    } else {
      // No matching advance request found — still notify
      await createNotification({
        type: 'advance_received',
        title: `Advance reply received — unmatched`,
        message: `Reply from ${senderEmail} — could not match to a gig. Subject: ${subject}`,
        href: '/gigs',
      })
    }

    return NextResponse.json({ success: true, gigId: gigId || null })
  } catch (err: any) {
    console.error('Advance inbound error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
