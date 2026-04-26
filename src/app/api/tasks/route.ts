import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: data ?? [] })
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  const body = await req.json()
  if (!body.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  const { data, error } = await supabase
    .from('tasks')
    .insert([{
      user_id: user.id,
      title: body.title.trim(),
      status: 'open',
      priority: body.priority || null,
      notes: body.notes || null,
      due_at: body.due_at || null,
      gig_id: body.gig_id || null,
    }])
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}
