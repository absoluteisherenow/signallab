import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// POST /api/clip-inbox/[id]/render
// Body: { trim_in: number, trim_out: number, text_overlays: [{text, start, end, y_pct?}] }
// Enqueues a 'render' job. Mac Mini worker picks up, runs FFmpeg, uploads MP4.

type Overlay = { text: string; start: number; end: number; y_pct?: number }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  let body: { trim_in?: unknown; trim_out?: unknown; text_overlays?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

  const trim_in = typeof body.trim_in === 'number' ? body.trim_in : NaN
  const trim_out = typeof body.trim_out === 'number' ? body.trim_out : NaN
  if (!(trim_in >= 0) || !(trim_out > trim_in)) {
    return NextResponse.json({ error: 'invalid_trim' }, { status: 400 })
  }
  if (trim_out - trim_in > 180) {
    return NextResponse.json({ error: 'clip_too_long', max_seconds: 180 }, { status: 400 })
  }

  const rawOverlays = Array.isArray(body.text_overlays) ? body.text_overlays : []
  const overlays: Overlay[] = rawOverlays
    .filter((o): o is Overlay => !!o && typeof (o as Overlay).text === 'string')
    .slice(0, 4)
    .map(o => ({
      text: String(o.text).slice(0, 120),
      start: Math.max(0, Number(o.start) || 0),
      end: Math.max(Number(o.start) || 0, Number(o.end) || (trim_out - trim_in)),
      y_pct: typeof o.y_pct === 'number' ? Math.min(0.95, Math.max(0.05, o.y_pct)) : 0.8,
    }))

  const { data: clip } = await serviceClient
    .from('clip_sources')
    .select('id, source_url')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!clip) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const spec = {
    source_url: clip.source_url,
    trim_in,
    trim_out,
    text_overlays: overlays,
  }

  const { data, error } = await serviceClient
    .from('render_jobs')
    .insert({ user_id: user.id, clip_id: params.id, kind: 'render', spec })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  return NextResponse.json({ job: data })
}
