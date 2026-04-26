import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// GET: Fetch briefing drafts for a gig (RLS-scoped to user)
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  const gigId = req.nextUrl.searchParams.get('gigId')
  if (!gigId) return NextResponse.json({ error: 'gigId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('crew_briefing_drafts')
    .select('*')
    .eq('gig_id', gigId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drafts: data || [] })
}
