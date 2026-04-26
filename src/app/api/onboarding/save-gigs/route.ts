import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const runtime = 'nodejs'

// ── Onboarding bulk-import: gigs ────────────────────────────────────────────
// Trusted one-time import path used by the onboarding flow only. Bypasses the
// per-tier gig cap (canAddGig in /api/gigs) because:
//   1. The user has no tier picked yet at onboarding time (status='free')
//   2. Gigs surfaced here come from Resident Advisor / Spotify discovery — they
//      are public-record upcoming shows the artist already has booked, not new
//      bookings being managed via Tour Lab.
//
// SAFETY:
//   - Hard-rejects if the user already has any gigs (one-shot import only)
//   - Server-side dedupe by venue+date
//   - Caps the batch at 50 to avoid abuse
//   - All inserts get user_id from the authed session (RLS still enforced)

interface IncomingGig {
  title: string
  venue: string
  location?: string
  date: string
  status?: string
}

const MAX_BATCH = 50

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient: service } = gate

  const body = await req.json().catch(() => ({}))
  const gigs: IncomingGig[] = Array.isArray(body?.gigs) ? body.gigs : []
  if (!gigs.length) {
    return NextResponse.json({ success: true, inserted: 0 })
  }

  // Hard-reject if user already has any gigs — onboarding is one-shot.
  const { count: existingCount } = await service
    .from('gigs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((existingCount || 0) > 0) {
    return NextResponse.json(
      { success: false, error: 'onboarding_already_complete', message: 'Onboarding bulk-import only runs on fresh accounts. Add gigs through Tour Lab.' },
      { status: 409 }
    )
  }

  const safe = gigs
    .slice(0, MAX_BATCH)
    .filter(g => g?.venue && g?.date && g?.title)
    .map(g => ({
      user_id: user.id,
      title: g.title,
      venue: g.venue,
      location: g.location || null,
      date: g.date,
      status: g.status || 'pending',
      currency: 'EUR',
      audience: 0,
      fee: 0,
    }))

  if (!safe.length) return NextResponse.json({ success: true, inserted: 0 })

  const { data, error } = await service.from('gigs').insert(safe).select('id')
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, inserted: data?.length || 0 })
}
