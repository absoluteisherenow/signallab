import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Lazy initialize Resend to avoid errors at build time if API key is missing
let resend: Resend | null = null
function getResend() {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY not configured. Email notifications will be skipped.')
      return null
    }
    resend = new Resend(process.env.RESEND_API_KEY)
  }
  return resend
}

interface EmailPayload {
  from: string
  to: string
  subject: string
  text?: string
  html?: string
  attachments?: Array<{
    filename: string
    content: string
    contentType: string
  }>
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
}> {
  const combinedText = [emailBody, ...attachmentTexts].join('\n\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: `You are a contract parser. Extract gig details from contract emails and attachments. Return ONLY valid JSON (no markdown or explanation). If a field is missing, use null. Date format: YYYY-MM-DD. Time format: HH:MM (24h). Fee as number. Return:
{
  "title": "event/festival name",
  "venue": "venue name",
  "location": "city, country",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "fee": number,
  "currency": "EUR" or "GBP" or "USD",
  "promoterEmail": "promoter@example.com",
  "promoterName": "Promoter Name",
  "notes": "any special requirements or details"
}`,
      messages: [
        {
          role: 'user',
          content: `Extract gig details from this contract:\n\n${combinedText}`,
        },
      ],
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Claude error: ${data.error?.message || 'Unknown error'}`)
  }

  const content = data.content?.[0]?.text || '{}'
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
    const body: EmailPayload = await req.json()

    console.log('📧 Contract email received from:', body.from)
    console.log('Subject:', body.subject)

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
        console.log(`Processing attachment: ${attachment.filename}`)
        if (
          attachment.filename.toLowerCase().endsWith('.pdf') ||
          attachment.contentType.includes('pdf')
        ) {
          const text = await convertPdfToText(attachment.content)
          if (text) attachmentTexts.push(`[${attachment.filename}]\n${text}`)
        } else if (attachment.contentType.includes('text')) {
          attachmentTexts.push(`[${attachment.filename}]\n${attachment.content}`)
        }
      }
    }

    // Extract gig details using Claude
    console.log('🤖 Parsing contract with Claude...')
    const gigDetails = await extractContractWithClaude(emailText, attachmentTexts)

    // Validate extracted data
    if (!gigDetails.title || !gigDetails.venue || !gigDetails.date) {
      return NextResponse.json(
        {
          success: false,
          error: 'Could not extract required fields (title, venue, date)',
          extracted: gigDetails,
        },
        { status: 400 }
      )
    }

    // Create gig in Supabase
    console.log('💾 Creating gig in Supabase...')
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
          promoter_name: gigDetails.promoterName,
          notes: gigDetails.notes,
          created_at: new Date().toISOString(),
        },
      ])
      .select()

    if (gigError) throw gigError

    const gig = newGig?.[0]

    // Send artist notification email
    if (gig) {
      console.log('📬 Sending artist notification...')
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

Log in to Artist OS to view full details, upload contracts, and send advance requests.

Night Manoeuvres
      `.trim()

      try {
        const emailClient = getResend()
        if (emailClient) {
          await emailClient.emails.send({
            from: 'Artist OS <bookings@nightmanoeuvres.com>',
            to: process.env.ARTIST_EMAIL || 'bookings@nightmanoeuvres.com',
            subject: `New gig confirmed: ${gig.title} on ${gigDate}`,
            text: notificationEmail,
          })
          console.log('✅ Notification email sent')
        } else {
          console.log('⚠️ Skipping notification email (RESEND_API_KEY not configured)')
        }
      } catch (emailErr: any) {
        console.error('Failed to send notification email:', emailErr)
        // Don't fail the whole request if email fails
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
    console.error('❌ Contract email error:', err)
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
