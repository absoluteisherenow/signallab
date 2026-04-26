import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// GET — load saved strategies (RLS-scoped)
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  const { data, error } = await supabase
    .from('content_strategies')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, strategies: data })
}

// POST — save a strategy from Signal Voice or other source
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  const body = await req.json()
  const { source = 'signal_voice', query, answer, phases, always_on } = body

  const { data, error } = await supabase
    .from('content_strategies')
    .insert({ user_id: user.id, source, query, answer, phases, always_on })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, strategy: data })
}

// DELETE — remove a saved strategy
export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  const { id } = await req.json()
  if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })

  const { error } = await supabase.from('content_strategies').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
