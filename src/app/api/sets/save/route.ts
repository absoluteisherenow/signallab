import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { name, tracks, imageUrl, source } = await req.json()

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: 'No tracks provided' }, { status: 400 })
    }

    // 1. Add any unmatched tracks to dj_tracks library
    const newTracks = tracks.filter((t: any) => !t.library_match_id)
    if (newTracks.length > 0) {
      const rows = newTracks.map((t: any) => ({
        title: t.title || '',
        artist: t.artist || '',
        bpm: t.bpm || 0,
        key: t.key || '',
        camelot: '',
        energy: 0,
        genre: '',
        duration: '',
        notes: '',
        moment_type: '',
        position_score: '',
        mix_in: '',
        mix_out: '',
        crowd_reaction: '',
        producer_style: '',
        similar_to: '',
        source: source || 'screenshot-import',
      }))

      await supabase
        .from('dj_tracks')
        .upsert(rows, { onConflict: 'title,artist' })
        .select()
    }

    // 2. Create the dj_set entry
    const setTracks = tracks.map((t: any, i: number) => ({
      position: i + 1,
      title: t.title,
      artist: t.artist,
      bpm: t.bpm || 0,
      key: t.key || '',
      camelot: '',
      energy: 0,
      genre: '',
      duration: '',
      notes: '',
      analysed: false,
      moment_type: '',
      position_score: '',
      mix_in: '',
      mix_out: '',
      crowd_reaction: '',
      similar_to: '',
      producer_style: '',
      transition_note: '',
      compatibility: 0,
      flow_score: 0,
    }))

    const setData = {
      name: name || `Screenshot import — ${new Date().toLocaleDateString('en-GB')}`,
      venue: '',
      slot_type: '',
      tracks: JSON.stringify(setTracks),
      narrative: '',
      screenshot_url: imageUrl || null,
      created_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('dj_sets')
      .insert(setData)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, set: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
