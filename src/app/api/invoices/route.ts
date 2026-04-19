import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ success: true, invoices: data || [] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, invoices: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('invoices')
      .insert([{
        gig_id: body.gig_id || null,
        gig_title: body.gig_title,
        amount: parseFloat(body.amount) || 0,
        currency: body.currency || null,
        type: body.type || 'full',
        status: 'pending',
        due_date: body.due_date || null,
        gig_date: body.gig_date || null,
        wht_rate: body.wht_rate || null,
        artist_name: body.artist_name || null,
        notes: body.notes || null,
      }])
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, invoice: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const updates: Record<string, any> = {}
    if (body.status) updates.status = body.status
    if (body.status === 'paid') updates.paid_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', body.id)
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, invoice: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
