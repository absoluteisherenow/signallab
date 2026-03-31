import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { rating, notes, standout_track_ids } = await req.json()
    const gigId = params.id

    // Fetch gig for context
    const { data: gig } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', gigId)
      .single()

    if (!gig) return NextResponse.json({ error: 'Gig not found' }, { status: 404 })

    // Save debrief to gig
    await supabase
      .from('gigs')
      .update({ debrief_rating: rating, debrief_notes: notes })
      .eq('id', gigId)

    // Increment crowd_hits for each standout track
    if (standout_track_ids?.length) {
      for (const trackId of standout_track_ids) {
        const { error: rpcError } = await supabase.rpc('increment_crowd_hits', { track_id: trackId })
        if (rpcError) {
          // Fallback: manual increment
          const { data: track } = await supabase
            .from('dj_tracks')
            .select('crowd_hits')
            .eq('id', trackId)
            .single()
          if (track) {
            await supabase
              .from('dj_tracks')
              .update({ crowd_hits: (track.crowd_hits || 0) + 1 })
              .eq('id', trackId)
          }
        }
      }
    }

    // Generate post-gig caption via Claude
    let caption = ''
    try {
      const { data: settings } = await supabase
        .from('artist_settings')
        .select('artist_name')
        .single()
      const artistName = settings?.artist_name || 'Artist'

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `Write a short post-gig Instagram caption for ${artistName} after playing at ${gig.venue}. Rating: ${rating}/5. Notes: ${notes || 'none'}. Keep it under 20 words, lowercase, no hashtags, honest and direct.`,
          }],
        }),
      })
      const aiData = await aiRes.json()
      caption = aiData.content?.[0]?.text?.trim() || ''
    } catch {
      caption = `${gig.venue} — done.`
    }

    // Save caption draft to scheduled_posts
    if (caption) {
      await supabase.from('scheduled_posts').insert([{
        caption,
        platform: 'instagram',
        status: 'draft',
        gig_id: gigId,
        featured_track: null,
        format_type: 'Raw',
      }]).catch(() => {})
    }

    // Notify artist
    await createNotification({
      type: 'system',
      title: `Debrief saved — ${gig.title || gig.venue}`,
      message: caption ? 'Caption draft ready in Broadcast.' : 'Debrief logged.',
      href: '/broadcast',
      gig_id: gigId,
    })

    return NextResponse.json({ success: true, caption })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
