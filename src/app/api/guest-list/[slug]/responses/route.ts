import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { sendSms } from '@/lib/sms'

function fmtGigDate(iso: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

/**
 * /api/guest-list/[slug]/responses
 *
 * GET   → { responses: [...] }         (owner-only via slug → invite.user_id)
 * PATCH { id, confirmed } → { success } (toggle confirmed)
 *
 * Both routes verify that the authed user owns the invite behind the slug.
 */

async function resolveInviteForOwner(req: NextRequest, slug: string) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return { error: gate }
  const { user, serviceClient } = gate

  const { data: invite, error } = await serviceClient
    .from('guest_list_invites')
    .select('id, user_id')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !invite) {
    return { error: NextResponse.json({ responses: [], error: 'invite not found' }, { status: 404 }) }
  }
  if (invite.user_id !== user.id) {
    return { error: NextResponse.json({ responses: [], error: 'forbidden' }, { status: 403 }) }
  }
  return { invite, serviceClient }
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const resolved = await resolveInviteForOwner(req, params.slug)
  if ('error' in resolved && resolved.error) return resolved.error
  const { invite, serviceClient } = resolved as any

  const { data, error } = await serviceClient
    .from('guest_list_responses')
    .select('id, name, plus_ones, response, instagram, email, phone, city, notes, confirmed, created_at')
    .eq('invite_id', invite.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ responses: [], error: error.message })
  return NextResponse.json({ responses: data || [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const resolved = await resolveInviteForOwner(req, params.slug)
  if ('error' in resolved && resolved.error) return resolved.error
  const { invite, serviceClient } = resolved as any

  try {
    const body = await req.json().catch(() => ({}))
    const id = typeof body.id === 'string' ? body.id : ''
    const confirmed = !!body.confirmed
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Read current state so we only send the confirmation SMS on the
    // false → true transition (not on every PATCH).
    const { data: before } = await serviceClient
      .from('guest_list_responses')
      .select('id, name, phone, confirmed, invite_id')
      .eq('id', id)
      .eq('invite_id', invite.id)
      .maybeSingle()

    const { error } = await serviceClient
      .from('guest_list_responses')
      .update({ confirmed })
      .eq('id', id)
      .eq('invite_id', invite.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (confirmed && before && !before.confirmed && before.phone) {
      try {
        const { data: inviteFull } = await serviceClient
          .from('guest_list_invites')
          .select('gig_id')
          .eq('id', invite.id)
          .maybeSingle()
        const { data: gig } = inviteFull?.gig_id
          ? await serviceClient
              .from('gigs')
              .select('venue, date')
              .eq('id', inviteFull.gig_id)
              .maybeSingle()
          : { data: null as any }
        const venue = gig?.venue || 'the show'
        const dateLabel = fmtGigDate(gig?.date || '')
        const where = `${venue} ${dateLabel}`.trim()
        await sendSms({
          to: before.phone,
          body: `Night Manoeuvres. You're on the guest list for ${where}. See you there.`,
        })
      } catch (e: any) {
        console.warn('GL confirm SMS error:', e?.message || e)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
