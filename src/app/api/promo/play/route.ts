import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function hashIP(ip: string): Promise<string> {
  const salt = process.env.PROMO_STREAM_SECRET || 'fallback-salt'
  const data = new TextEncoder().encode(ip + salt)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
}

// POST — start a new play session. Returns { play_id }.
export async function POST(req: NextRequest) {
  try {
    const { track_id, link_id } = await req.json()
    if (!track_id) return NextResponse.json({ error: 'track_id required' }, { status: 400 })

    const ua = req.headers.get('user-agent') || ''
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || ''
    const ip_hash = ip ? await hashIP(ip) : null

    const { data, error } = await supabase
      .from('promo_plays')
      .insert({
        track_id,
        link_id: link_id || null,
        started_at: new Date().toISOString(),
        user_agent: ua.slice(0, 200),
        ip_hash,
      })
      .select('id')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'insert failed' }, { status: 500 })
    }

    return NextResponse.json({ play_id: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — update a play session with progress + optional final flush.
export async function PATCH(req: NextRequest) {
  try {
    const { play_id, furthest_sec, duration_played_sec, completed } = await req.json()
    if (!play_id) return NextResponse.json({ error: 'play_id required' }, { status: 400 })

    const patch: Record<string, any> = {}
    if (typeof furthest_sec === 'number') patch.furthest_sec = furthest_sec
    if (typeof duration_played_sec === 'number') patch.duration_played_sec = duration_played_sec
    if (completed) {
      patch.completed = true
      patch.stopped_at = new Date().toISOString()
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true })
    }

    const { error } = await supabase
      .from('promo_plays')
      .update(patch)
      .eq('id', play_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
