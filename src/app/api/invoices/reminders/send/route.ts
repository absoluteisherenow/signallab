import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClients } from '@/lib/gmail-accounts'
import { createNotification } from '@/lib/notifications'
import { requireUser } from '@/lib/api-auth'
import { getOperatingContext } from '@/lib/operatingContext'
import { runRequestChecks, hardBlockFailures, logInvariants } from '@/lib/rules'

// POST — preview OR send an approved reminder draft
// Body: { id: string, confirmed?: boolean }
// Step 1 (no confirmed): returns preview of the draft for approval modal
// Step 2 (confirmed: true): runs brain request-checks, then sends via Gmail OAuth
//
// Brain-wired: blocks if the user's connected Gmail account is missing or
// mismatched. Replaces the old Resend + hardcoded-from path that violated
// rule_invoice_from_address.md.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function makeRFC2822(to: string, from: string, subject: string, html: string, text: string): string {
  const boundary = `alt_${Date.now()}`
  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(text || '').toString('base64'),
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(html || '').toString('base64'),
    `--${boundary}--`,
  ].join('\r\n')
  const msg = [...headers, ``, body].join('\r\n')
  return Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    const body = await req.json()
    const { id, confirmed } = body as { id?: string; confirmed?: boolean }
    if (!id) return NextResponse.json({ error: 'Missing draft id' }, { status: 400 })

    // Scope draft lookup to caller — prevents cross-tenant reminder sends.
    const { data: draft, error } = await supabase
      .from('invoice_reminder_drafts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('status', 'draft')
      .single()

    if (error || !draft) return NextResponse.json({ error: 'Draft not found or already sent' }, { status: 404 })

    // Step 1: preview
    if (!confirmed) {
      return NextResponse.json({
        success: true,
        preview: true,
        to: draft.promoter_email,
        subject: draft.subject,
        html: draft.body_html,
        message: 'Review this reminder email. Call again with confirmed: true to send.',
      })
    }

    // Step 2: confirmed — run brain request-checks before any send.
    const ctx = await getOperatingContext({ userId, task: 'invoice.reminder' })
    const checkRequest = { confirmed: true, from_email: ctx.connections.gmail_from, to: draft.promoter_email }
    const verdicts = runRequestChecks(checkRequest, ctx.rules, ctx)
    void logInvariants({ userId, task: 'invoice.reminder', verdicts, outputSample: draft.subject })

    const blockers = hardBlockFailures(verdicts)
    if (blockers.length) {
      return NextResponse.json({
        error: 'Outbound blocked by brain rules',
        blockers: blockers.map((b) => ({ rule: b.rule_slug, detail: b.detail })),
      }, { status: 400 })
    }

    // Send via Gmail OAuth (user's connected account), never Resend.
    const clients = await getGmailClients(userId)
    if (!clients.length) {
      return NextResponse.json({
        error: 'No Gmail OAuth account connected — connect Gmail in Settings before sending reminders',
      }, { status: 400 })
    }
    const { gmail, email: fromEmail } = clients[0]
    const fromName = ctx.artist.name || 'Invoice'
    const raw = makeRFC2822(draft.promoter_email, `${fromName} <${fromEmail}>`, draft.subject, draft.body_html, draft.body_text || '')
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

    await supabase
      .from('invoice_reminder_drafts')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)

    await createNotification({
      user_id: userId,
      type: 'invoice_overdue',
      title: `Reminder sent — ${draft.subject}`,
      message: `Sent to ${draft.promoter_email} from ${fromEmail}`,
      href: '/finances',
    })

    return NextResponse.json({ success: true, sentTo: draft.promoter_email, sentFrom: fromEmail })
  } catch (err: any) {
    console.error('Reminder send error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
