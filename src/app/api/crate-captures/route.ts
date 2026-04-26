import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// POST — save a crate capture (image + extracted tracks)
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const body = await req.json()
    const { image_url, source, tracks, raw_response } = body
    if (!image_url) {
      return NextResponse.json({ error: 'image_url required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('crate_captures')
      .insert({
        user_id: user.id,
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
