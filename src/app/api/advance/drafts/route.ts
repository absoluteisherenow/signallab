import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('advance_requests')
      .select('*, gigs!inner(id, title, venue, date, promoter_email)')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ drafts: data || [] })
  } catch (err: any) {
    if (err?.code === '42P01') return NextResponse.json({ drafts: [] })
    return NextResponse.json({ error: err.message, drafts: [] }, { status: 500 })
  }
}
