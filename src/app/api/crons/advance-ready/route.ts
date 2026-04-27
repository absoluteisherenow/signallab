import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronAuth } from '@/lib/cron-auth'
import { buildAdvanceApprovalUrl } from '@/lib/advance-approval'
import { sendSms } from '@/lib/sms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Daily auto-trigger for advance approval SMS.
// Runs every morning. For each gig that:
//   • is confirmed
//   • has promoter_email
//   • date is between TODAY+7 and TODAY+28 (sweet spot for advancing)
//   • has no advance_requests row yet
//   • hasn't been SMS'd in the last 7 days (advance_sms_sent_at)
// → fire one SMS to the tenant artist phone with a signed approval link.
// Tap link → preview → Send. Zero in-app clicks needed to start the flow.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WINDOW_START_DAYS = 7
const WINDOW_END_DAYS = 28
const REFIRE_DAYS = 7

export async function GET(req: NextRequest) {
  const unauth = requireCronAuth(req, 'advance-ready')
  if (unauth) return unauth

  const today = new Date()
  const start = new Date(today.getTime() + WINDOW_START_DAYS * 86400000).toISOString().slice(0, 10)
  const end = new Date(today.getTime() + WINDOW_END_DAYS * 86400000).toISOString().slice(0, 10)
  const refireCutoff = new Date(today.getTime() - REFIRE_DAYS * 86400000).toISOString()

  const { data: gigs } = await supabase
    .from('gigs')
    .select('id, user_id, title, venue, promoter_email, location, date, status, advance_sms_sent_at')
    .in('status', ['confirmed'])
    .gte('date', start)
    .lte('date', end)
    .not('promoter_email', 'is', null)

  if (!gigs?.length) return NextResponse.json({ ran: true, fired: 0, skipped: 0 })

  const fired: Array<{ gigId: string; sms: any }> = []
  let skipped = 0

  for (const gig of gigs) {
    // Recent SMS — don't re-fire within REFIRE_DAYS
    if (gig.advance_sms_sent_at && gig.advance_sms_sent_at > refireCutoff) {
      skipped++
      continue
    }

    // Already an advance_requests row → user has acted on it. Don't nudge.
    const { data: existing } = await supabase
      .from('advance_requests')
      .select('id')
      .eq('gig_id', gig.id)
      .limit(1)
      .maybeSingle()
    if (existing) {
      skipped++
      continue
    }

    // Per-tenant phone — team roster artist row first, ARTIST_PHONE fallback
    let phone: string | null = null
    if (gig.user_id) {
      const { data: settings } = await supabase
        .from('artist_settings')
        .select('team')
        .eq('user_id', gig.user_id)
        .maybeSingle()
      const team: any[] = settings?.team || []
      phone = team.find(t => t.phone && (t.role || '').toLowerCase().includes('artist'))?.phone || null
    }
    if (!phone) phone = process.env.ARTIST_PHONE || null
    if (!phone) {
      skipped++
      continue
    }

    const riderType = (gig.location || '').toLowerCase().includes('london') ? 'Hometown' : 'Touring'
    const href = `${buildAdvanceApprovalUrl(gig.id)}&rt=${encodeURIComponent(riderType)}`
    const dateStr = new Date(gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const body = `Advance ready: ${gig.title} at ${gig.venue} (${dateStr})\nReview & send: ${href}`

    try {
      const result = await sendSms({ to: phone, body: body.slice(0, 320) })
      await supabase
        .from('gigs')
        .update({ advance_sms_sent_at: new Date().toISOString() })
        .eq('id', gig.id)
      fired.push({ gigId: gig.id, sms: result })
    } catch (err: any) {
      console.error('[advance-ready]', gig.id, err?.message)
      skipped++
    }
  }

  return NextResponse.json({ ran: true, fired: fired.length, skipped, results: fired })
}
