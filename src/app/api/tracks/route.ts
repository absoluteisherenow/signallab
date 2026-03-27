import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET — fetch all tracks in the user's library
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('dj_tracks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error
    return NextResponse.json({ tracks: data || [] })
  } catch (err: any) {
    return NextResponse.json({ tracks: [], error: err.message }, { status: 200 })
  }
}

// POST — import tracks (from Rekordbox or manual add)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const tracks = Array.isArray(body.tracks) ? body.tracks : [body]

    const rows = tracks.map((t: any) => ({
      title: t.title || t.name || '',
      artist: t.artist || '',
      bpm: t.bpm || 0,
      key: t.key || '',
      camelot: t.camelot || '',
      energy: t.energy || 0,
      genre: t.genre || '',
      duration: t.duration || '',
      notes: t.notes || '',
      moment_type: t.moment_type || '',
      position_score: t.position_score || '',
      mix_in: t.mix_in || '',
      mix_out: t.mix_out || '',
      crowd_reaction: t.crowd_reaction || '',
      producer_style: t.producer_style || '',
      similar_to: t.similar_to || '',
      play_count: t.play_count || t.playCount || 0,
      rating: t.rating || 0,
      source: t.source || 'manual',
      enriched: t.enriched || false,
    }))

    const { data, error } = await supabase
      .from('dj_tracks')
      .upsert(rows, { onConflict: 'title,artist' })
      .select()

    if (error) throw error
    return NextResponse.json({ success: true, count: data?.length || rows.length, tracks: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
