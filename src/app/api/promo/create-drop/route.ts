import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST — create a new hosted drop (blast row + per-contact tracked links).
// No DMs sent. Tracks are uploaded separately via /api/promo/upload.
export async function POST(req: NextRequest) {
  try {
    const { title, artist, label, message, contact_ids } = await req.json()
    if (!title || !contact_ids?.length) {
      return NextResponse.json({ error: 'title and contact_ids required' }, { status: 400 })
    }

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

    const { data: blast, error: blastErr } = await supabase
      .from('promo_blasts')
      .insert({
        track_url: null,
        track_title: title,
        track_artist: artist || null,
        track_label: label || null,
        message: message || '',
        contact_count: contact_ids.length,
      })
      .select()
      .single()

    if (blastErr || !blast) {
      return NextResponse.json({ error: blastErr?.message || 'Failed to create drop' }, { status: 500 })
    }

    const links: { contact_id: string; code: string; url: string }[] = []
    for (const contact_id of contact_ids) {
      const code = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
      const url = `${APP_URL}/go/${code}`
      await supabase.from('promo_tracked_links').insert({
        blast_id: blast.id,
        contact_id,
        code,
        destination_url: url,
      })
      links.push({ contact_id, code, url })
    }

    return NextResponse.json({ blast_id: blast.id, links })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
