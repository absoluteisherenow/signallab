import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/jobs/next
// Mac Mini worker polling endpoint. Header: Authorization: Bearer <WORKER_SECRET>
// Atomically claims the oldest queued job (sets status='running', started_at=now())
// and returns its full row including spec. Returns { job: null } when idle.
//
// The worker MUST call /api/jobs/[id]/complete with { status: 'done'|'failed',
// output_url?, error?, analysis? } when finished.

function authed(req: NextRequest): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') || ''
  return header === `Bearer ${secret}`
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch oldest queued, then update with CAS via eq('status','queued') so two
  // pollers never claim the same job. Supabase-js doesn't support RETURNING
  // with CAS in one call, so this is a two-step that's safe because update
  // returns 0 rows if someone else beat us and we can loop.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: candidate } = await db
      .from('render_jobs')
      .select('id')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!candidate) return NextResponse.json({ job: null })

    const { data: claimed, error } = await db
      .from('render_jobs')
      .update({ status: 'running', started_at: new Date().toISOString(), attempts: 1 })
      .eq('id', candidate.id)
      .eq('status', 'queued')
      .select('*')
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
    if (claimed) {
      // Also pull the source clip so worker has everything it needs in one call.
      const { data: clip } = await db
        .from('clip_sources')
        .select('id, source_url, title')
        .eq('id', claimed.clip_id)
        .maybeSingle()
      return NextResponse.json({ job: claimed, clip })
    }
    // Someone else claimed it; try again.
  }
  return NextResponse.json({ job: null })
}
