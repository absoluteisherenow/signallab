import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/promo/drop-summary?blast_id=...
// Returns aggregated listen stats for a hosted drop.
export async function GET(req: NextRequest) {
  const blast_id = req.nextUrl.searchParams.get('blast_id')
  if (!blast_id) return NextResponse.json({ error: 'blast_id required' }, { status: 400 })

  const { data: tracks } = await supabase
    .from('promo_tracks')
    .select('id, title, artist, duration_sec, waveform_peaks, position')
    .eq('blast_id', blast_id)
    .order('position', { ascending: true })

  const trackIds = (tracks || []).map(t => t.id)

  let plays: Array<{ track_id: string; duration_played_sec: number | null; furthest_sec: number | null; completed: boolean; link_id: string | null; started_at: string }> = []
  if (trackIds.length) {
    const { data } = await supabase
      .from('promo_plays')
      .select('track_id, duration_played_sec, furthest_sec, completed, link_id, started_at')
      .in('track_id', trackIds)
    plays = data || []
  }

  const totalPlays = plays.length
  const perTrack = (tracks || []).map(t => {
    const tp = plays.filter(p => p.track_id === t.id)
    const avgFurthest = tp.length > 0
      ? tp.reduce((s, p) => s + (Number(p.furthest_sec) || 0), 0) / tp.length
      : 0
    const avgPct = (t.duration_sec && t.duration_sec > 0)
      ? Math.min(100, Math.round((avgFurthest / Number(t.duration_sec)) * 100))
      : 0
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration_sec: t.duration_sec,
      waveform_peaks: t.waveform_peaks,
      plays: tp.length,
      uniqueListeners: new Set(tp.map(p => p.link_id).filter(Boolean)).size,
      avgPct,
      completionRate: tp.length > 0 ? Math.round((tp.filter(p => p.completed).length / tp.length) * 100) : 0,
      furthestPoints: tp.map(p => Number(p.furthest_sec) || 0),
    }
  })

  return NextResponse.json({
    blast_id,
    trackCount: tracks?.length || 0,
    totalPlays,
    perTrack,
  })
}
