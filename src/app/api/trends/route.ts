import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/api-auth'
import { callClaudeWithBrain } from '@/lib/callClaudeWithBrain'

// Trends endpoint — two-pass: Sonnet broad scan + Opus deep-dive. Both calls
// go through the brain so artist identity + rules ("never fabricate", casing,
// voice) are baked into the system prompt instead of hardcoded into the route.
// Post-check is disabled (output is structured JSON, not prose) but every call
// still inherits the brain's operating context and pricing logs.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SONNET_SCAN_LIMIT = 20
const OPUS_DEEP_DIVE_LIMIT = 10

function formatPost(p: any, i: number, avgLikes: number) {
  const totalEng = (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0)
  const aboveAvg = (p.likes ?? 0) > avgLikes * 1.3
  return `${i + 1}. [${p.handle}] ${p.media_type || 'photo'} | ${p.likes ?? 0} likes, ${p.comments ?? 0} comments, ${p.saves ?? 0} saves | eng: ${totalEng}${aboveAvg ? ' ★HIGH' : ''}${p.reach ? ` | reach: ${p.reach}` : ''}${p.engagement_rate ? ` | ER: ${p.engagement_rate}%` : ''} | "${(p.caption || '').slice(0, 120)}" | ${(p.posted_at || '').slice(0, 10)}`
}

function parseJsonArray(raw: string): any[] {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const userId = gate.user.id

  try {
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

    // Pass 1 — Sonnet broad scan
    const sonnetPosts = rows.slice(0, SONNET_SCAN_LIMIT)
    const sonnetSummary = sonnetPosts.map((p, i) => formatPost(p, i, avgLikes)).join('\n')

    const sonnetTaskInstruction = `You are a content trend analyst for electronic music artists. Identify REAL patterns from REAL engagement data. NEVER fabricate or guess — only report patterns you can see in the data. Respond ONLY with valid JSON (no markdown fences).

Return this exact JSON array (4-6 items):
[
  {
    "platform": "instagram",
    "name": "short descriptive trend name (3-5 words)",
    "fit": number 0-100,
    "hot": boolean,
    "context": "1-2 sentences explaining the pattern with specific evidence",
    "evidence": "specific examples or numbers",
    "posts_supporting": number
  }
]`

    const sonnetUser = `Analyse these ${sonnetPosts.length} real Instagram posts from electronic music artists (${handles.join(', ')}) and identify 4-6 content trends/patterns.

Average likes across all ${rows.length} posts: ${Math.round(avgLikes)}
Posts marked ★HIGH significantly outperform the average.

POSTS (top ${SONNET_SCAN_LIMIT} by engagement):
${sonnetSummary}

For each trend, identify a real pattern you can see in the data — what type of content, caption style, or format performs above average? Only include trends you can actually see. Do not invent patterns.`

    const sonnetResult = await callClaudeWithBrain({
      userId,
      task: 'trend.scan',
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      userMessage: sonnetUser,
      taskInstruction: sonnetTaskInstruction,
      runPostCheck: false,
    })

    const sonnetTrends = parseJsonArray(sonnetResult.text)

    // Pass 2 — Opus deep-dive, seeded with Sonnet's findings
    const opusPosts = rows.slice(0, OPUS_DEEP_DIVE_LIMIT)
    const opusSummary = opusPosts.map((p, i) => formatPost(p, i, avgLikes)).join('\n')

    const opusTaskInstruction = `You are a senior content strategist for electronic music artists. Produce sharp, actionable insights from real engagement data. NEVER fabricate — only report what the data shows. Respond ONLY with valid JSON (no markdown fences).

Return this exact JSON array (4-6 refined trends):
[
  {
    "platform": "instagram",
    "name": "short descriptive trend name (3-5 words)",
    "fit": number 0-100,
    "hot": boolean,
    "context": "1-2 sentences — sharp, specific insight with evidence",
    "evidence": "specific examples or numbers",
    "posts_supporting": number,
    "recommendation": "1 sentence — specific creative action the artist should take"
  }
]`

    const opusUser = `You are reviewing the top ${OPUS_DEEP_DIVE_LIMIT} performing Instagram posts from electronic music artists (${handles.join(', ')}).

A first-pass analysis identified these patterns:
${JSON.stringify(sonnetTrends, null, 2)}

Now do a deeper analysis of the top ${OPUS_DEEP_DIVE_LIMIT} posts below. Refine, sharpen, or challenge the initial findings. Add specific creative recommendations.

Average likes across all ${rows.length} posts: ${Math.round(avgLikes)}

TOP ${OPUS_DEEP_DIVE_LIMIT} POSTS:
${opusSummary}

Only include trends backed by real data. Be specific, not generic.`

    const opusResult = await callClaudeWithBrain({
      userId,
      task: 'trend.scan',
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      userMessage: opusUser,
      taskInstruction: opusTaskInstruction,
      runPostCheck: false,
    })

    const opusTrends = parseJsonArray(opusResult.text).map((t: any, i: number) => ({ ...t, id: i + 1 }))

    return NextResponse.json({
      source: 'real_data',
      analysis: 'tiered',
      sonnetScanned: sonnetPosts.length,
      opusAnalysed: opusPosts.length,
      trends: opusTrends,
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
