import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value
          },
          // No-ops: route handler can't mutate request cookies. If the access
          // token is expired, getSession() returns an error → we return 401
          // and the caller (VST) refreshes via /api/vst/refresh.
          set() {},
          remove() {},
        },
      }
    )

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'not_authenticated', redirect: '/login' },
        { status: 401, headers: CORS_HEADERS }
      )
    }

    // Resolve display name
    let artistName: string = session.user.email ?? 'Unknown Artist'
    const { data: settings } = await supabase
      .from('artist_settings')
      .select('profile')
      .single()

    if (settings?.profile?.name) {
      artistName = settings.profile.name
    }

    // Encode access_token + refresh_token + expiry as a base64 JSON blob.
    // The VST parses this blob and auto-refreshes via /api/vst/refresh when needed.
    const blob = Buffer.from(
      JSON.stringify({
        at:  session.access_token,
        rt:  session.refresh_token ?? '',
        exp: Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
      })
    ).toString('base64')

    return NextResponse.json(
      { token: blob, artist: artistName },
      { headers: CORS_HEADERS }
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: 'server_error', message: err.message },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
