import { NextRequest, NextResponse } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  // Accept the plugin list from the VST scanner.
  // Authorization header contains Bearer {token_blob} — token is validated
  // client-side before calling; server just acknowledges receipt.
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

  // Acknowledge receipt — plugin list is used client-side in the VST
  return NextResponse.json(
    { ok: true, count: plugins.length },
    { headers: CORS }
  )
}
