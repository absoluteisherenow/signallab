import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST: Twilio inbound SMS webhook
// When artist replies YES to a briefing approval text
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const body = (form.get('Body') as string || '').trim().toUpperCase()
    const from = form.get('From') as string || ''

    // Verify sender is the artist
    const artistPhone = process.env.ARTIST_PHONE
    if (!artistPhone || !from.includes(artistPhone.replace(/^\+/, ''))) {
      // Respond with TwiML — unknown sender
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      )
    }

    if (body === 'YES' || body === 'Y') {
      // Find the most recent unsent briefing draft
      const { data: drafts } = await supabase
        .from('crew_briefing_drafts')
        .select('id, recipient_name, recipient_email, gig_id')
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(5)

      if (!drafts?.length) {
        return twimlResponse('No pending briefings to send.')
      }

      // Send all pending drafts for the nearest gig
      const gigId = drafts[0].gig_id
      const toSend = drafts.filter(d => d.gig_id === gigId)
      const sent: string[] = []

      for (const draft of toSend) {
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'
          await fetch(`${appUrl}/api/crew-briefing/${draft.id}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ via: 'sms' }),
          })
          sent.push(draft.recipient_name || draft.recipient_email)
        } catch {
          // Individual send failure
        }
      }

      if (sent.length > 0) {
        return twimlResponse(`Briefing sent to ${sent.join(', ')}`)
      } else {
        return twimlResponse('Failed to send briefings. Open the app to retry.')
      }
    } else if (body === 'NO' || body === 'N') {
      return twimlResponse('Briefing not sent. You can review and edit in the app.')
    } else {
      return twimlResponse('Reply YES to send the content briefing, or NO to skip.')
    }
  } catch (err: any) {
    console.error('Inbound SMS error:', err)
    return twimlResponse('Something went wrong. Open the app to send manually.')
  }
}

function twimlResponse(message: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}
