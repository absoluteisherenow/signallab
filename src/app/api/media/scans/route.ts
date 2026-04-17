import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/media/scans?userId=xxx&limit=50
// Returns scan history for the user, newest first
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)

    let query = supabase
      .from('media_scans')
      .select('id, file_name, composite_score, result, caption, thumbnail_url, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (userId && userId !== 'dev-user') {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ scans: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, scans: [] }, { status: 500 })
  }
}

// POST /api/media/scans
// Saves a completed scan result to media_scans
export async function POST(req: NextRequest) {
  try {
    const {
      userId,
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
        user_id: userId || null,
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
// Deletes a single scan record
export async function DELETE(req: NextRequest) {
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
