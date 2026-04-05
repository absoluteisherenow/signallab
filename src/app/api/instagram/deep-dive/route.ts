import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function fetchIG(url: string, timeoutMs = 8000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

// Pull the user's own Instagram data + run Opus deep dive
export async function POST() {
  try {
    // 1. Get connected account
    const { data: accounts } = await supabase
      .from('connected_social_accounts')
      .select('access_token, platform_user_id, handle, token_expiry')
      .eq('platform', 'instagram')
      .limit(1)

    if (!accounts?.length || !accounts[0].access_token) {
      return NextResponse.json({ success: false, error: 'No Instagram account connected' }, { status: 400 })
    }

    const { access_token, platform_user_id, handle } = accounts[0]

    // 2. Fetch full profile — bio, followers, media count
    const profileRes = await fetchIG(
      `https://graph.instagram.com/v25.0/${platform_user_id}?fields=username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website&access_token=${access_token}`
    )
    const profile = profileRes.ok ? await profileRes.json() : {}

    // 3. Fetch recent media with engagement
    const mediaRes = await fetchIG(
      `https://graph.instagram.com/v25.0/${platform_user_id}/media?fields=id,caption,media_type,timestamp,permalink,like_count,comments_count,media_url,thumbnail_url&limit=30&access_token=${access_token}`
    )
    if (!mediaRes.ok) {
      return NextResponse.json({ success: false, error: 'Failed to fetch media' }, { status: 502 })
    }
    const mediaData = await mediaRes.json()
    const posts: any[] = mediaData.data || []

    // 4. Fetch private insights for each post (saves, reach, impressions)
    const insightMetrics: Record<string, string[]> = {
      IMAGE: ['impressions', 'reach', 'saved'],
      VIDEO: ['impressions', 'reach', 'saved', 'video_views'],
      CAROUSEL_ALBUM: ['impressions', 'reach', 'saved'],
      REELS: ['impressions', 'reach', 'saved', 'video_views'],
    }

    const enrichedPosts: any[] = []
    for (let i = 0; i < posts.length; i += 10) {
      const batch = posts.slice(i, i + 10)
      const results = await Promise.allSettled(
        batch.map(async (post) => {
          const metrics = insightMetrics[post.media_type] || ['impressions', 'reach', 'saved']
          try {
            const res = await fetchIG(
              `https://graph.instagram.com/v25.0/${post.id}/insights?metric=${metrics.join(',')}&access_token=${access_token}`,
              5000
            )
            if (!res.ok) return { ...post, saves: 0, reach: 0, impressions: 0 }
            const data = await res.json()
            const byName: Record<string, number> = {}
            ;(data.data || []).forEach((m: any) => { byName[m.name] = m.values?.[0]?.value ?? m.value ?? 0 })
            return {
              ...post,
              saves: byName.saved ?? 0,
              reach: byName.reach ?? 0,
              impressions: byName.impressions ?? 0,
              video_views: byName.video_views ?? undefined,
            }
          } catch {
            return { ...post, saves: 0, reach: 0, impressions: 0 }
          }
        })
      )
      enrichedPosts.push(...results.filter(r => r.status === 'fulfilled').map((r: any) => r.value))
      if (i + 10 < posts.length) await new Promise(r => setTimeout(r, 500))
    }

    // 5. Sort by real engagement (saves weighted 5x, comments 3x)
    const sorted = [...enrichedPosts].sort((a, b) => {
      const scoreA = (a.saves * 5) + ((a.comments_count || 0) * 3) + (a.like_count || 0)
      const scoreB = (b.saves * 5) + ((b.comments_count || 0) * 3) + (b.like_count || 0)
      return scoreB - scoreA
    })

    // 6. Get image URLs for top posts
    const topImages = sorted
      .filter(p => p.media_url || p.thumbnail_url)
      .slice(0, 8)
      .map(p => p.media_url || p.thumbnail_url)

    // 7. Build comprehensive data for Opus
    const postSummary = enrichedPosts.map((p, i) => {
      const realScore = (p.saves * 5) + ((p.comments_count || 0) * 3) + (p.like_count || 0)
      return [
        `${i + 1}. "${p.caption || '(no caption)'}"`,
        `   ${p.like_count || 0} likes, ${p.comments_count || 0} comments, ${p.saves} saves`,
        `   Reach: ${p.reach}, Impressions: ${p.impressions}${p.video_views ? `, Views: ${p.video_views}` : ''}`,
        `   Type: ${p.media_type} | Engagement score: ${realScore}`,
        `   Posted: ${p.timestamp}`,
      ].join('\n')
    }).join('\n\n')

    const avgSaves = Math.round(enrichedPosts.reduce((s, p) => s + p.saves, 0) / (enrichedPosts.length || 1))
    const avgReach = Math.round(enrichedPosts.reduce((s, p) => s + p.reach, 0) / (enrichedPosts.length || 1))
    const avgLikes = Math.round(enrichedPosts.reduce((s, p) => s + (p.like_count || 0), 0) / (enrichedPosts.length || 1))
    const avgComments = Math.round(enrichedPosts.reduce((s, p) => s + (p.comments_count || 0), 0) / (enrichedPosts.length || 1))
    const saveRate = avgReach > 0 ? ((avgSaves / avgReach) * 100).toFixed(1) : 'unknown'
    const engagementRate = avgReach > 0 ? (((avgLikes + avgComments + avgSaves) / avgReach) * 100).toFixed(1) : 'unknown'

    // 8. Opus deep dive — images + private data
    const content: any[] = []

    for (const url of topImages) {
      content.push({
        type: 'image',
        source: { type: 'url', url },
      })
    }

    content.push({
      type: 'text',
      text: `You are doing a DEEP analysis of this electronic music artist's OWN Instagram account for their personal voice + content profile. This is THEIR account — you have private data (saves, reach, impressions) that is never publicly visible.

PROFILE:
Username: ${profile.username || handle || 'unknown'}
Name: ${profile.name || 'unknown'}
Bio: ${profile.biography || 'none'}
Followers: ${(profile.followers_count || 0).toLocaleString()}
Following: ${(profile.follows_count || 0).toLocaleString()}
Total posts: ${profile.media_count || enrichedPosts.length}
Website: ${profile.website || 'none'}

PRIVATE ENGAGEMENT STATS (not visible to anyone else):
Average saves per post: ${avgSaves}
Average reach per post: ${avgReach}
Average likes: ${avgLikes}, comments: ${avgComments}
Save rate: ${saveRate}%
Overall engagement rate: ${engagementRate}%

POSTS (${enrichedPosts.length} most recent, with PRIVATE insights):
${postSummary}

The images above are their TOP-PERFORMING posts (ranked by saves + comments + likes).

Analyse EVERYTHING — writing voice, visual aesthetic, what content performs, what gets saved (the most valuable signal), posting patterns, brand identity.

CRITICAL: You have save data. Saves are the #1 indicator of valuable content — content people want to come back to. Weight saves heavily in your analysis.

Return this exact JSON:
{
  "genre": "genre (2-3 words max)",
  "lowercase_pct": number 0-100,
  "short_caption_pct": number 0-100 (captions under 10 words),
  "no_hashtags_pct": number 0-100,
  "chips": ["5-7 short style descriptors covering voice and visual, max 2 words each"],
  "style_rules": "6-8 sentences. Cover writing voice AND visual aesthetic. Specific and actionable.",
  "visual_aesthetic": {
    "mood": "2-3 word mood descriptor",
    "palette": "dominant colour description",
    "subjects": ["what appears in their images — up to 5"],
    "signature_visual": "one sentence — their most recognisable visual move",
    "avoid": "what they never post visually"
  },
  "content_performance": {
    "best_type": "photo|video|carousel|reels",
    "best_subject": "what content gets the most saves and engagement",
    "save_rate": "${saveRate}%",
    "engagement_rate": "${engagementRate}%",
    "posting_frequency": "how often based on timestamps",
    "peak_content": "one sentence — their single highest-performing content pattern",
    "what_gets_saved": "specific description of what content people save — this is gold"
  },
  "brand_positioning": "2-3 sentences on how they position themselves",
  "strengths": ["3-4 specific things they do well"],
  "opportunities": ["3-4 specific things they could do better or try"],
  "voice_summary": "2-3 sentence elevator pitch of their voice — this feeds caption generation"
}`
    })

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2500,
        system: 'You are an elite music industry content analyst with deep understanding of electronic music culture. You have access to PRIVATE Instagram data (saves, reach, impressions) that is normally invisible. Use this privileged data to give genuinely valuable insights. Respond ONLY with valid JSON, no markdown.',
        messages: [{ role: 'user', content }],
      }),
    })

    const aiData = await aiRes.json()
    const text = aiData.content?.[0]?.text || '{}'
    const analysis = JSON.parse(text.replace(/```json|```/g, '').trim())

    // 9. Save the deep dive results
    await supabase.from('artist_deep_dives').upsert({
      handle: handle || `@${profile.username}`,
      name: profile.name || profile.username || 'You',
      is_self: true,
      profile_pic_url: profile.profile_picture_url || null,
      follower_count: profile.followers_count || null,
      biography: profile.biography || null,
      analysis: JSON.stringify(analysis),
      posts_analysed: enrichedPosts.length,
      avg_saves: avgSaves,
      avg_reach: avgReach,
      avg_likes: avgLikes,
      engagement_rate: parseFloat(engagementRate) || null,
      save_rate: parseFloat(saveRate) || null,
      scanned_at: new Date().toISOString(),
    }, { onConflict: 'handle' })

    return NextResponse.json({
      success: true,
      profile: {
        name: profile.name || profile.username || 'You',
        handle: handle || `@${profile.username}`,
        profile_pic_url: profile.profile_picture_url || null,
        follower_count: profile.followers_count || null,
        biography: profile.biography || null,
        posts_analysed: enrichedPosts.length,
        avg_saves: avgSaves,
        avg_reach: avgReach,
        engagement_rate: engagementRate,
        save_rate: saveRate,
        ...analysis,
      },
    })
  } catch (err: any) {
    console.error('Deep dive error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
