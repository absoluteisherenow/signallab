import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// GET /api/clip-inbox/[id]/analysis
// Returns the clip + its cached analysis + latest jobs.

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  const [clipRes, analysisRes, jobsRes] = await Promise.all([
    serviceClient
      .from('clip_sources')
      .select('id, source_type, source_url, title, duration_seconds, status, caption_draft, notes')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle(),
    serviceClient
      .from('clip_analysis')
      .select('*')
      .eq('clip_id', params.id)
      .eq('user_id', user.id)
      .maybeSingle(),
    serviceClient
      .from('render_jobs')
      .select('id, kind, status, output_url, error, created_at, completed_at')
      .eq('user_id', user.id)
      .eq('clip_id', params.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (!clipRes.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({
    clip: clipRes.data,
    analysis: analysisRes.data || null,
    jobs: jobsRes.data || [],
  })
}
