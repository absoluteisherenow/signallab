import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// ── /api/expenses ──────────────────────────────────────────────────────────
// Auth-gated. RLS (user_owns_row_*) scopes to authed user; user_id passed
// explicitly on insert.

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    let query = supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })

    if (from) query = query.gte('date', from)
    if (to) query = query.lte('date', to)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, expenses: data || [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message, expenses: [] })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('expenses')
      .insert([{
        user_id: user.id,
        date: body.date,
        description: body.description,
        category: body.category || 'Other',
        amount: parseFloat(body.amount) || 0,
        currency: body.currency || 'GBP',
        gig_id: body.gig_id || null,
        receipt_url: body.receipt_url || null,
        notes: body.notes || null,
      }])
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, expense: data?.[0] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const body = await req.json()
    const { id, ...fields } = body
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    if (fields.date !== undefined) updates.date = fields.date
    if (fields.description !== undefined) updates.description = fields.description
    if (fields.category !== undefined) updates.category = fields.category
    if (fields.amount !== undefined) updates.amount = parseFloat(fields.amount) || 0
    if (fields.currency !== undefined) updates.currency = fields.currency
    if (fields.gig_id !== undefined) updates.gig_id = fields.gig_id || null
    if (fields.receipt_url !== undefined) updates.receipt_url = fields.receipt_url || null
    if (fields.notes !== undefined) updates.notes = fields.notes || null

    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, expense: data?.[0] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })
    }
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
