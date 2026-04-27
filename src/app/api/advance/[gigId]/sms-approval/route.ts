import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/api-auth'
import { buildAdvanceApprovalUrl } from '@/lib/advance-approval'
import { sendSms } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Trigger an SMS to ARTIST_PHONE with a signed advance-approval link.
// Mirrors /api/invoices/test/approval-sms/[invoiceId]/route.ts but auth-gated
// (regular requireUser, not a test-only key) since this fires real SMS.
export async function POST(req: NextRequest, { params }: { params: { gigId: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user } = gate

  const { data: gig } = await supabase
    .from('gigs')
    .select('id, user_id, title, venue, promoter_email, location')
    .eq('id', params.gigId)
    .maybeSingle()
  if (!gig) return NextResponse.json({ error: 'gig_not_found' }, { status: 404 })
  if (gig.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!gig.promoter_email) {
    return NextResponse.json({ error: 'no_promoter_email', message: 'Add a promoter email on the gig before sending the advance.' }, { status: 400 })
  }

  let riderType = 'Touring'
  try {
    const body = await req.json()
    if (typeof body?.riderType === 'string') riderType = body.riderType
  } catch {
    // body optional
  }
  if (riderType === 'Touring' && (gig.location || '').toLowerCase().includes('london')) riderType = 'Hometown'

  const href = `${buildAdvanceApprovalUrl(gig.id)}&rt=${encodeURIComponent(riderType)}`

  const phone = process.env.ARTIST_PHONE
  if (!phone) {
    return NextResponse.json({ href, sms: { sent: false, reason: 'ARTIST_PHONE not set' } })
  }

  const smsBody = `Advance ready: ${gig.title} at ${gig.venue}\nReview & send: ${href}`
  const result = await sendSms({ to: phone, body: smsBody.slice(0, 320) })

  return NextResponse.json({
    href,
    sms: result,
    gig: { id: gig.id, title: gig.title, venue: gig.venue, to: gig.promoter_email },
  })
}
