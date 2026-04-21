import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

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

    // Increment crowd_hits and set crowd_reaction for each standout track
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
        // Mark crowd_reaction as standout
        await supabase
          .from('dj_tracks')
          .update({ crowd_reaction: 'crowd_standout' })
          .eq('id', trackId)
      }
    }

    // Write debrief back to linked dj_sets record
    let setId: string | null = null
    const { data: linkedSet } = await supabase
      .from('dj_sets')
      .select('id, notes')
      .eq('gig_id', gigId)
      .limit(1)
      .single()

    if (linkedSet) {
      setId = linkedSet.id
      const gigDate = gig.date ? new Date(gig.date).toISOString().slice(0, 10) : 'unknown date'
      const postGigEntry = `Post-gig ${gigDate}: ${rating}/5 — ${notes || 'no notes'}`
      const updatedNotes = linkedSet.notes
        ? `${linkedSet.notes}\n\n${postGigEntry}`
        : postGigEntry
      await supabase
        .from('dj_sets')
        .update({ notes: updatedNotes })
        .eq('id', linkedSet.id)
    }

    // Generate post-gig caption through the brain — artist identity, voice,
    // and casing rules come from ctx so we don't need to load artist_settings.
    let caption = ''
    try {
      const result = await callClaudeWithBrain({
        userId,
        task: 'gig.recap',
        model: 'claude-sonnet-4-6',
        max_tokens: 150,
        userMessage: `Post-gig Instagram caption. Venue: ${gig.venue}. Rating: ${rating}/5. Notes: ${notes || 'none'}.`,
        taskInstruction: 'Write a short post-gig Instagram caption. Under 20 words, lowercase where natural, no hashtags, honest and direct. Output ONLY the caption text — no preamble.',
      })
      caption = result.text.trim()
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
      }])
    }

    // Notify artist
    await createNotification({
      type: 'system',
      title: `Debrief saved — ${gig.title || gig.venue}`,
      message: caption ? 'Caption draft ready in Broadcast.' : 'Debrief logged.',
      href: '/broadcast',
      gig_id: gigId,
    })

    return NextResponse.json({ success: true, caption, set_id: setId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
