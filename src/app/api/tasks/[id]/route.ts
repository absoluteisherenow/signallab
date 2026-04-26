import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) patch.status = body.status
  if (body.title !== undefined) patch.title = body.title
  if (body.priority !== undefined) patch.priority = body.priority
  if (body.notes !== undefined) patch.notes = body.notes
  if (body.due_at !== undefined) patch.due_at = body.due_at
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  const { error } = await supabase.from('tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
