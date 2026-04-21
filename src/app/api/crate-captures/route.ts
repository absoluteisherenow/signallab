import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST — save a crate capture (image + extracted tracks)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { image_url, source, tracks, raw_response } = body
    if (!image_url) {
      return NextResponse.json({ error: 'image_url required' }, { status: 400 })
    }

    // Attach user_id via auth header if present (matches /api/tracks pattern)
    const authHeader = req.headers.get('authorization')
    let userId: string | null = null
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      userId = user?.id || null
    }

    const { data, error } = await supabase
      .from('crate_captures')
      .insert({
        ...(userId ? { user_id: userId } : {}),
        image_url,
        source: source || 'other',
        tracks: tracks || [],
        raw_response: raw_response || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, capture: data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
