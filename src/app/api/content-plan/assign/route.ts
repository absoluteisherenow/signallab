import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * /api/content-plan/assign
 *
 * GET  ?week=YYYY-MM-DD   → { assignments: [{ card_id, scan_id }] }
 * POST { card_id, scan_id, week } → { success }
 *
 * Used by ContentStrategy to persist which scanned media maps to each weekly
 * content-plan card. Upserts on (user_id, card_id, week).
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  try {
    const week = req.nextUrl.searchParams.get('week')
    if (!week) return NextResponse.json({ assignments: [] })

    const { data, error } = await serviceClient
      .from('content_plan_assignments')
      .select('card_id, scan_id')
      .eq('user_id', user.id)
      .eq('week', week)

    if (error) return NextResponse.json({ assignments: [], error: error.message })
    return NextResponse.json({ assignments: data || [] })
  } catch (err: any) {
    return NextResponse.json({ assignments: [], error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  try {
    const body = await req.json().catch(() => ({}))
    const card_id = typeof body.card_id === 'string' ? body.card_id : ''
    const scan_id = typeof body.scan_id === 'string' ? body.scan_id : ''
    const week = typeof body.week === 'string' ? body.week : ''
    if (!card_id || !scan_id || !week) {
      return NextResponse.json({ error: 'card_id, scan_id, week required' }, { status: 400 })
    }

    const { error } = await serviceClient
      .from('content_plan_assignments')
      .upsert(
        { user_id: user.id, card_id, scan_id, week },
        { onConflict: 'user_id,card_id,week' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
