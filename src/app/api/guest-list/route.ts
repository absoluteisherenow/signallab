import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * /api/guest-list
 *
 * GET  → { invites: [{ id, gig_id, slug, offers_discount, offers_guestlist, created_at }] }
 * POST { gig_id, offers_discount?, offers_guestlist? } → { success, invite }
 *
 * Creates a short public slug for a gig so the user can share a guest-list
 * signup link. One invite per (user_id, gig_id) — POST returns the existing
 * invite if already created.
 */

// URL-safe ~8-char slug (72 bits of entropy from 12 base32 chars trimmed to 8)
function makeSlug(): string {
  const alpha = 'abcdefghijkmnpqrstuvwxyz23456789' // no 0/1/l/o
  let s = ''
  for (let i = 0; i < 8; i++) s += alpha[Math.floor(Math.random() * alpha.length)]
  return s
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  try {
    const { data, error } = await serviceClient
      .from('guest_list_invites')
      .select('id, gig_id, slug, offers_discount, offers_guestlist, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ invites: [], error: error.message })
    return NextResponse.json({ invites: data || [] })
  } catch (err: any) {
    return NextResponse.json({ invites: [], error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  try {
    const body = await req.json().catch(() => ({}))
    const gig_id = typeof body.gig_id === 'string' ? body.gig_id : ''
    if (!gig_id) return NextResponse.json({ error: 'gig_id required' }, { status: 400 })

    const offers_discount = body.offers_discount === undefined ? true : !!body.offers_discount
    const offers_guestlist = body.offers_guestlist === undefined ? true : !!body.offers_guestlist

    // If an invite already exists, return it rather than creating a duplicate
    const { data: existing } = await serviceClient
      .from('guest_list_invites')
      .select('id, gig_id, slug, offers_discount, offers_guestlist, created_at')
      .eq('user_id', user.id)
      .eq('gig_id', gig_id)
      .maybeSingle()

    if (existing) return NextResponse.json({ success: true, invite: existing })

    // Try a few slugs in case of collision
    let invite: any = null
    let lastErr: any = null
    for (let i = 0; i < 5; i++) {
      const slug = makeSlug()
      const { data, error } = await serviceClient
        .from('guest_list_invites')
        .insert({ user_id: user.id, gig_id, slug, offers_discount, offers_guestlist })
        .select('id, gig_id, slug, offers_discount, offers_guestlist, created_at')
        .single()
      if (!error) { invite = data; break }
      lastErr = error
      if (!String(error.message || '').toLowerCase().includes('unique')) break
    }

    if (!invite) return NextResponse.json({ error: lastErr?.message || 'failed to create invite' }, { status: 500 })
    return NextResponse.json({ success: true, invite })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
