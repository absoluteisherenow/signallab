import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { searchParams } = new URL(req.url)
    const source = searchParams.get('source')
    const status = searchParams.get('status')

    let query = supabase
      .from('revenue_streams')
      .select('*')
      .order('created_at', { ascending: false })

    if (source) query = query.eq('source', source)
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, revenue_streams: data || [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message, revenue_streams: [] })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('revenue_streams')
      .insert([{
        user_id: user.id,
        source: body.source,
        description: body.description,
        amount: parseFloat(body.amount) || 0,
        currency: body.currency || 'EUR',
        period_start: body.period_start || null,
        period_end: body.period_end || null,
        release_title: body.release_title || null,
        status: body.status || 'pending',
        invoice_id: body.invoice_id || null,
        notes: body.notes || null,
      }])
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, revenue_stream: data?.[0] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
