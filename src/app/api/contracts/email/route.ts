import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { callClaude } from '@/lib/callClaude'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Lazy initialize Resend to avoid errors at build time if API key is missing
let resend: Resend | null = null
function getResend() {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) return null
    resend = new Resend(process.env.RESEND_API_KEY)
  }
  return resend
}

// Direct POST shape (manual / legacy)
interface EmailPayload {
  from: string
  to: string | string[]
  subject: string
  text?: string
  html?: string
  attachments?: Array<{
    filename: string
    content: string
    contentType?: string
    content_type?: string
  }>
}

// Resend inbound webhook shape: { type: "email.received", data: { ... } }
interface ResendInboundEvent {
  type: string
  created_at?: string
  data: EmailPayload
}

async function extractContractWithClaude(
  emailBody: string,
  attachmentTexts: string[]
): Promise<{
  title: string
  venue: string
  location: string
  date: string
  time: string
  fee: number
  currency: string
  promoterEmail: string
  promoterName: string
  notes: string
  techRider: string | null
  hospitalityRider: string | null
}> {
  const combinedText = [emailBody, ...attachmentTexts].join('\n\n')

  // Inbound webhook has no user context — the email arrives at a shared intake
  // address before we know which tenant it belongs to. Routes via the base
  // callClaude wrapper (userId=null) so api_usage still logs the cost; the
  // extraction is pure structural parsing, no voice/rules involvement.
  // TODO: once we wire user routing on inbound (To: → artist_profiles alias),
  // lift this into callClaudeWithBrain with the resolved tenant.
  const response = await callClaude({
    userId: null,
    feature: 'contracts_email_extract',
    model: 'claude-sonnet-4-6',
    max_tokens: 1400,
    system: `You are a contract parser for a music artist. Extract all gig and rider details from booking emails and attachments. Return ONLY valid JSON (no markdown or explanation). If a field is missing, use null. Date format: YYYY-MM-DD. Time format: HH:MM (24h). Fee as number.

For techRider: extract the technical setup being provided by the venue — DJ equipment (CDJ model, mixer model), PA system, booth dimensions, monitor setup, soundcheck time. Write as concise bullet-point lines joined with newlines.
For hospitalityRider: extract what the promoter is providing — hotel nights, catering, transport/airport pickup, green room, guest list allocation. Write as concise bullet-point lines joined with newlines.
If no rider info is present, use null.

Return:
{
  "title": "event/festival name",
  "venue": "venue name",
  "location": "city, country",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "fee": number,
  "currency": "EUR" or "GBP" or "USD",
  "promoterEmail": "email",
  "promoterName": "name",
  "notes": "any other requirements not covered by riders",
  "techRider": "line 1\nline 2\nline 3" or null,
  "hospitalityRider": "line 1\nline 2\nline 3" or null
}`,
    messages: [
      {
        role: 'user',
        content: `Extract gig details from this contract:\n\n${combinedText}`,
      },
    ],
  })

  if (!response.ok) {
    throw new Error(`Claude error: ${response.data?.error?.message || 'Unknown error'}`)
  }

  const content = response.text || '{}'
  return JSON.parse(content.replace(/```json|```/g, '').trim())
}

async function convertPdfToText(base64Content: string): Promise<string> {
  // Simple PDF text extraction via Claude (fallback for attachments)
  // In production, use pdfjs or similar, but Claude can parse base64 PDFs
  try {
    // For now, return a placeholder — real impl would extract PDF text
    return '[PDF content — base64 encoded, would extract with pdfjs in production]'
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json()

    // Normalise: Resend wraps inbound emails in { type: "email.received", data: {...} }
    const body: EmailPayload = (raw as ResendInboundEvent).data ?? (raw as EmailPayload)

    // Extract text from email
    const emailText = body.text || body.html || ''
    if (!emailText) {
      return NextResponse.json(
        { success: false, error: 'No email body found' },
        { status: 400 }
      )
    }

    // Process attachments (PDFs, images, etc.)
    const attachmentTexts: string[] = []
    if (body.attachments && body.attachments.length > 0) {
      for (const attachment of body.attachments) {
        const mimeType = attachment.contentType || attachment.content_type || ''
        if (
          attachment.filename.toLowerCase().endsWith('.pdf') ||
          mimeType.includes('pdf')
        ) {
          const text = await convertPdfToText(attachment.content)
          if (text) attachmentTexts.push(`[${attachment.filename}]\n${text}`)
        } else if (mimeType.includes('text')) {
          attachmentTexts.push(`[${attachment.filename}]\n${attachment.content}`)
        }
      }
    }

    // Extract gig details using Claude
    const gigDetails = await extractContractWithClaude(emailText, attachmentTexts)

    // Validate extracted data — title falls back to venue if missing
    if (!gigDetails.venue && !gigDetails.date) {
      return NextResponse.json(
        {
          success: false,
          error: 'Could not extract required fields (venue, date)',
          extracted: gigDetails,
        },
        { status: 400 }
      )
    }
    if (!gigDetails.title) gigDetails.title = gigDetails.venue || 'Untitled Gig'

    // Build notes with rider sections if extracted
    const notesParts: string[] = []
    if (gigDetails.promoterName) notesParts.push(`Promoter: ${gigDetails.promoterName}`)
    if (gigDetails.notes) notesParts.push(gigDetails.notes)

    const hasRider = gigDetails.techRider || gigDetails.hospitalityRider
    if (hasRider) {
      notesParts.push('')
      if (gigDetails.techRider) {
        notesParts.push(`TECH RIDER:\n${gigDetails.techRider}`)
      }
      if (gigDetails.hospitalityRider) {
        notesParts.push(`HOSPITALITY:\n${gigDetails.hospitalityRider}`)
      }
      notesParts.push('RIDER STATUS: needs confirmation')
    }

    const { data: newGig, error: gigError } = await supabase
      .from('gigs')
      .insert([
        {
          title: gigDetails.title,
          venue: gigDetails.venue,
          location: gigDetails.location,
          date: gigDetails.date,
          time: gigDetails.time || '22:00',
          fee: gigDetails.fee || 0,
          currency: gigDetails.currency || 'EUR',
          status: 'confirmed',
          promoter_email: gigDetails.promoterEmail,
          notes: notesParts.filter(Boolean).join('\n'),
          created_at: new Date().toISOString(),
        },
      ])
      .select()

    if (gigError) throw gigError

    const gig = newGig?.[0]

    // Fire rider confirmation notification if rider data was extracted
    if (gig && hasRider) {
      await supabase.from('notifications').insert([{
        type: 'rider_confirmation',
        title: `Rider details found — ${gig.title}`,
        message: `Tech and/or hospitality rider extracted from booking email. Review and confirm before the advance.`,
        href: `/gigs/${gig.id}`,
        read: false,
        gig_id: gig.id,
        created_at: new Date().toISOString(),
      }])
    }

    // Send artist notification email
    if (gig) {
      const gigDate = new Date(gig.date).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

      const notificationEmail = `
Hi,

Your gig is confirmed!

📍 ${gig.venue}, ${gig.location}
📅 ${gigDate}
🕘 ${gig.time || 'TBA'}
💰 ${gig.currency}${gig.fee?.toLocaleString()}

Promoter: ${gig.promoter_name || 'TBA'}
Contact: ${gig.promoter_email || 'TBA'}

${gig.notes ? `Notes: ${gig.notes}` : ''}

Log in to Signal Lab OS to view full details, upload contracts, and send advance requests.

NIGHT manoeuvres
Signal Lab OS — signallabos.com
      `.trim()

      // In-app notification only — no auto-send email (approve before send)
      try {
        const { createNotification } = await import('@/lib/notifications')
        await createNotification({
          type: 'system',
          title: `New gig confirmed: ${gig.title}`,
          message: `${gig.venue} · ${gigDate}`,
          href: `/gigs/${gig.id}`,
          gig_id: gig.id,
        })
      } catch {
        // Notification failure is non-critical
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Contract processed and gig created',
      gig: {
        id: gig?.id,
        title: gig?.title,
        venue: gig?.venue,
        date: gig?.date,
        fee: gig?.fee,
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to process contract email',
      },
      { status: 500 }
    )
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Contract email webhook ready',
    endpoint: 'POST /api/contracts/email',
  })
}
