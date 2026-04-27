import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdvanceApprovalToken } from '@/lib/advance-approval'
import { getGmailClients } from '@/lib/gmail-accounts'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function makeRFC2822(to: string, from: string, subject: string, html: string, cc?: string): string {
  const altBoundary = `alt_${Date.now()}`
  const headers = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
  ]
  const body = [
    `--${altBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(html).toString('base64'),
    `--${altBoundary}--`,
  ].join('\r\n')
  const msg = [...headers, ``, body].join('\r\n')
  return Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(req: NextRequest, { params }: { params: { gigId: string } }) {
  try {
    const token = req.nextUrl.searchParams.get('t') || ''
    const riderType = req.nextUrl.searchParams.get('rt') || 'Touring'
    const check = verifyAdvanceApprovalToken(token, params.gigId)
    if (!check.valid) {
      return NextResponse.json({ error: 'invalid_token', reason: check.reason, message: 'Link expired or invalid — generate a fresh SMS.' }, { status: 401 })
    }

    const { data: gig } = await supabase
      .from('gigs')
      .select('id, user_id, title, venue, date, location, promoter_email')
      .eq('id', params.gigId)
      .maybeSingle()
    if (!gig) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (!gig.promoter_email) {
      return NextResponse.json({ error: 'no_recipient', message: 'No promoter email on file — set one before approving.' }, { status: 400 })
    }
    if (!gig.user_id) {
      return NextResponse.json({ error: 'gig_unowned', message: 'Gig missing user_id — legacy record.' }, { status: 400 })
    }

    // Mirror /api/advance POST html exactly so the preview the user saw matches
    // what actually goes out.
    const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'}/advance/${gig.id}`
    const subject = `Advance sheet request — ${gig.title} at ${gig.venue}`
    const displayDate = gig.date
      ? new Date(gig.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : ''
    const html = `<div style="font-family:monospace;background:#050505;color:#f2f2f2;padding:40px"><div style="color:#ff2a1a;margin-bottom:24px">NIGHT MANOEUVRES — ADVANCE REQUEST</div><h2>${gig.title}</h2><p style="color:#909090">${gig.venue}${displayDate ? ` · ${displayDate}` : ''}</p><p>Please complete the advance form for this show.</p><a href="${formUrl}" style="display:inline-block;background:#ff2a1a;color:#050505;padding:14px 28px;text-decoration:none">Complete advance form</a><a href="https://signallabos.com/waitlist" style="display:inline-flex;align-items:center;gap:6px;margin-top:40px;padding-top:20px;border-top:1px solid #1d1d1d;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#909090;text-decoration:none"><svg width="12" height="12" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" stroke-width="1.5" opacity="0.4"/><polyline points="12,32 22,32 26,18 32,46 36,26 40,34 44,30 50,32" stroke="#ff2a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>Powered by Signal Lab OS</a></div>`

    const clients = await getGmailClients(gig.user_id)
    if (!clients.length) {
      return NextResponse.json({
        error: 'gmail_not_connected',
        message: 'No Gmail connected for this account. Connect one in Settings before approving.',
      }, { status: 503 })
    }

    const { gmail, email: fromEmail } = clients[0]
    const fromHeader = `Night Manoeuvres <${fromEmail}>`
    const raw = makeRFC2822(gig.promoter_email, fromHeader, subject, html)
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

    // Persist rider_type so the form shows the right preset when the promoter opens it
    if (riderType) {
      await supabase
        .from('advance_requests')
        .upsert({ gig_id: gig.id, rider_type: riderType, completed: false }, { onConflict: 'gig_id' })
    }

    await createNotification({
      user_id: gig.user_id,
      type: 'advance_sent',
      title: `Advance sent — ${gig.title}`,
      message: `Sent from ${fromEmail} to ${gig.promoter_email}`,
      href: `/gigs/${gig.id}`,
      gig_id: gig.id,
      sendSms: false, // already sent SMS to trigger this — don't double
    })

    return NextResponse.json({
      success: true,
      sent: true,
      sentFrom: fromEmail,
      to: gig.promoter_email,
      subject,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'send_failed', message: err?.message || 'Unknown error' }, { status: 500 })
  }
}
