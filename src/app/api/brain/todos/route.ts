import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate

  const url = new URL(req.url)
  const includeDone = url.searchParams.get('include_done') === '1'

  let q = supabase
    .from('brain_todos')
    .select('*')
    .order('priority', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (!includeDone) q = q.is('done_at', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate

  const body = await req.json().catch(() => ({}))
  const { title, context, priority, due_date, source, source_ref } = body ?? {}
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('brain_todos')
    .insert({
      user_id: user.id,
      title: title.trim(),
      context: context ?? null,
      priority: priority ?? 2,
      due_date: due_date ?? null,
      source: source ?? 'manual',
      source_ref: source_ref ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todo: data })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate

  const body = await req.json().catch(() => ({}))
  const { id, done, title, priority, due_date, context } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof done === 'boolean') patch.done_at = done ? new Date().toISOString() : null
  if (typeof title === 'string') patch.title = title.trim()
  if (typeof priority === 'number') patch.priority = priority
  if (due_date !== undefined) patch.due_date = due_date
  if (context !== undefined) patch.context = context

  const { data, error } = await supabase
    .from('brain_todos')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todo: data })
}

export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('brain_todos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
