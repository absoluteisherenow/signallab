import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const blast_id = searchParams.get('blast_id')

  if (blast_id) {
    const { data, error } = await supabase
      .from('promo_reactions')
      .select('*, dj_contacts(name, instagram_handle)')
      .eq('blast_id', blast_id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ reactions: data })
  }

  const { data, error } = await supabase
    .from('promo_reactions')
    .select('*, dj_contacts(name, instagram_handle)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reactions: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { blast_id, contact_id, reaction, notes, screenshot_url } = body

  if (!blast_id || !contact_id || !reaction) {
    return NextResponse.json({ error: 'blast_id, contact_id, and reaction are required' }, { status: 400 })
  }

  const validReactions = ['playing', 'liked', 'replied', 'none']
  if (!validReactions.includes(reaction)) {
    return NextResponse.json({ error: `reaction must be one of: ${validReactions.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('promo_reactions')
    .upsert(
      { blast_id, contact_id, reaction, notes, screenshot_url },
      { onConflict: 'blast_id,contact_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reaction: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, reaction, notes, screenshot_url } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  if (reaction) {
    const validReactions = ['playing', 'liked', 'replied', 'none']
    if (!validReactions.includes(reaction)) {
      return NextResponse.json({ error: `reaction must be one of: ${validReactions.join(', ')}` }, { status: 400 })
    }
  }

  const updates: Record<string, unknown> = {}
  if (reaction !== undefined) updates.reaction = reaction
  if (notes !== undefined) updates.notes = notes
  if (screenshot_url !== undefined) updates.screenshot_url = screenshot_url

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('promo_reactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reaction: data })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('promo_reactions')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
