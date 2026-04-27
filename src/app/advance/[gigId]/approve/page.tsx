import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { verifyAdvanceApprovalToken } from '@/lib/advance-approval'
import ApproveClient from './ApproveClient'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Props {
  params: { gigId: string }
  searchParams: { t?: string; rt?: string }
}

export default async function AdvanceApprovePage({ params, searchParams }: Props) {
  const token = searchParams.t || ''
  if (!token) {
    return <ErrorBlock title="Link missing" body="This link is missing its approval token. Open the latest SMS and tap the link from there." />
  }

  const check = verifyAdvanceApprovalToken(token, params.gigId)
  if (!check.valid) {
    const msg = check.reason === 'expired'
      ? 'This link has expired. Generate a fresh SMS from the gig page to review the advance again.'
      : 'This link is invalid or malformed. Generate a fresh SMS from the gig page.'
    return <ErrorBlock title="Link no longer valid" body={msg} />
  }

  const { data: gig } = await supabase
    .from('gigs')
    .select('id, user_id, title, venue, date, location, promoter_email')
    .eq('id', params.gigId)
    .maybeSingle()
  if (!gig) notFound()

  if (!gig.promoter_email) {
    return <ErrorBlock title="No promoter email" body="This gig has no promoter email on file. Add one from the gig page before sending the advance." />
  }

  const riderType = searchParams.rt || ((gig.location || '').toLowerCase().includes('london') ? 'Hometown' : 'Touring')
  const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'}/advance/${gig.id}`
  const subject = `Advance sheet request — ${gig.title} at ${gig.venue}`
  const displayDate = gig.date
    ? new Date(gig.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <ApproveClient
      gigId={params.gigId}
      token={token}
      riderType={riderType}
      gigTitle={gig.title}
      venue={gig.venue}
      date={displayDate}
      to={gig.promoter_email}
      subject={subject}
      formUrl={formUrl}
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
