import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { verifyApprovalToken } from '@/lib/invoice-approval'
import ApproveClient from './ApproveClient'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Props {
  params: { id: string }
  searchParams: { t?: string }
}

export default async function InvoiceApprovePage({ params, searchParams }: Props) {
  const token = searchParams.t || ''
  if (!token) return <ErrorBlock title="Link missing" body="This link is missing its approval token. Open the latest SMS and tap the link from there." />

  const check = verifyApprovalToken(token, params.id)
  if (!check.valid) {
    const msg = check.reason === 'expired'
      ? 'This link has expired. Generate a fresh SMS from the dashboard to review the invoice again.'
      : 'This link is invalid or malformed. Generate a fresh SMS from the dashboard.'
    return <ErrorBlock title="Link no longer valid" body={msg} />
  }

  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', params.id).maybeSingle()
  if (!invoice) notFound()

  // status=draft after a previous send means the invoice was amended and needs re-approval.
  if (invoice.sent_to_promoter_at && invoice.status !== 'draft') {
    return <ErrorBlock title="Already sent" body={`This invoice was sent on ${new Date(invoice.sent_to_promoter_at).toLocaleString('en-GB')}.`} />
  }

  const [{ data: settings }, { data: gig }] = await Promise.all([
    supabase.from('artist_settings').select('profile, payment').maybeSingle(),
    invoice.gig_id
      ? supabase.from('gigs').select('promoter_email, venue').eq('id', invoice.gig_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const profile = (settings?.profile || {}) as Record<string, unknown>
  const payment = (settings?.payment || {}) as Record<string, unknown>
  const artistName = (invoice.artist_name as string) || (payment.legal_name as string) || (profile.name as string) || 'Artist'
  const invoiceNumber = `INV-${params.id.slice(-6).toUpperCase()}`
  const toAddr = (invoice.sent_to_promoter_email as string) || (gig?.promoter_email as string) || ''
  const venue = (gig?.venue as string) || (invoice.gig_title as string)?.match(/\bat\s+(.+)$/i)?.[1]?.trim() || ''
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'On receipt'

  const toLower = toAddr.toLowerCase()
  const cc = toLower.includes('archie') || toLower.includes('turbomgmt') ? '' : 'archie@turbomgmt.co.uk'

  // Mirror greeting logic in /api/invoices/[id]/approve/route.ts
  const localPart = toAddr ? toAddr.split('@')[0].split(/[.+_-]/)[0].replace(/\d+/g, '') : ''
  const generic = /^(hello|info|bookings?|team|accounts?|admin|contact|mail|office)$/i
  const greetingName = localPart && !generic.test(localPart)
    ? localPart[0].toUpperCase() + localPart.slice(1).toLowerCase()
    : 'Team'
  const greeting = `Hi ${greetingName},`

  const firstBank = (profile.bankAccounts as Array<Record<string, string>> | undefined)?.[0]
    || (payment.bank_accounts as Array<Record<string, string>> | undefined)?.[0]
  const signoffSource = (payment.legal_name as string) || firstBank?.accountName || firstBank?.account_name || 'Anthony'
  const signoff = signoffSource.split(' ')[0]

  return (
    <ApproveClient
      invoiceId={params.id}
      token={token}
      artistName={artistName}
      invoiceNumber={invoiceNumber}
      to={toAddr}
      cc={cc}
      subject={`Invoice ${invoiceNumber}: ${invoice.gig_title}`}
      amount={`${invoice.currency} ${Number(invoice.amount).toLocaleString()}`}
      dueDate={dueDate}
      type={(invoice.type as string) || 'full'}
      venue={venue}
      from="advancingabsolute@gmail.com"
      greeting={greeting}
      signoff={signoff}
    />
  )
}

function ErrorBlock({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: '#f2f2f2', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 480 }}>
        <div style={{ color: '#ff2a1a', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 16 }}>Signal Lab OS</div>
        <div style={{ fontSize: 22, fontWeight: 300, marginBottom: 12 }}>{title}</div>
        <div style={{ color: '#909090', fontSize: 14, lineHeight: 1.6 }}>{body}</div>
      </div>
    </div>
  )
}
