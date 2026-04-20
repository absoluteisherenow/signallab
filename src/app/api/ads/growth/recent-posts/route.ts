import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * GET /api/ads/growth/recent-posts?limit=10&only_video=1
 *
 * Returns recent @nightmanoeuvres posts ranked for Stage 1 boost candidacy.
 *
 * Why this ranker exists (v3 — Apr 2026):
 *   Stage 1 now runs OUTCOME_ENGAGEMENT (was Video Views). Engagement optimisation
 *   rewards saves + shares + profile visits — profile visits are the direct
 *   follower engine. Saves correlate strongest with profile-visit propensity
 *   (per NM memory: saves are the strongest intent signal).
 *
 *   Ranking signals, in order:
 *     1. save_rate = saves / reach          (primary — intent to revisit
 *                                            → profile visit → follow)
 *     2. view_rate = video_views / reach    (secondary — attention signal,
 *                                            still boosts algorithmic reach)
 *     3. engagement_score (likes + 3×comments) — fallback for posts with
 *        no insight data cached. Marked low_data: true so the UI can say so.
 *
 * Data sources (no fabrication):
 *   - List of posts → Meta Graph API /{IG_ACTOR_ID}/media (live fetch)
 *   - Per-post Insight fields → instagram_posts table (synced by
 *     /api/instagram/sync — includes reach, video_views, saves, etc.)
 *
 * If a post isn't in instagram_posts yet (very fresh, not yet synced), it
 * falls back to engagement_score + low_data flag. The sync cron closes that
 * gap within hours.
 */
/**
 * @nightmanoeuvres IG actor ID — verified via Graph API:
 *   { id: 17841465370771800, username: 'nightmanoeuvres', name: 'NIGHT manoeuvres' }
 *
 * The Signal Lab OS system user token only has DIRECT access to @absolute
 * (17841400093363542). To read NM's posts we have to use the `business_discovery`
 * edge on @absolute and look up `nightmanoeuvres` by username. This returns
 * the public subset (id, caption, media_type, timestamp, permalink, like_count,
 * comments_count, thumbnail_url, media_url) — no insights, but we join with the
 * `instagram_posts` table (synced separately) for reach/video_views/saves.
 */
const NM_IG_ID = '17841465370771800'
const CALLER_IG_ID = '17841400093363542' // @absolute — the token owner

// Force dynamic rendering — this route reads the auth cookie (via
// requireUser), hits Meta's Graph API for live post data, and must never be
// cached at the Next.js / Cloudflare layer. Without this, a freshly-posted
// video can be invisible to the picker for hours.
export const dynamic = 'force-dynamic'
export const revalidate = 0

type IGGraphPost = {
  id: string
  caption?: string
  media_type: string
  timestamp: string
  permalink?: string
  like_count?: number
  comments_count?: number
  thumbnail_url?: string
  media_url?: string
}

type InsightRow = {
  instagram_post_id: string
  reach: number | null
  video_views: number | null
  saves: number | null
  impressions: number | null
  engagement_rate: number | null
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'META_SYSTEM_USER_TOKEN not configured' }, { status: 500 })
  }

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 30)
  const onlyVideo = url.searchParams.get('only_video') === '1'

  try {
    // 1. Fetch NM's recent posts via `business_discovery` on the @absolute
    //    account (the token owner). Only public-surface fields — Insights come
    //    from the cached `instagram_posts` table further down.
    const overFetch = limit * 3
    const innerFields = `media.limit(${overFetch}){id,caption,media_type,timestamp,permalink,like_count,comments_count,thumbnail_url,media_url}`
    const bdField = `business_discovery.username(nightmanoeuvres){${innerFields}}`
    const apiUrl = new URL(`https://graph.facebook.com/v25.0/${CALLER_IG_ID}`)
    apiUrl.searchParams.set('fields', bdField)
    apiUrl.searchParams.set('access_token', token)
    // Cache-bust: unique `_t` each request defeats ANY upstream cache
    // (Cloudflare edge, Next.js route data, browser). `cache: 'no-store'`
    // alone wasn't enough — a freshly-posted video was still invisible until
    // the edge cache lapsed. Belt-and-braces: timestamp param + no-store +
    // cf:{cacheTtl:0} so at least one of these wins on every runtime.
    apiUrl.searchParams.set('_t', String(Date.now()))
    // Cloudflare-specific fetch option — standard `cache: 'no-store'` doesn't
    // always bypass the CF edge cache on external requests. `cf.cacheTtl: 0`
    // is the authoritative way to disable it in the Workers runtime.
    const fetchInit: RequestInit & { cf?: { cacheTtl: number; cacheEverything: boolean } } = {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
      cf: { cacheTtl: 0, cacheEverything: false },
    }
    const res = await fetch(apiUrl.toString(), fetchInit)
    console.log('[recent-posts] graph fetch →', {
      status: res.status,
      cf_ray: res.headers.get('cf-ray'),
      age: res.headers.get('age'),
      cache_status: res.headers.get('cf-cache-status'),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err?.error?.message || `Meta ${res.status}` },
        { status: res.status }
      )
    }
    const data = await res.json()

    // Defensive guard: refuse to surface anything if Meta didn't return NM's ID.
    // Blocks any accidental drift to @absolute or a different handle ever
    // appearing in the boost picker.
    const returnedId = data?.business_discovery?.id
    if (returnedId && returnedId !== NM_IG_ID) {
      return NextResponse.json(
        {
          error: `boost picker refused: expected @nightmanoeuvres (${NM_IG_ID}), got ${returnedId}`,
        },
        { status: 500 }
      )
    }

    let posts = ((data.business_discovery?.media?.data ?? []) as IGGraphPost[])
    console.log('[recent-posts] graph returned', posts.length, 'posts; newest 5:',
      posts.slice(0, 5).map(p => `${p.timestamp?.slice(0, 10)} ${p.media_type}`).join(' | '))

    // Filter to video/reel — Stage 1 optimises for video views, so non-video
    // candidates are useless for the retargeting pool.
    if (onlyVideo) {
      posts = posts.filter(p => p.media_type === 'VIDEO' || p.media_type === 'REELS')
    }

    // Cap to a reasonable candidate set before enrichment
    posts = posts.slice(0, limit * 2)

    // 2. Pull cached per-post Insights from instagram_posts. Synced by
    //    /api/instagram/sync (cron + manual). Includes reach + video_views.
    const postIds = posts.map(p => p.id)
    let insightMap = new Map<string, InsightRow>()
    if (postIds.length > 0) {
      const { data: insights } = await gate.serviceClient
        .from('instagram_posts')
        .select('instagram_post_id, reach, video_views, saves, impressions, engagement_rate')
        .in('instagram_post_id', postIds)
      for (const row of (insights as InsightRow[] | null) ?? []) {
        insightMap.set(row.instagram_post_id, row)
      }
    }

    // 3. Build enriched candidates with computed ranking signals
    type Ranked = {
      post: IGGraphPost
      insight: InsightRow | null
      view_rate: number | null      // video_views / reach
      save_rate: number | null      // saves / reach
      engagement_score: number      // fallback: likes + comments*3
      low_data: boolean             // true if no insight row yet
      // Composite score used for sort. Posts with insight data sit ABOVE
      // fallback posts; within each band we sort by the respective metric.
      composite: number
    }

    const ranked: Ranked[] = posts.map(post => {
      const ins = insightMap.get(post.id) ?? null
      const reach = ins?.reach ?? 0
      const views = ins?.video_views ?? 0
      const saves = ins?.saves ?? 0

      const view_rate = ins && reach > 0 && views > 0 ? views / reach : null
      const save_rate = ins && reach > 0 && saves >= 0 ? saves / reach : null
      const engagement_score = (post.like_count ?? 0) + (post.comments_count ?? 0) * 3

      // low_data = we have no insight row at all. A post can still have a
      // reach-row but no video_views (e.g. a carousel or image — there's no
      // view_rate for static posts). save_rate works for ALL post types.
      const low_data = ins == null
      // Composite scoring:
      //   Insight-backed posts get +1000 base to sort above fallback.
      //   save_rate weighted ×20 (primary — follower-acquisition intent)
      //   view_rate weighted ×5  (secondary — only meaningful for video,
      //                           null-coalesced to 0 for static posts)
      // Fallback posts share a lower band sorted by engagement_score only.
      const composite = !low_data
        ? 1000 + (save_rate ?? 0) * 20 + (view_rate ?? 0) * 5
        : engagement_score / 10000 // sub-1 so it always sits below insight band

      return { post, insight: ins, view_rate, save_rate, engagement_score, low_data, composite }
    })

    ranked.sort((a, b) => b.composite - a.composite)

    // Recency guarantee — keep the N freshest posts in the returned set no
    // matter how their composite score ranks. Without this, a post uploaded
    // today (zero insights synced, composite ≈ 0) sinks below a 6-month-old
    // post with a 1.5 % save rate (composite ≈ 1030) and gets cut entirely.
    // That defeats the "Most recent" sort pill on the frontend — it can only
    // sort what the API returned.
    // N = 5 covers the typical sync cadence (insights cron runs every few
    // hours) so anything posted since the last sync still surfaces.
    // Bumped 5 → 10 so a post from ~2 weeks back (e.g. the Pitch Music + Arts
    // carousel) still surfaces when NM has posted several times since.
    const RECENCY_GUARANTEE = 10
    const byRecency = [...ranked].sort(
      (a, b) => new Date(b.post.timestamp).getTime() - new Date(a.post.timestamp).getTime()
    )
    const freshestToGuarantee = byRecency.slice(0, RECENCY_GUARANTEE)

    // Slot-reserve approach: dedicate N slots to the freshest posts, fill the
    // remaining (limit - N) slots with the top-composite insight-backed posts
    // that aren't already in the fresh set.
    //
    // Earlier attempt used pop/push inside a loop, which had a subtle bug: the
    // second injection's .pop() evicted the FIRST injection (freshly pushed to
    // the end), cascading through every following injection. Only the final
    // pushed post survived. The set-subtract approach avoids the ordering trap
    // entirely.
    const freshIds = new Set(freshestToGuarantee.map(r => r.post.id))
    const insightBackedOnly = ranked.filter(r => !freshIds.has(r.post.id))
    const reservedFresh = freshestToGuarantee
    const slotsForInsight = Math.max(0, limit - reservedFresh.length)
    const topInsight = insightBackedOnly.slice(0, slotsForInsight)
    const working = [...topInsight, ...reservedFresh]
    // Re-sort by composite so the dropdown still opens in top-performer order
    // by default (frontend sort-pill flips to recency on demand).
    working.sort((a, b) => b.composite - a.composite)

    const injectionsMade = reservedFresh.filter(r => !ranked.slice(0, limit).some(x => x.post.id === r.post.id)).length
    const injectionsSkipped = reservedFresh.length - injectionsMade
    console.log('[recent-posts] injections →', { made: injectionsMade, skipped: injectionsSkipped, workingLen: working.length })

    const out = working
    console.log('[recent-posts] final out →', out.length, 'posts; first 5:',
      out.slice(0, 5).map(r => `${r.post.timestamp?.slice(0, 10)} comp=${r.composite.toFixed(3)} low_data=${r.low_data}`).join(' | '))
    console.log('[recent-posts] fresh guarantee set →',
      freshestToGuarantee.map(r => `${r.post.timestamp?.slice(0, 10)}`).join(', '))

    // Response cache headers — without these, Cloudflare will edge-cache the
    // JSON response (and the browser will too) based on default heuristics.
    // That means even after the Worker fetches fresh Graph data and injects
    // today's post, the UI keeps rendering a stale payload from the previous
    // deploy. Explicit no-store beats heuristic caching every time.
    const noCacheHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    }

    return NextResponse.json({
      posts: out.map(r => ({
        id: r.post.id,
        caption_excerpt: (r.post.caption || '').slice(0, 120),
        media_type: r.post.media_type,
        timestamp: r.post.timestamp,
        permalink: r.post.permalink,
        thumbnail_url: r.post.thumbnail_url || r.post.media_url,
        // Ranking signals — what the UI should actually show the user
        view_rate: r.view_rate,                     // 0–1 (null if low_data)
        save_rate: r.save_rate,                     // 0–1 (null if low_data)
        reach: r.insight?.reach ?? null,
        video_views: r.insight?.video_views ?? null,
        saves: r.insight?.saves ?? null,
        // Raw counts for reference
        like_count: r.post.like_count ?? 0,
        comments_count: r.post.comments_count ?? 0,
        engagement_score: r.engagement_score,
        // Truth flag — UI must show a warning for low_data candidates
        low_data: r.low_data,
      })),
      meta: {
        candidates_considered: posts.length,
        with_insight_data: ranked.filter(r => !r.low_data).length,
        ranker_version: 'v5_diagnostic_surface',
        ig_actor_id: NM_IG_ID, // echo back so UI can verify we pulled from NM
        handle: '@nightmanoeuvres',
        // DIAGNOSTICS — surface the injection state so we can see from the
        // browser network tab exactly what the server is computing.
        debug: {
          graph_returned_newest_5: posts.slice(0, 5).map(p => `${p.timestamp?.slice(0, 10)} ${p.media_type}`),
          freshest_5_after_rank: freshestToGuarantee.map(r => `${r.post.timestamp?.slice(0, 10)} low_data=${r.low_data} comp=${r.composite.toFixed(3)}`),
          final_out_timestamps: out.map(r => r.post.timestamp?.slice(0, 10)),
          injections_made: injectionsMade,
          injections_skipped: injectionsSkipped,
          ranked_length: ranked.length,
          posts_length: posts.length,
        },
      },
    }, { headers: noCacheHeaders })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
