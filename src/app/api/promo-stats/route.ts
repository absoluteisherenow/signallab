import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const blast_id = searchParams.get('blast_id')

  if (blast_id) {
    // Single blast with full stats
    const { data: blast, error: blastError } = await supabase
      .from('promo_blasts')
      .select('*')
      .eq('id', blast_id)
      .single()

    if (blastError || !blast) {
      return NextResponse.json({ error: blastError?.message || 'Blast not found' }, { status: 404 })
    }

    const { data: links } = await supabase
      .from('promo_tracked_links')
      .select('*, dj_contacts(name, instagram_handle)')
      .eq('blast_id', blast_id)
      .order('clicks', { ascending: false })

    const { data: reactions } = await supabase
      .from('promo_reactions')
      .select('*, dj_contacts(name, instagram_handle)')
      .eq('blast_id', blast_id)

    const totalClicks = links?.reduce((sum, l) => sum + (l.clicks || 0), 0) || 0
    const uniqueOpens = links?.filter(l => (l.clicks || 0) > 0).length || 0
    const contactCount = links?.length || 0
    const openRate = contactCount > 0 ? Math.round((uniqueOpens / contactCount) * 1000) / 10 : 0

    const reactionCounts: Record<string, number> = { playing: 0, liked: 0, replied: 0, none: 0 }
    reactions?.forEach(r => {
      if (reactionCounts[r.reaction] !== undefined) reactionCounts[r.reaction]++
    })

    const formattedLinks = links?.map(l => ({
      code: l.code,
      clicks: l.clicks || 0,
      contact: l.dj_contacts
        ? { name: l.dj_contacts.name, handle: l.dj_contacts.instagram_handle }
        : null,
      first_clicked_at: l.first_clicked_at ?? null,
    })) ?? []

    const formattedReactions = reactions?.map(r => ({
      reaction: r.reaction,
      contact: r.dj_contacts
        ? { name: r.dj_contacts.name, handle: r.dj_contacts.instagram_handle }
        : null,
      notes: r.notes ?? null,
      screenshot_url: r.screenshot_url ?? null,
    })) ?? []

    return NextResponse.json({
      blast,
      links: formattedLinks,
      reactions: formattedReactions,
      summary: {
        totalClicks,
        uniqueOpens,
        openRate,
        reactions: reactionCounts,
      },
    })
  }

  // All blasts list view
  const { data: blasts, error: blastsError } = await supabase
    .from('promo_blasts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (blastsError) {
    return NextResponse.json({ error: blastsError.message }, { status: 500 })
  }

  const blastsWithStats = await Promise.all(
    (blasts ?? []).map(async blast => {
      const { data: links } = await supabase
        .from('promo_tracked_links')
        .select('clicks')
        .eq('blast_id', blast.id)

      const { data: reactions } = await supabase
        .from('promo_reactions')
        .select('id')
        .eq('blast_id', blast.id)

      const totalClicks = links?.reduce((sum, l) => sum + (l.clicks || 0), 0) || 0
      const uniqueOpens = links?.filter(l => (l.clicks || 0) > 0).length || 0
      const reactionCount = reactions?.length || 0

      return {
        ...blast,
        totalClicks,
        uniqueOpens,
        reactionCount,
      }
    })
  )

  return NextResponse.json({ blasts: blastsWithStats })
}

export async function POST(req: NextRequest) {
  const { blast_id, phase, play_count } = await req.json()

  if (!blast_id || !phase) {
    return NextResponse.json({ error: 'blast_id and phase required' }, { status: 400 })
  }

  if (phase !== 'before' && phase !== 'after') {
    return NextResponse.json({ error: 'phase must be "before" or "after"' }, { status: 400 })
  }

  const field = phase === 'before' ? 'sc_plays_before' : 'sc_plays_after'

  const { error } = await supabase
    .from('promo_blasts')
    .update({ [field]: play_count || 0 })
    .eq('id', blast_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
