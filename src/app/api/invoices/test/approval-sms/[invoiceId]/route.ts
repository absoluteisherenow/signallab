import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildApprovalUrl } from '@/lib/invoice-approval'
import { sendSms } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, { params }: { params: { invoiceId: string } }) {
  const key = req.nextUrl.searchParams.get('key') || ''
  const expected = process.env.INVOICE_APPROVAL_SECRET || ''
  if (!expected || key !== expected) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, gig_title, amount, currency, status, sent_to_promoter_at, sent_to_promoter_email')
    .eq('id', params.invoiceId)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'invoice_not_found' }, { status: 404 })
  // status=draft after a previous send = amended, resend allowed.
  if (invoice.sent_to_promoter_at && invoice.status !== 'draft') {
    return NextResponse.json({ error: 'already_sent', sentAt: invoice.sent_to_promoter_at }, { status: 409 })
  }

  const href = buildApprovalUrl(invoice.id)
  const phone = process.env.ARTIST_PHONE
  if (!phone) return NextResponse.json({ href, sms: { sent: false, reason: 'ARTIST_PHONE not set' } })

  const body = `Invoice ready: ${invoice.currency} ${Number(invoice.amount).toLocaleString()} for ${invoice.gig_title}\nReview & send: ${href}`
  const result = await sendSms({ to: phone, body: body.slice(0, 320) })

  return NextResponse.json({
    href,
    sms: result,
    invoice: {
      id: invoice.id,
      gig_title: invoice.gig_title,
      amount: invoice.amount,
      currency: invoice.currency,
      to: invoice.sent_to_promoter_email,
    },
  })
}
