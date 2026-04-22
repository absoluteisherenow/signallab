import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/jobs/[id]/complete
// Header: Authorization: Bearer <WORKER_SECRET>
// Body for kind='render': { status: 'done'|'failed', output_url?, error? }
// Body for kind='analyse': { status: 'done'|'failed', error?, analysis? }
//   analysis shape: {
//     duration_seconds, rms_peaks[], shot_changes[], speech_segments[],
//     suggested_cuts[], raw?
//   }

function authed(req: NextRequest): boolean {
  const secret = process.env.WORKER_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') || ''
  return header === `Bearer ${secret}`
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let body: { status?: unknown; output_url?: unknown; error?: unknown; analysis?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

  const status = body.status === 'done' || body.status === 'failed' ? body.status : null
  if (!status) return NextResponse.json({ error: 'invalid_status' }, { status: 400 })

  const { data: job } = await db
    .from('render_jobs')
    .select('id, kind, user_id, clip_id, status')
    .eq('id', params.id)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (job.status === 'done' || job.status === 'failed') {
    return NextResponse.json({ error: 'already_final', current: job.status }, { status: 409 })
  }

  const update: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
  }
  if (typeof body.output_url === 'string') update.output_url = body.output_url
  if (typeof body.error === 'string') update.error = body.error.slice(0, 2000)

  const { error: jobErr } = await db.from('render_jobs').update(update).eq('id', job.id)
  if (jobErr) return NextResponse.json({ error: 'db_error', detail: jobErr.message }, { status: 500 })

  // If this was an analyse job that succeeded, upsert clip_analysis row.
  if (job.kind === 'analyse' && status === 'done' && body.analysis && typeof body.analysis === 'object') {
    const a = body.analysis as Record<string, unknown>
    await db.from('clip_analysis').upsert({
      clip_id: job.clip_id,
      user_id: job.user_id,
      duration_seconds: typeof a.duration_seconds === 'number' ? a.duration_seconds : null,
      rms_peaks: Array.isArray(a.rms_peaks) ? a.rms_peaks : [],
      shot_changes: Array.isArray(a.shot_changes) ? a.shot_changes : [],
      speech_segments: Array.isArray(a.speech_segments) ? a.speech_segments : [],
      suggested_cuts: Array.isArray(a.suggested_cuts) ? a.suggested_cuts : [],
      raw: a.raw || null,
      analysed_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ ok: true })
}
