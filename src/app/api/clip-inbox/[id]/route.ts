import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// PATCH /api/clip-inbox/[id]   body: { status?, notes?, caption_draft? }
// DELETE /api/clip-inbox/[id]

const ALLOWED_STATUS = new Set(['pending', 'shortlisted', 'rejected', 'used'])

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  let body: { status?: unknown; notes?: unknown; caption_draft?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUS.has(body.status)) return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
    patch.status = body.status
  }
  if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 2000)
  if (typeof body.caption_draft === 'string') patch.caption_draft = body.caption_draft.slice(0, 4000)

  if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'no_fields' }, { status: 400 })

  const { data, error } = await serviceClient
    .from('clip_sources')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ clip: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  const { error } = await serviceClient
    .from('clip_sources')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
