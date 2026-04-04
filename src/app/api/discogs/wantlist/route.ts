import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET — fetch all wantlist items
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('discogs_wantlist')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ items: data || [] })
  } catch (err: any) {
    return NextResponse.json({ items: [], error: err.message }, { status: 200 })
  }
}

// POST — add to wantlist
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('discogs_wantlist')
      .upsert({
        discogs_release_id: String(body.discogs_release_id),
        title: body.title || '',
        artist: body.artist || '',
        label_name: body.label_name || null,
        year: body.year || null,
        thumb: body.thumb || null,
        discogs_url: body.discogs_url || null,
        dig_type: body.dig_type || null,
        source_track_id: body.source_track_id || null,
      }, { onConflict: 'discogs_release_id' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, item: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE — remove from wantlist
export async function DELETE(req: NextRequest) {
  try {
    const { discogs_release_id } = await req.json()
    const { error } = await supabase
      .from('discogs_wantlist')
      .delete()
      .eq('discogs_release_id', String(discogs_release_id))

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
