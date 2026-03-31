import { NextResponse } from 'next/server'

// ── Fetch top-performing posts from Supabase post_performance ─────────────────
async function getTopPosts() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return []
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/post_performance?select=artist_name,caption,likes,comments,media_type,engagement_score,taken_at&order=engagement_score.desc&limit=60`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    )
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function GET() {
  const posts = await getTopPosts()

  if (!posts || posts.length < 5) {
    // Not enough real data yet — return empty so UI shows "scan artists first"
    return NextResponse.json({ trends: [], source: 'no_data', message: 'Scan reference artists to generate real trends' })
  }

  // Build rich context from top posts — real engagement numbers, real captions
  const topPosts = posts.slice(0, 30)
  const totalPosts = posts.length
  const avgEngagement = Math.round(posts.reduce((s: number, p: any) => s + (p.engagement_score || 0), 0) / posts.length)

  // Count media types in top performers
  const mediaTypeCounts = topPosts.reduce((acc: Record<string, number>, p: any) => {
    acc[p.media_type] = (acc[p.media_type] || 0) + 1
    return acc
  }, {})

  // Artists represented in top posts
  const topArtists = [...new Set(topPosts.map((p: any) => p.artist_name))].slice(0, 5)

  const prompt = `You are analysing real Instagram engagement data from ${totalPosts} posts across reference artists: ${topArtists.join(', ')}.

Average engagement score: ${avgEngagement} (likes + 3× comments)
Media type breakdown in top ${topPosts.length} posts: ${JSON.stringify(mediaTypeCounts)}

TOP PERFORMING POSTS (sorted by real engagement):
${topPosts.slice(0, 20).map((p: any, i: number) =>
  `${i + 1}. [${p.artist_name}] ${p.media_type.toUpperCase()} — ${p.likes} likes, ${p.comments} comments
Caption: "${p.caption?.slice(0, 120) || '(no caption)'}"`
).join('\n')}

Based ONLY on these real posts and their actual engagement numbers:
1. What specific caption structures and formats are driving the most engagement?
2. What post types (video/photo/carousel) outperform in this lane?
3. What timing or content themes appear in the highest-engagement posts?
4. What patterns do the LOWEST performers have that the top ones avoid?

Return 5 trend cards as JSON. Each must be grounded in the real data above — reference actual engagement numbers or specific patterns you observed.

Return ONLY this JSON array:
[
  {
    "id": 1,
    "platform": "Platform · Genre context (e.g. Instagram · Electronic)",
    "name": "Specific format name based on what you saw in the data",
    "fit": number 70-99 (based on how many top posts used this pattern),
    "hot": true/false (true if 3+ of the top 10 posts used it),
    "context": "One sentence describing the pattern with a real number — e.g. 'Single-line captions averaged 2.4× more engagement than multi-line in this lane'",
    "evidence": "Artist name + approximate engagement that proves this trend",
    "posts_supporting": number (how many of the ${topPosts.length} top posts showed this pattern)
  }
]`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: 'You are a social media data analyst. Respond ONLY with valid JSON. Never invent engagement numbers — only use what is in the data provided.',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    const text = data.content?.[0]?.text || '[]'
    const trends = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json({
      trends,
      source: 'real_data',
      postsAnalysed: totalPosts,
      artistsIncluded: topArtists,
    })
  } catch {
    return NextResponse.json({ trends: [], source: 'error', message: 'Failed to analyse trends' })
  }
}
