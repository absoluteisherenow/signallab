import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// GET /api/plugins/sync — return persisted plugin list
export async function GET() {
  try {
    const { data } = await supabase
      .from('artist_settings')
      .select('plugins')
      .single()
    return NextResponse.json(
      { plugins: data?.plugins ?? [] },
      { headers: CORS }
    )
  } catch {
    return NextResponse.json({ plugins: [] }, { headers: CORS })
  }
}

// POST /api/plugins/sync — persist plugin list from VST scanner / M4L scanner
export async function POST(req: NextRequest) {
  let body: { plugins?: string[]; source?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: CORS })
  }

  const plugins = body?.plugins
  if (!Array.isArray(plugins)) {
    return NextResponse.json({ error: 'plugins must be an array' }, { status: 400, headers: CORS })
  }

  // Upsert into artist_settings.plugins column
  try {
    const { data: existing } = await supabase
      .from('artist_settings')
      .select('id')
      .single()

    if (existing) {
      await supabase
        .from('artist_settings')
        .update({ plugins, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('artist_settings')
        .insert([{ plugins, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
    }
  } catch {
    // Persist failure is non-fatal — still acknowledge receipt
  }

  return NextResponse.json({ ok: true, count: plugins.length }, { headers: CORS })
}
