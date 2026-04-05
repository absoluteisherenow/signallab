import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data: rows, error } = await supabase
      .from('post_performance')
      .select('artist_name, caption, likes, comments, media_type, taken_at, engagement_score, scanned_at')
      .order('engagement_score', { ascending: false })

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({
        source: 'no_data',
        trends: [],
        postsAnalysed: 0,
        artistsIncluded: [],
      })
    }

    const artistNames = [...new Set(rows.map(r => r.artist_name).filter(Boolean))]
    const avgScore = rows.reduce((s, p) => s + (p.engagement_score ?? 0), 0) / rows.length

    // Build a summary of the real post data for Claude to analyse
    const postSummary = rows.slice(0, 80).map((p, i) => {
      const score = p.engagement_score ?? 0
      const aboveAvg = score > avgScore * 1.3
      return `${i + 1}. [${p.artist_name}] ${p.media_type || 'photo'} | ${p.likes ?? 0} likes, ${p.comments ?? 0} comments | score: ${score}${aboveAvg ? ' ★HIGH' : ''} | "${(p.caption || '').slice(0, 120)}"`
    }).join('\n')

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ source: 'no_data', trends: [], postsAnalysed: rows.length, artistsIncluded: artistNames })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: 'You are a content trend analyst for electronic music artists. You identify REAL patterns from REAL engagement data. NEVER fabricate or guess — only report patterns you can see in the data. Respond ONLY with valid JSON, no markdown.',
        messages: [{
          role: 'user',
          content: `Analyse these ${rows.length} real Instagram posts from electronic music artists (${artistNames.join(', ')}) and identify 4-6 content trends/patterns.

Average engagement score: ${Math.round(avgScore)}
Posts marked ★HIGH significantly outperform the average.

POSTS:
${postSummary}

For each trend, identify a real pattern you can see in the data — what type of content, caption style, or format performs above average?

Return this exact JSON array:
[
  {
    "platform": "instagram",
    "name": "short descriptive trend name (3-5 words)",
    "fit": number 0-100 (how well this fits an electronic music artist's lane),
    "hot": boolean (true if this pattern shows strong engagement),
    "context": "1-2 sentences explaining the pattern with specific evidence from the data",
    "evidence": "specific examples or numbers backing this up",
    "posts_supporting": number (how many posts in the dataset follow this pattern)
  }
]

Only include trends you can actually see in the data. Do not invent patterns.`,
        }],
      }),
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || '[]'
    const trends = JSON.parse(text.replace(/```json|```/g, '').trim())

    // Add IDs
    const trendsWithIds = trends.map((t: any, i: number) => ({ ...t, id: i + 1 }))

    return NextResponse.json({
      source: 'real_data',
      trends: trendsWithIds,
      postsAnalysed: rows.length,
      artistsIncluded: artistNames,
    })
  } catch (err: any) {
    return NextResponse.json({
      source: 'error',
      trends: [],
      postsAnalysed: 0,
      artistsIncluded: [],
      error: err.message,
    })
  }
}
