import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// GET — fetch all tracks in the user's library (RLS-scoped)
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { data, error } = await supabase
      .from('dj_tracks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error
    return NextResponse.json({ tracks: data || [] })
  } catch (err: any) {
    return NextResponse.json({ tracks: [], error: err.message }, { status: 500 })
  }
}

// DELETE — remove a track
export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { id } = await req.json()
    const { error } = await supabase.from('dj_tracks').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — update a track's fields
export async function PATCH(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
  try {
    const { id, ...fields } = await req.json()
    delete (fields as any).user_id
    const { data, error } = await supabase.from('dj_tracks').update(fields).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ track: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — import tracks (from Rekordbox or manual add)
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase } = gate
  try {
    const body = await req.json()
    const tracks = Array.isArray(body.tracks) ? body.tracks : [body]

    const rows = tracks.map((t: any) => ({
      user_id: user.id,
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
      discovered_via: t.discovered_via || null,
      spotify_url: t.spotify_url || null,
      album_art: t.album_art || null,
      // Rekordbox hot cues — imported free for all tiers (user's own work).
      // Essentia-derived cues are merged in separately via the Audio DNA path.
      ...(Array.isArray(t.hot_cues) && t.hot_cues.length ? { hot_cues: t.hot_cues } : {}),
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
