import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// POST /api/clip-inbox/[id]/analyse
// Enqueues an 'analyse' job for the Mac Mini worker: RMS peaks, shot changes,
// Whisper speech segments → clip_analysis row. Idempotent: returns existing
// queued/running job if one exists.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  const { data: clip } = await serviceClient
    .from('clip_sources')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!clip) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: existing } = await serviceClient
    .from('render_jobs')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('clip_id', params.id)
    .eq('kind', 'analyse')
    .in('status', ['queued', 'running'])
    .maybeSingle()
  if (existing) return NextResponse.json({ job: existing, reused: true })

  const { data, error } = await serviceClient
    .from('render_jobs')
    .insert({ user_id: user.id, clip_id: params.id, kind: 'analyse' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  return NextResponse.json({ job: data })
}
