import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * GET /api/ads/suggestions
 * Analyses instagram_posts engagement to surface ad boost candidates.
 * - PROVEN winners: posts >72h old with engagement score >= 1.5× median.
 * - PREDICTED winners: posts <48h old already pacing above median.
 *
 * Engagement score = likes + comments*3 + saves*5
 * Recommended budget scales with score_vs_median (GBP, NM sensible range).
 *
 * Returns:
 *   { proven: Item[], predicted: Item[], median_score: number, sample_size: number, note?: string }
 * Item: { id, caption, score_vs_median, projected_vs_median?, likes, comments, saves, age_hours, why, permalink, recommended_budget: {gbp_low, gbp_high} }
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { serviceClient } = gate

  try {
    // Pull last 90 days of IG posts
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
    const { data: posts, error } = await serviceClient
      .from('instagram_posts')
      .select('id, instagram_post_id, caption, media_type, posted_at, permalink, likes, comments, saves, reach')
      .gte('posted_at', since)
      .order('posted_at', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json({ proven: [], predicted: [], median_score: 0, sample_size: 0, note: error.message })
    }
    if (!posts || posts.length === 0) {
      return NextResponse.json({ proven: [], predicted: [], median_score: 0, sample_size: 0, note: 'No posts scanned yet' })
    }

    const now = Date.now()
    const scored = posts.map(p => {
      const likes = Number(p.likes || 0)
      const comments = Number(p.comments || 0)
      const saves = Number(p.saves || 0)
      const score = likes + comments * 3 + saves * 5
      const ageHours = p.posted_at ? Math.round((now - new Date(p.posted_at).getTime()) / 3600_000) : 999
      return { ...p, score, likes, comments, saves, ageHours }
    })

    // Median score excluding obvious 0-engagement outliers
    const nonZero = scored.filter(p => p.score > 0).map(p => p.score).sort((a, b) => a - b)
    const median = nonZero.length ? nonZero[Math.floor(nonZero.length / 2)] : 0
    if (median === 0) {
      return NextResponse.json({ proven: [], predicted: [], median_score: 0, sample_size: scored.length, note: 'Not enough engagement data' })
    }

    const budgetFor = (ratio: number): { gbp_low: number, gbp_high: number } => {
      if (ratio >= 3) return { gbp_low: 30, gbp_high: 60 }
      if (ratio >= 2) return { gbp_low: 20, gbp_high: 40 }
      if (ratio >= 1.5) return { gbp_low: 15, gbp_high: 30 }
      return { gbp_low: 10, gbp_high: 20 }
    }

    // Proven winners: mature posts (>72h) with strong engagement
    const proven = scored
      .filter(p => p.ageHours >= 72 && p.score >= median * 1.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(p => {
        const ratio = +(p.score / median).toFixed(1)
        return {
          id: p.id,
          caption: (p.caption || '').slice(0, 240),
          score_vs_median: ratio,
          likes: p.likes,
          comments: p.comments,
          saves: p.saves,
          age_hours: p.ageHours,
          why: buildWhy(p, ratio, 'proven'),
          permalink: p.permalink || null,
          recommended_budget: budgetFor(ratio),
        }
      })

    // Predicted winners: fresh posts (<48h) pacing above median already
    const predicted = scored
      .filter(p => p.ageHours < 48 && p.score >= median * 0.6)
      .map(p => {
        // Project to 48h based on observed pace
        const projected = p.ageHours > 0 ? p.score * (48 / Math.max(p.ageHours, 4)) : p.score
        return { ...p, projected }
      })
      .filter(p => p.projected >= median * 1.3)
      .sort((a, b) => b.projected - a.projected)
      .slice(0, 3)
      .map(p => {
        const ratio = +(p.projected / median).toFixed(1)
        return {
          id: p.id,
          caption: (p.caption || '').slice(0, 240),
          projected_vs_median: ratio,
          likes: p.likes,
          comments: p.comments,
          saves: p.saves,
          age_hours: p.ageHours,
          why: buildWhy(p, ratio, 'predicted'),
          permalink: p.permalink || null,
          recommended_budget: budgetFor(ratio),
        }
      })

    return NextResponse.json({
      proven,
      predicted,
      median_score: median,
      sample_size: scored.length,
    })
  } catch (err: any) {
    return NextResponse.json({ proven: [], predicted: [], median_score: 0, sample_size: 0, note: err.message || 'suggestions failed' })
  }
}

function buildWhy(p: any, ratio: number, kind: 'proven' | 'predicted'): string {
  const parts: string[] = []
  if (kind === 'predicted') {
    parts.push(`On pace for ${ratio}× median`)
  } else {
    parts.push(`${ratio}× median engagement`)
  }
  if (p.saves >= 10) parts.push(`${p.saves} saves (strong signal)`)
  else if (p.saves >= 3) parts.push(`${p.saves} saves`)
  if (p.comments >= 20) parts.push(`${p.comments} comments`)
  if (String(p.media_type || '').includes('VIDEO') || String(p.media_type || '').includes('REEL')) {
    parts.push('Reel format')
  }
  return parts.join(' · ')
}
