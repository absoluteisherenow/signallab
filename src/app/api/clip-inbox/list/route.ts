import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// GET /api/clip-inbox/list?status=pending&limit=200
// Returns the user's clip_sources rows, newest first.

const STATUSES = new Set(['pending', 'shortlisted', 'rejected', 'used', 'all'])

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || 'pending'
  const limitParam = Number(url.searchParams.get('limit') || 200)
  const limit = Math.min(Math.max(1, Number.isFinite(limitParam) ? limitParam : 200), 500)

  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
  }

  let q = serviceClient
    .from('clip_sources')
    .select('id, source_type, source_url, title, duration_seconds, thumbnail_url, status, scan_id, caption_draft, notes, gig_id, imported_at')
    .eq('user_id', user.id)
    .order('imported_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  return NextResponse.json({ clips: data ?? [] })
}
