import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  let body: { rt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: CORS })
  }

  const refreshToken = body?.rt
  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    return NextResponse.json({ error: 'missing_rt' }, { status: 400, headers: CORS })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  })

  if (error || !data.session) {
    return NextResponse.json(
      { error: 'refresh_failed', message: error?.message },
      { status: 401, headers: CORS }
    )
  }

  const blob = Buffer.from(
    JSON.stringify({
      at:  data.session.access_token,
      rt:  data.session.refresh_token ?? refreshToken,
      exp: Math.floor(Date.now() / 1000) + (data.session.expires_in ?? 3600),
    })
  ).toString('base64')

  return NextResponse.json({ token: blob }, { headers: CORS })
}
