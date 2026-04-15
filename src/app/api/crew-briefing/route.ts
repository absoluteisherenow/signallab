import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET: Fetch briefing drafts for a gig
export async function GET(req: NextRequest) {
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
