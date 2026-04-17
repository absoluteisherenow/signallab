import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * GET /api/content/suggestions
 * Buckets IG posts by caption keywords, compares each bucket to overall median
 * engagement, and surfaces a "what to capture next" list from the winners.
 *
 * Response:
 *   {
 *     capture_list: [{label, description, reason, top_permalinks[]}],
 *     your_buckets: [{id, label, multiple_vs_median, posts_supporting}],
 *     peer_buckets: [{id, label, observation, source_artists[], source_count}],
 *     note?: string
 *   }
 *
 * Every your-bucket needs >=3 supporting posts. No fabricated data (per
 * feedback_never_fabricate).
 *
 * Peer buckets are QUALITATIVE pattern observations drawn from
 * artist_profiles.content_performance (best_type, peak_content, best_subject).
 * No numerical multiples — we don't store peer engagement numbers yet, so we
 * render them as pattern observations ("3 of 5 peers peak on studio content")
 * rather than invent "2.3× their median" figures. A proper peer_posts scan +
 * numerical multiples pipeline is queued as a separate job.
 */

type Bucket = {
  id: string
  label: string
  description: string
  matcher: RegExp
}

const BUCKETS: Bucket[] = [
  { id: 'live_set', label: 'Live set / performance', description: 'Clips from your DJ sets or live shows — crowd, stage, system', matcher: /\b(live|set|festival|club|boiler|fabric|tour|dj|night|stage|crowd|system)\b/i },
  { id: 'studio', label: 'Studio / process', description: 'In-studio shots — gear, mixing, writing, behind-the-scenes', matcher: /\b(studio|session|writing|mixing|producing|desk|patch|modular|prophet|oberheim|buchla|moog|jupiter)\b/i },
  { id: 'release', label: 'Release / music drop', description: 'Track, EP, remix or album announcements', matcher: /\b(out now|released?|new track|ep|lp|album|remix|single|stream|fabric originals|label)\b/i },
  { id: 'collab', label: 'Collab / feature', description: 'Posts tagging a collaborator or guest artist', matcher: /@\w+.*@\w+|\b(with|feat\.|featuring|alongside|joined|join us)\b/i },
  { id: 'visual_art', label: 'Visual / artwork', description: 'Cover art, posters, visual identity pieces', matcher: /\b(artwork|cover|poster|visual|design|shot by|directed|video|music video|photography)\b/i },
  { id: 'gear_close', label: 'Gear close-up', description: 'Macro of hardware — synths, mixers, specific instruments', matcher: /\b(cdj|v10|technics|prophet|oberheim|ob-6|ob-x8|jupiter|moog|memorymoog|buchla|eurorack|move|push|ableton)\b/i },
  { id: 'kitchen_rave', label: 'Kitchen / intimate', description: 'Kitchen raves, home sessions, documentary-feel', matcher: /\b(kitchen|home|intimate|raw|documentary|bedroom)\b/i },
  { id: 'announce', label: 'Gig announce', description: 'Poster drops, ticket links, show reminders', matcher: /\b(tonight|tomorrow|this week|tickets?|line[- ]?up|announce|support|headline|playing|doors)\b/i },
]

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { serviceClient, user } = gate

  try {
    // Pull 12 months of posts for better bucket coverage
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()
    const { data: posts, error } = await serviceClient
      .from('instagram_posts')
      .select('id, caption, media_type, permalink, likes, comments, saves, posted_at, handle')
      .gte('posted_at', since)
      .order('posted_at', { ascending: false })
      .limit(500)

    if (error) {
      return NextResponse.json({ capture_list: [], your_buckets: [], peer_buckets: [], note: error.message })
    }
    if (!posts || posts.length < 5) {
      return NextResponse.json({
        capture_list: [],
        your_buckets: [],
        peer_buckets: [],
        note: 'Need at least 5 posts in your engagement data. Scan Instagram in Signal Lab to populate.',
      })
    }

    const scored = posts.map(p => {
      const likes = Number(p.likes || 0)
      const comments = Number(p.comments || 0)
      const saves = Number(p.saves || 0)
      const score = likes + comments * 3 + saves * 5
      return { ...p, score, likes, comments, saves }
    })

    const nonZero = scored.filter(p => p.score > 0).map(p => p.score).sort((a, b) => a - b)
    const median = nonZero.length ? nonZero[Math.floor(nonZero.length / 2)] : 0
    if (median === 0) {
      return NextResponse.json({
        capture_list: [],
        your_buckets: [],
        peer_buckets: [],
        note: 'Not enough engagement to compare yet',
      })
    }

    // Assign posts to buckets (a post can land in multiple buckets)
    const bucketAssignments: Record<string, typeof scored> = {}
    for (const b of BUCKETS) bucketAssignments[b.id] = []
    for (const p of scored) {
      const text = `${p.caption || ''} ${p.media_type || ''}`
      for (const b of BUCKETS) {
        if (b.matcher.test(text)) bucketAssignments[b.id].push(p)
      }
    }

    const your_buckets = BUCKETS
      .map(b => {
        const items = bucketAssignments[b.id]
        if (items.length < 3) return null
        const avgScore = items.reduce((s, p) => s + p.score, 0) / items.length
        const ratio = +(avgScore / median).toFixed(1)
        return {
          id: b.id,
          label: b.label,
          multiple_vs_median: ratio,
          posts_supporting: items.length,
          _items: items.sort((a, b) => b.score - a.score),
          _description: b.description,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.multiple_vs_median - a.multiple_vs_median)

    // Capture list = top 4 winning buckets (ratio >= 1.2x)
    const capture_list = your_buckets
      .filter(b => b.multiple_vs_median >= 1.2)
      .slice(0, 4)
      .map(b => ({
        label: b.label,
        description: b._description,
        reason: `Your ${b.posts_supporting} posts in this bucket average ${b.multiple_vs_median}× your median engagement`,
        top_permalinks: b._items.slice(0, 3).map(p => p.permalink).filter((u): u is string => !!u),
      }))

    // Strip private fields before returning
    const yourBucketsClean = your_buckets.map(b => ({
      id: b.id,
      label: b.label,
      multiple_vs_median: b.multiple_vs_median,
      posts_supporting: b.posts_supporting,
    }))

    // Peer buckets — qualitative patterns from artist_profiles.content_performance.
    // We don't store peer engagement numbers, so we surface pattern observations
    // instead of fabricated "2.3× peer median" figures. Numerical multiples will
    // arrive once the peer_posts scan pipeline ships (queued as separate job).
    const peer_buckets = await buildPeerBuckets(serviceClient, user.id)

    return NextResponse.json({
      capture_list,
      your_buckets: yourBucketsClean,
      peer_buckets,
    })
  } catch (err: any) {
    return NextResponse.json({ capture_list: [], your_buckets: [], peer_buckets: [], note: err.message || 'suggestions failed' })
  }
}

/**
 * Aggregates qualitative patterns across the user's artist_profiles entries.
 *
 * Each profile carries a `content_performance` JSONB — best_type (format),
 * peak_content (free-text description of what works), best_subject,
 * posting_frequency. We convert these into pattern observations grouped by
 * the 8 content buckets where the peak_content text matches, plus a general
 * "format" observation if peers converge on the same media type.
 */
async function buildPeerBuckets(svc: any, userId: string): Promise<any[]> {
  const { data: profiles } = await svc
    .from('artist_profiles')
    .select('handle, name, content_performance')
    .eq('user_id', userId)

  if (!profiles || profiles.length === 0) return []

  type PeerPerf = { handle: string; name: string; perf: any }
  const peers: PeerPerf[] = profiles
    .filter((p: any) => p.content_performance)
    .map((p: any) => ({ handle: p.handle || '', name: p.name || p.handle || '', perf: p.content_performance }))

  if (peers.length < 2) return []

  const out: any[] = []

  // 1) Bucket-level peaks: classify each peer's peak_content string against BUCKETS
  const bucketHits: Record<string, PeerPerf[]> = {}
  for (const b of BUCKETS) bucketHits[b.id] = []
  for (const p of peers) {
    const text = String(p.perf?.peak_content || '') + ' ' + String(p.perf?.best_subject || '')
    if (!text.trim()) continue
    for (const b of BUCKETS) {
      if (b.matcher.test(text)) bucketHits[b.id].push(p)
    }
  }
  for (const b of BUCKETS) {
    const hits = bucketHits[b.id]
    if (hits.length >= 2) {
      out.push({
        id: b.id,
        label: b.label,
        observation: `${hits.length} of ${peers.length} peers peak on this`,
        source_artists: hits.map(h => h.name).slice(0, 5),
        source_count: hits.length,
      })
    }
  }

  // 2) Format convergence: if most peers share a best_type, surface it
  const formatCounts: Record<string, PeerPerf[]> = {}
  for (const p of peers) {
    const t = String(p.perf?.best_type || '').trim().toUpperCase()
    if (!t) continue
    formatCounts[t] = formatCounts[t] || []
    formatCounts[t].push(p)
  }
  const topFormat = Object.entries(formatCounts).sort((a, b) => b[1].length - a[1].length)[0]
  if (topFormat && topFormat[1].length >= 2) {
    out.push({
      id: `format_${topFormat[0].toLowerCase()}`,
      label: `${topFormat[0]} format`,
      observation: `${topFormat[1].length} of ${peers.length} peers report ${topFormat[0]} as their strongest format`,
      source_artists: topFormat[1].map(h => h.name).slice(0, 5),
      source_count: topFormat[1].length,
    })
  }

  // Sort by source_count desc, cap at 6
  return out.sort((a, b) => b.source_count - a.source_count).slice(0, 6)
}
