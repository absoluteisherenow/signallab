import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('dj_contacts')
    .select('*')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ contacts: [] })
  return NextResponse.json({ contacts: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, instagram_handle, email, whatsapp, genre, tier, notes } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const handle = instagram_handle?.replace('@', '').trim() || null

  const { data, error } = await supabase
    .from('dj_contacts')
    .insert({ name, instagram_handle: handle, email, whatsapp, genre, tier: tier || 'standard', notes })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact: data })
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (updates.instagram_handle) updates.instagram_handle = updates.instagram_handle.replace('@', '').trim()
  const { error } = await supabase.from('dj_contacts').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('dj_contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
