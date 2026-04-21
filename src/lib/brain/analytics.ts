// Analytics interpreter — ported from
// ~/.claude/skills/analytics-interpreter/SKILL.md. Turns raw post_performance
// rows into red-flag / positive-signal heuristics + a one-line narrative the
// brain injects into the system prompt so every AI call sees "what's working
// lately".
//
// Pure — no DB, no I/O. Input is the rows OperatingContext already loaded.

export interface PerfRow {
  caption: string
  format: string
  estimated_score: number | null
  actual_likes?: number | null
  actual_comments?: number | null
  platform?: string | null
  context?: Record<string, unknown> | null
}

export interface PerformanceReading {
  top_posts: Array<{ caption: string; format: string; score: number | null }>
  red_flags: string[]
  positive_signals: string[]
  narrative: string
}

const FORMAT_ALIASES: Record<string, string> = {
  reel: 'Reel',
  reels: 'Reel',
  video: 'Reel',
  carousel: 'Carousel',
  album: 'Carousel',
  photo: 'Feed photo',
  image: 'Feed photo',
  feed: 'Feed photo',
  story: 'Story',
  stories: 'Story',
}

function normalizeFormat(f: string | null | undefined): string {
  if (!f) return 'unknown'
  const lo = String(f).toLowerCase()
  return FORMAT_ALIASES[lo] || lo
}

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function interpretPerformance(rows: PerfRow[]): PerformanceReading {
  if (!rows || !rows.length) {
    return {
      top_posts: [],
      red_flags: [],
      positive_signals: [],
      narrative: '',
    }
  }

  // Top 5 by estimated_score.
  const ranked = [...rows]
    .filter((r) => (r.estimated_score ?? 0) > 0)
    .sort((a, b) => (b.estimated_score ?? 0) - (a.estimated_score ?? 0))
  const top_posts = ranked.slice(0, 5).map((r) => ({
    caption: r.caption || '',
    format: normalizeFormat(r.format),
    score: r.estimated_score ?? null,
  }))

  // Score distribution by format.
  const byFormat = new Map<string, number[]>()
  for (const r of rows) {
    const f = normalizeFormat(r.format)
    const s = r.estimated_score
    if (s == null) continue
    const arr = byFormat.get(f) || []
    arr.push(s)
    byFormat.set(f, arr)
  }

  const formatAvgs: Array<{ format: string; avg: number; count: number }> = []
  for (const [f, arr] of byFormat) {
    if (arr.length >= 2) formatAvgs.push({ format: f, avg: avg(arr), count: arr.length })
  }
  formatAvgs.sort((a, b) => b.avg - a.avg)

  const red_flags: string[] = []
  const positive_signals: string[] = []

  // Overall baseline
  const allScores = rows.map((r) => r.estimated_score).filter((s): s is number => s != null)
  const overall = avg(allScores)

  if (formatAvgs.length >= 2) {
    const winner = formatAvgs[0]
    const loser = formatAvgs[formatAvgs.length - 1]
    const ratio = winner.avg / Math.max(1, loser.avg)
    if (ratio >= 1.4) {
      positive_signals.push(
        `${winner.format} outperforming ${loser.format} by ${ratio.toFixed(1)}x (avg ${Math.round(winner.avg)} vs ${Math.round(loser.avg)} over last ${winner.count + loser.count} posts)`
      )
      if (loser.count >= 3) {
        red_flags.push(`${loser.format} fatigue — ${loser.count} recent posts averaging ${Math.round(loser.avg)} vs overall ${Math.round(overall)}`)
      }
    }
  }

  // Engagement-only red flags (when we have likes + comments but no score)
  const likeHeavy = rows.filter(
    (r) => (r.actual_likes ?? 0) > 0 && (r.actual_comments ?? 0) === 0
  ).length
  if (rows.length >= 5 && likeHeavy / rows.length > 0.8) {
    red_flags.push('high likes, zero comments — engagement is shallow. Ask genuine questions in Stories to deepen.')
  }

  // Declining-score signal: split into first-half vs second-half chronologically.
  // Rows are passed ordered best-first by the loader, so we can't infer time here.
  // Skip declining-signal until loader passes timestamps — guarded to avoid wrong
  // calls.

  // Narrative
  let narrative = ''
  if (top_posts.length) {
    const bestFmt = formatAvgs[0]
    narrative = bestFmt
      ? `Recent performance: ${bestFmt.format} is your strongest format (avg ${Math.round(bestFmt.avg)} over ${bestFmt.count} posts). Top post: "${(top_posts[0].caption || '').slice(0, 80)}…" (${top_posts[0].score ?? '?'}).`
      : `Recent top post: "${(top_posts[0].caption || '').slice(0, 80)}…" (${top_posts[0].score ?? '?'}).`
  }

  return { top_posts, red_flags, positive_signals, narrative }
}
