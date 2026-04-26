import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// NOTE: media_scans.user_id is TEXT (legacy schema). RLS policy casts auth.uid()::text.

// GET /api/media/scans?limit=50
// Returns scan history for the AUTHED user, newest first
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)

    const { data, error } = await supabase
      .from('media_scans')
      .select('id, file_name, composite_score, result, caption, thumbnail_url, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error

    return NextResponse.json({ scans: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, scans: [] }, { status: 500 })
  }
}

// POST /api/media/scans — saves a completed scan
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const {
      file_name,
      file_size,
      mime_type,
      thumbnail_url,
      composite_score,
      content_score,
      result,
      caption,
    } = await req.json()

    const { data, error } = await supabase
      .from('media_scans')
      .insert({
        user_id: user.id, // TEXT col — uuid auto-coerces fine
        file_name: file_name || null,
        file_size: file_size || null,
        file_type: mime_type || null,
        thumbnail_url: thumbnail_url || null,
        composite_score: composite_score || 0,
        reach_score: content_score?.reach || null,
        authenticity_score: content_score?.authenticity || null,
        culture_score: content_score?.culture || null,
        visual_identity_score: content_score?.visual_identity || null,
        result: result || null,
        caption: caption || null,
        source: 'scanner',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, scan: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/media/scans?id=xxx
export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id provided' }, { status: 400 })

    const { error } = await supabase
      .from('media_scans')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
