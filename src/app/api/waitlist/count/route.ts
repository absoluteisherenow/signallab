// ── GET /api/waitlist/count ────────────────────────────────────────────────
// Public, cached for 60s at the edge. Marketing page reads this server-side.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 60 // seconds

export async function GET() {
  try {
    const { count, error } = await supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })

    if (error) throw error

    return NextResponse.json(
      { success: true, count: count ?? 0 },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } }
    )
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
