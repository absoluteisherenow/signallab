import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SKILLS_CONTENT_PLAN, SKILL_INSTAGRAM_GROWTH } from '@/lib/skillPrompts'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// On-demand content plan: user picks N posts, brain picks the strongest
// based on real engagement data, their gigs, releases, and voice.
// Brain-wired: artist identity, voice, casing, active mission all injected
// from ctx — route just assembles the period-specific evidence.

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
    const { count = 5, period = 'week', weekOffset = 0, monthOffset = 0 } = await req.json()

    const today = new Date()

    let startDate: Date, endDate: Date
    if (period === 'week') {
      startDate = new Date(today)
      startDate.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7)
      startDate.setHours(0, 0, 0, 0)
      endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 6)
    } else {
      startDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
      endDate = new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 0)
    }

    const q = async (fn: () => PromiseLike<any>, fallback: any = []) => { try { return await fn() } catch { return fallback } }

    const [gigs, releases, topPosts, artistProfiles, tracks] = await Promise.all([
      q(async () => { const r = await supabase.from('gigs').select('title, venue, location, date, status').eq('user_id', userId).gte('date', startDate.toISOString().split('T')[0]).lte('date', endDate.toISOString().split('T')[0]).neq('status', 'cancelled').order('date'); return r.data || [] }),
      q(async () => { const r = await supabase.from('releases').select('title, type, release_date, label, notes').eq('user_id', userId).gte('release_date', new Date(startDate.getTime() - 14 * 86400000).toISOString().split('T')[0]).lte('release_date', endDate.toISOString().split('T')[0]).order('release_date'); return r.data || [] }),
      q(async () => { const r = await supabase.from('post_performance').select('artist_name, platform, caption, format, actual_likes, actual_comments, estimated_score, context').order('estimated_score', { ascending: false }).limit(20); return r.data || [] }),
      q(async () => { const r = await supabase.from('artist_profiles').select('name, genre, lowercase_pct, short_caption_pct, no_hashtags_pct, style_rules').not('style_rules', 'is', null).limit(4); return r.data || [] }),
      q(async () => { const r = await supabase.from('dj_tracks').select('title, artist, bpm, key, moment_type').eq('user_id', userId).limit(10).order('created_at', { ascending: false }); return r.data || [] }),
    ])

    const releaseTimeline = releases.flatMap((r: any) => {
      const rd = new Date(r.release_date)
      const lines = [`RELEASE DAY ${r.release_date}: "${r.title}" (${r.type})${r.label ? ` on ${r.label}` : ''}`]
      const tease7 = new Date(rd); tease7.setDate(rd.getDate() - 7)
      const tease3 = new Date(rd); tease3.setDate(rd.getDate() - 3)
      if (tease7 >= startDate) lines.push(`TEASE OPPORTUNITY ${tease7.toISOString().split('T')[0]}: 7 days to "${r.title}"`)
      if (tease3 >= startDate) lines.push(`TEASE OPPORTUNITY ${tease3.toISOString().split('T')[0]}: 3 days to "${r.title}"`)
      return lines
    }).join('\n')

    let engagementEvidence = 'No engagement data yet — plan based on lane voice patterns.'
    const parts: string[] = []
    if (topPosts.length >= 2) {
      const reelCount = topPosts.filter((p: any) => p.format === 'reel').length
      const shortCount = topPosts.filter((p: any) => (p.caption || '').split(' ').length < 10).length
      parts.push(`Lane benchmarks from top posts (${topPosts.length}):
- ${reelCount > topPosts.length / 2 ? 'Reels dominate' : 'Photo/carousel posts perform well'}
- ${shortCount > topPosts.length / 2 ? 'Short captions dominate' : 'Longer captions work'}
${topPosts.slice(0, 6).map((p: any) => `  ${p.artist_name} ${p.platform} ${p.format} — ${p.actual_likes || 0}L/${p.actual_comments || 0}C: "${(p.caption || '').slice(0, 80)}"`).join('\n')}`)
    }
    if (parts.length > 0) engagementEvidence = parts.join('\n\n')

    const voiceBrief = artistProfiles.length > 0
      ? artistProfiles.map((a: any) => `${a.name}: ${a.style_rules}`).join('\n\n')
      : 'No reference artists scanned yet — write in minimal electronic music tone: lowercase, no hashtags, short captions.'

    const trackList = tracks.length > 0
      ? `\nRECENT TRACKS IN LIBRARY (suggest as featured_track where relevant):\n${tracks.map((t: any) => `- "${t.title}" by ${t.artist}${t.bpm ? ` ${t.bpm}BPM` : ''}${t.moment_type ? ` (${t.moment_type})` : ''}`).join('\n')}`
      : ''

    const periodDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
    const availableDates: string[] = []
    for (let i = 0; i < periodDays; i++) {
      const d = new Date(startDate)
      d.setDate(startDate.getDate() + i)
      availableDates.push(d.toISOString().split('T')[0])
    }

    const taskInstruction = `You are a social media strategist for electronic music. Select and write the ${count} highest-impact posts for the given period based on real engagement evidence. Every format decision must be justified by actual data. Write captions strictly in the artist's voice (from identity above) — lowercase, no emoji, no exclamation marks, short and evocative (1-15 words). The caption must sound like it came from the artist, not a social media manager. NEVER quote engagement numbers from reference artists in your notes — only cite lane-wide patterns. If there is no evidence, say "format chosen based on genre norms" rather than inventing figures.

${SKILLS_CONTENT_PLAN}

${SKILL_INSTAGRAM_GROWTH}

Return ONLY valid JSON array (no markdown fences). Each post MUST include:
- "scheduled_at": ISO datetime (10am on the target date, e.g. "${availableDates[0]}T10:00:00.000Z")
- "day": formatted date e.g. "Mon 7 Apr"
- "platform": "instagram" | "tiktok" | "threads"
- "format": "post" | "reel" | "carousel" | "story"
- "caption": in lane voice
- "featured_track": track name if music selection is relevant (null if not)
- "notes": cite the actual engagement evidence for why this format/timing was chosen`

    const userMessage = `Plan the ${count} STRONGEST posts covering ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}.

GIGS IN PERIOD:
${gigs.length ? gigs.map((g: any) => `- ${g.date}: ${g.title} at ${g.venue}, ${g.location}`).join('\n') : 'None confirmed'}

RELEASE CALENDAR:
${releaseTimeline || 'No releases in this period'}

${engagementEvidence}

REFERENCE VOICE PROFILES:
${voiceBrief}
${trackList}

Prioritise: release day, tease windows, gig day/eve, then fill with top-performing formats from the engagement data.`

    const result = await callClaudeWithBrain({
      userId,
      task: 'gig.content',
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      userMessage,
      taskInstruction,
      runPostCheck: false,
    })

    let posts: any[] = []
    try {
      posts = JSON.parse(result.text.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({ success: false, error: 'Parse failed', raw: result.text }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      posts,
      meta: {
        period, count,
        dateRange: `${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`,
        dataUsed: {
          engagementPosts: topPosts.length,
          artistProfiles: artistProfiles.length,
          gigs: gigs.length,
          releases: releases.length,
          tracksAvailable: tracks.length,
        },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
