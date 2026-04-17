import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

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
    .select('id, name, plus_ones, response, instagram, email, phone, notes, confirmed, created_at')
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

    const { error } = await serviceClient
      .from('guest_list_responses')
      .update({ confirmed })
      .eq('id', id)
      .eq('invite_id', invite.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
