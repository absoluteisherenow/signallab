import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// OPTIONS preflight for VST plugin cross-origin requests
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

    // Resolve display name: try artist_settings profile, fall back to email
    let artistName: string = session.user.email ?? 'Unknown Artist'

    const { data: settings } = await supabase
      .from('artist_settings')
      .select('profile')
      .single()

    if (settings?.profile?.name) {
      artistName = settings.profile.name
    }

    return NextResponse.json(
      {
        token: session.access_token,
        artist: artistName,
      },
      { headers: CORS_HEADERS }
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: 'server_error', message: err.message },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
