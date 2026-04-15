import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function generateRecap(gig: any, posts: any[], performance: any[], sets: any) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const recapPrompt = `Generate a brief gig recap for the artist. Use ONLY the data provided — never invent statistics.

Gig: ${gig.title} at ${gig.venue}, ${gig.location}
Date: ${gig.date}

${posts?.length ? `Posts created: ${posts.length}` : 'No posts created for this gig'}
${performance?.length ? `Post performance:\n${performance.map((p: any) => `- ${p.caption?.slice(0, 50)}... | ${p.likes || 0} likes, ${p.comments || 0} comments`).join('\n')}` : ''}
${sets ? `Set played: ${sets.name || 'Unnamed'} (${(sets.dj_tracks || []).length} tracks)` : 'No set linked'}

Write a 2-3 sentence recap in a warm, professional tone. Include:
- A headline stat if data exists (e.g. reach, engagement)
- One actionable suggestion for follow-up content
- If no performance data, suggest posting a recap/thank you

Do NOT mention AI, automation, or how this was generated. Sound like a knowledgeable music industry professional.
Return JSON: { "title": "short title", "message": "the recap text", "suggested_post": "optional follow-up caption" }`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: recapPrompt }],
      }),
    })

    const data = await response.json()
    if (!response.ok) return null

    const text = data.content?.[0]?.text || ''
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    return JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
}

// Triggered daily at 23:00 via Vercel Cron
// Finds gigs that finished in the last 24 hours → fires post-gig debrief + performance recap
export async function GET() {
  try {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    const todayStr = new Date().toISOString().slice(0, 10)

    // Find gigs where date was yesterday
    const { data: yesterdayGigs, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('date', yesterdayStr)
      .neq('status', 'cancelled')

    if (error) throw error
    if (!yesterdayGigs?.length) return NextResponse.json({ ran: true, processed: 0, recaps: [] })

    const results: any[] = []

    for (const gig of yesterdayGigs) {
      try {
        // Check we haven't already sent a debrief for this gig
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('gig_id', gig.id)
          .eq('type', 'system')
          .ilike('title', '%debrief%')
          .limit(1)

        if (!existing?.length) {
          // Send the standard debrief prompt notification
          await createNotification({
            type: 'system',
            title: `How did it go? — ${gig.title}`,
            message: `${gig.venue} · ${new Date(gig.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · Add notes, rate the show, or chase the invoice.`,
            href: `/gigs/${gig.id}/debrief`,
            gig_id: gig.id,
            sendEmail: false,
          })
        }

        // If invoice exists and is still pending, send a reminder notification
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id, status')
          .eq('gig_id', gig.id)
          .eq('status', 'pending')
          .single()

        if (invoice) {
          await createNotification({
            type: 'invoice_overdue',
            title: `Chase payment — ${gig.title}`,
            message: `Invoice still pending after the show. Send a reminder to ${gig.promoter_email || 'promoter'}.`,
            href: '/business/finances',
            gig_id: gig.id,
          })
        }

        // --- Performance Recap ---
        // Check we haven't already sent a recap for this gig
        const { data: existingRecap } = await supabase
          .from('notifications')
          .select('id')
          .eq('gig_id', gig.id)
          .eq('type', 'system')
          .ilike('title', '%recap%')
          .limit(1)

        if (existingRecap?.length) {
          results.push({ gig_id: gig.id, title: gig.title, status: 'recap_already_sent' })
          continue
        }

        // Gather real data for recap
        const [postsResult, performanceResult, setsResult] = await Promise.all([
          // Posts related to this gig
          supabase
            .from('scheduled_posts')
            .select('*')
            .eq('gig_id', gig.id),

          // Post performance data around the gig date
          supabase
            .from('post_performance')
            .select('*')
            .gte('taken_at', yesterdayStr)
            .lte('taken_at', todayStr),

          // Linked set data
          supabase
            .from('dj_sets')
            .select('*, dj_tracks(*)')
            .eq('gig_id', gig.id)
            .limit(1)
            .maybeSingle(),
        ])

        const posts = postsResult.data || []
        const performance = performanceResult.data || []
        const sets = setsResult.data

        // Generate recap with Claude Sonnet
        const recap = await generateRecap(gig, posts, performance, sets)

        if (recap) {
          // Create recap notification
          await createNotification({
            type: 'system',
            title: recap.title,
            message: recap.message,
            href: `/gigs/${gig.id}`,
            gig_id: gig.id,
          })

          // Save suggested post as draft
          if (recap.suggested_post) {
            await supabase.from('scheduled_posts').insert([{
              gig_id: gig.id,
              platform: 'instagram',
              caption: recap.suggested_post,
              format: 'story',
              status: 'draft',
              scheduled_at: new Date().toISOString(),
              notes: `Auto-generated post-gig recap for ${gig.title}`,
            }])
          }

          results.push({
            gig_id: gig.id,
            title: gig.title,
            status: 'recap_sent',
            recap_title: recap.title,
            has_suggested_post: !!recap.suggested_post,
          })
        } else {
          results.push({ gig_id: gig.id, title: gig.title, status: 'recap_generation_failed' })
        }
      } catch (gigErr: any) {
        // Per-gig error handling — don't let one failure block others
        results.push({ gig_id: gig.id, title: gig.title, status: 'error', error: gigErr.message })
      }
    }

    return NextResponse.json({
      ran: true,
      processed: yesterdayGigs.length,
      recaps: results,
    })
  } catch (err: any) {
    await createNotification({ type: 'cron_error', title: 'Post-gig agent failed', message: err instanceof Error ? err.message : 'Unknown error' })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Support POST as well (Vercel crons use GET, but allow manual triggers via POST)
export async function POST() {
  return GET()
}
