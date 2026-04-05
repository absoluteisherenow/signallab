import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Scan limits — Sonnet does broad pass, Opus does deep analysis on top performers
const SONNET_SCAN_LIMIT = 20
const OPUS_DEEP_DIVE_LIMIT = 10

async function callClaude(apiKey: string, model: string, system: string, prompt: string, maxTokens: number) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || '[]'
}

function formatPost(p: any, i: number, avgLikes: number) {
  const totalEng = (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0)
  const aboveAvg = (p.likes ?? 0) > avgLikes * 1.3
  return `${i + 1}. [${p.handle}] ${p.media_type || 'photo'} | ${p.likes ?? 0} likes, ${p.comments ?? 0} comments, ${p.saves ?? 0} saves | eng: ${totalEng}${aboveAvg ? ' ★HIGH' : ''}${p.reach ? ` | reach: ${p.reach}` : ''}${p.engagement_rate ? ` | ER: ${p.engagement_rate}%` : ''} | "${(p.caption || '').slice(0, 120)}" | ${(p.posted_at || '').slice(0, 10)}`
}

export async function GET() {
  try {
    // Read from instagram_posts (real synced data), ordered by total engagement
    const { data: rows, error } = await supabase
      .from('instagram_posts')
      .select('handle, caption, likes, comments, saves, media_type, posted_at, reach, engagement_rate, impressions')
      .order('likes', { ascending: false })

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({
        source: 'no_data',
        trends: [],
        postsAnalysed: 0,
        artistsIncluded: [],
      })
    }

    const handles = [...new Set(rows.map(r => r.handle).filter(Boolean))]
    const avgLikes = rows.reduce((s, p) => s + (p.likes ?? 0), 0) / rows.length

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ source: 'no_data', trends: [], postsAnalysed: rows.length, artistsIncluded: handles })
    }

    // --- Pass 1: Sonnet scans top 20 posts for broad patterns ---
    const sonnetPosts = rows.slice(0, SONNET_SCAN_LIMIT)
    const sonnetSummary = sonnetPosts.map((p, i) => formatPost(p, i, avgLikes)).join('\n')

    const sonnetText = await callClaude(
      apiKey,
      'claude-sonnet-4-20250514',
      'You are a content trend analyst for electronic music artists. You identify REAL patterns from REAL engagement data. NEVER fabricate or guess — only report patterns you can see in the data. Respond ONLY with valid JSON, no markdown.',
      `Analyse these ${sonnetPosts.length} real Instagram posts from electronic music artists (${handles.join(', ')}) and identify 4-6 content trends/patterns.

Average likes across all ${rows.length} posts: ${Math.round(avgLikes)}
Posts marked ★HIGH significantly outperform the average.

POSTS (top ${SONNET_SCAN_LIMIT} by engagement):
${sonnetSummary}

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
      1200,
    )

    const sonnetTrends = JSON.parse(sonnetText.replace(/```json|```/g, '').trim())

    // --- Pass 2: Opus deep-dives the top 10 posts with Sonnet's findings for richer insight ---
    const opusPosts = rows.slice(0, OPUS_DEEP_DIVE_LIMIT)
    const opusSummary = opusPosts.map((p, i) => formatPost(p, i, avgLikes)).join('\n')

    const opusText = await callClaude(
      apiKey,
      'claude-opus-4-20250514',
      'You are a senior content strategist for electronic music artists. You produce sharp, actionable insights from real engagement data. NEVER fabricate — only report what the data shows. Respond ONLY with valid JSON, no markdown.',
      `You are reviewing the top ${OPUS_DEEP_DIVE_LIMIT} performing Instagram posts from electronic music artists (${handles.join(', ')}).

A first-pass analysis identified these patterns:
${JSON.stringify(sonnetTrends, null, 2)}

Now do a deeper analysis of the top ${OPUS_DEEP_DIVE_LIMIT} posts below. Refine, sharpen, or challenge the initial findings. Add specific creative recommendations.

Average likes across all ${rows.length} posts: ${Math.round(avgLikes)}

TOP ${OPUS_DEEP_DIVE_LIMIT} POSTS:
${opusSummary}

Return this exact JSON array (4-6 trends, refined from the initial analysis):
[
  {
    "platform": "instagram",
    "name": "short descriptive trend name (3-5 words)",
    "fit": number 0-100 (how well this fits an electronic music artist's lane),
    "hot": boolean (true if this pattern shows strong engagement),
    "context": "1-2 sentences — sharp, specific insight with evidence from the data",
    "evidence": "specific examples or numbers backing this up",
    "posts_supporting": number (how many of these top posts follow this pattern),
    "recommendation": "1 sentence — specific creative action the artist should take"
  }
]

Only include trends backed by real data. Be specific, not generic.`,
      1500,
    )

    const opusTrends = JSON.parse(opusText.replace(/```json|```/g, '').trim())

    // Add IDs
    const trendsWithIds = opusTrends.map((t: any, i: number) => ({ ...t, id: i + 1 }))

    return NextResponse.json({
      source: 'real_data',
      analysis: 'tiered',
      sonnetScanned: sonnetPosts.length,
      opusAnalysed: opusPosts.length,
      trends: trendsWithIds,
      postsAnalysed: rows.length,
      artistsIncluded: handles,
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
