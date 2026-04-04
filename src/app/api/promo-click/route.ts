import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET — fetch link data by code (for the promo page)
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const { data: link } = await supabase
    .from('promo_tracked_links')
    .select('id, code, destination_url, clicks, first_clicked_at, blast_id, contact_id')
    .eq('code', code)
    .single()

  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

  // Get blast info for track metadata
  const { data: blast } = await supabase
    .from('promo_blasts')
    .select('track_title, track_artist, track_url, track_label')
    .eq('id', link.blast_id)
    .single()

  // Get contact name
  const { data: contact } = await supabase
    .from('dj_contacts')
    .select('name')
    .eq('id', link.contact_id)
    .single()

  // Log the click
  const now = new Date().toISOString()
  await supabase.from('promo_tracked_links').update({
    clicks: (link.clicks || 0) + 1,
    first_clicked_at: link.first_clicked_at || now,
    last_clicked_at: now,
  }).eq('id', link.id)

  return NextResponse.json({
    link: {
      code: link.code,
      destination_url: link.destination_url,
      blast_id: link.blast_id,
      contact_id: link.contact_id,
    },
    track: blast ? {
      title: blast.track_title,
      artist: blast.track_artist,
      url: blast.track_url,
      label: blast.track_label,
    } : null,
    contact_name: contact?.name || null,
  })
}

// POST — submit reaction and unlock the download
export async function POST(req: NextRequest) {
  const { code, reaction } = await req.json()
  if (!code || !reaction) return NextResponse.json({ error: 'code and reaction required' }, { status: 400 })

  const { data: link } = await supabase
    .from('promo_tracked_links')
    .select('id, destination_url, blast_id, contact_id')
    .eq('code', code)
    .single()

  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

  // Save reaction
  await supabase.from('promo_reactions').upsert({
    blast_id: link.blast_id,
    contact_id: link.contact_id,
    reaction,
  }, { onConflict: 'blast_id,contact_id' })

  return NextResponse.json({ ok: true, destination_url: link.destination_url })
}
