import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canRunArtistScan, recordArtistScanRun } from '@/lib/artistScanTiers'
import { getUserTier } from '@/lib/scanTiers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Resolve current user. Single-user app fallback: first row of artist_settings.
async function resolveUserId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (user?.id) return user.id
  }
  const { data } = await supabase.from('artist_settings').select('user_id').limit(1)
  return data?.[0]?.user_id || null
}

interface PostData {
  caption: string
  likes: number
  comments: number
  mediaType: 'photo' | 'video' | 'carousel'
  takenAt: string
  imageUrl?: string
  viewCount?: number
  location?: string
  usertags?: string[]
  carouselCount?: number
}

interface UserProfile {
  biography?: string
  followerCount?: number
  followingCount?: number
  mediaCount?: number
  category?: string
  externalUrl?: string
  fullName?: string
  profilePicUrl?: string
}

interface ScrapeResult {
  posts: PostData[]
  captions: string[]
  userProfile?: UserProfile
}

// ── Calculate real engagement + caption stats from actual data ────────────────
function calcEngagementRate(posts: PostData[], followerCount?: number): string | undefined {
  if (!followerCount || followerCount === 0 || posts.length === 0) return undefined
  const totalEngagement = posts.reduce((sum, p) => sum + (p.likes || 0) + (p.comments || 0), 0)
  const avgEngagement = totalEngagement / posts.length
  const rate = (avgEngagement / followerCount) * 100
  return `${rate.toFixed(1)}%`
}

function calcBestFormat(posts: PostData[]): string | undefined {
  if (posts.length === 0) return undefined
  const counts: Record<string, number> = {}
  for (const p of posts) {
    counts[p.mediaType] = (counts[p.mediaType] || 0) + 1
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return undefined
  const best = sorted[0][0]
  return best.charAt(0).toUpperCase() + best.slice(1)
}

function calcCaptionStats(captions: string[]) {
  if (captions.length === 0) return { lowercase_pct: 0, short_caption_pct: 0, no_hashtags_pct: 0 }

  let lowercaseCount = 0
  let shortCount = 0
  let noHashtagCount = 0

  for (const cap of captions) {
    const trimmed = cap.trim()
    if (!trimmed) continue

    // Lowercase: caption has no uppercase letters (ignoring emojis/numbers/symbols)
    const letters = trimmed.replace(/[^a-zA-Z]/g, '')
    if (letters.length === 0 || letters === letters.toLowerCase()) lowercaseCount++

    // Short: under 10 words
    const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length
    if (wordCount < 10) shortCount++

    // No hashtags
    if (!trimmed.includes('#')) noHashtagCount++
  }

  const total = captions.length
  return {
    lowercase_pct: Math.round((lowercaseCount / total) * 100),
    short_caption_pct: Math.round((shortCount / total) * 100),
    no_hashtags_pct: Math.round((noHashtagCount / total) * 100),
  }
}

// ── HikerAPI scraper — extract EVERYTHING ────────────────────────────────────
async function scrapeViaHikerAPI(username: string): Promise<ScrapeResult> {
  const key = process.env.HIKER_API_KEY
  if (!key) return { posts: [], captions: [] }

  try {
    const userRes = await fetch(
      `https://api.hikerapi.com/v2/user/by/username?username=${encodeURIComponent(username)}`,
      { headers: { 'x-access-key': key, 'Accept': 'application/json' }, signal: AbortSignal.timeout(20000) }
    )
    if (!userRes.ok) return { posts: [], captions: [] }
    const userData = await userRes.json()
    const user = userData?.user || userData
    if (user?.is_private) return { posts: [], captions: [] }
    const userId = user?.pk || user?.id
    if (!userId) return { posts: [], captions: [] }

    // Extract full user profile
    const userProfile: UserProfile = {
      biography: user?.biography || user?.bio || undefined,
      followerCount: user?.follower_count || user?.followers || undefined,
      followingCount: user?.following_count || user?.following || undefined,
      mediaCount: user?.media_count || undefined,
      category: user?.category || user?.category_name || undefined,
      externalUrl: user?.external_url || undefined,
      fullName: user?.full_name || undefined,
      profilePicUrl: user?.profile_pic_url_hd || user?.profile_pic_url || undefined,
    }

    const mediaRes = await fetch(
      `https://api.hikerapi.com/v2/user/medias?user_id=${userId}&count=30`,
      { headers: { 'x-access-key': key, 'Accept': 'application/json' }, signal: AbortSignal.timeout(25000) }
    )
    if (!mediaRes.ok) return { posts: [], captions: [], userProfile }
    const mediaData = await mediaRes.json()
    const items: any[] = mediaData?.response?.items || mediaData?.items || mediaData?.data || []

    const posts: PostData[] = items.map((p: any) => {
      const cap = p?.caption
      const caption = typeof cap === 'string' ? cap : (cap?.text || '')
      const mediaTypeMap: Record<number, 'photo' | 'video' | 'carousel'> = { 1: 'photo', 2: 'video', 8: 'carousel' }

      // Extract best image URL
      const imageUrl = p?.image_versions2?.candidates?.[0]?.url
        || p?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
        || p?.thumbnail_url
        || undefined

      // Extract location
      const location = p?.location?.name || p?.location?.short_name || undefined

      // Extract usertags
      const usertags: string[] = (p?.usertags?.in || [])
        .map((t: any) => t?.user?.username)
        .filter(Boolean)

      return {
        caption,
        likes: p?.like_count || 0,
        comments: p?.comment_count || 0,
        mediaType: (mediaTypeMap[p?.media_type] ?? 'photo') as 'photo' | 'video' | 'carousel',
        takenAt: p?.taken_at ? new Date(p.taken_at * 1000).toISOString() : new Date().toISOString(),
        imageUrl,
        viewCount: p?.play_count || p?.view_count || undefined,
        location,
        usertags: usertags.length > 0 ? usertags : undefined,
        carouselCount: p?.carousel_media_count || undefined,
      }
    }).filter(p => p.caption.length > 3).slice(0, 30)

    return { posts, captions: posts.map(p => p.caption), userProfile }
  } catch {
    return { posts: [], captions: [] }
  }
}

// ── Apify fallback ────────────────────────────────────────────────────────────
async function scrapeViaApify(username: string): Promise<ScrapeResult> {
  const key = process.env.APIFY_API_KEY
  if (!key) return { posts: [], captions: [] }
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${key}&timeout=60`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [`https://www.instagram.com/${username}/`],
          resultsType: 'posts',
          resultsLimit: 30,
          proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
        }),
        signal: AbortSignal.timeout(65000),
      }
    )
    if (!res.ok) return { posts: [], captions: [] }
    const data = await res.json()
    const raw: any[] = Array.isArray(data) ? data : (data[0]?.latestPosts || [])
    if (raw.length === 1 && raw[0]?.error) return { posts: [], captions: [] }
    const posts: PostData[] = raw
      .filter(p => (p.caption || p.text || '').length > 3)
      .map(p => ({
        caption: p.caption || p.text || '',
        likes: p.likesCount || p.likes || 0,
        comments: p.commentsCount || p.comments || 0,
        mediaType: (p.type === 'Video' ? 'video' : p.type === 'Sidecar' ? 'carousel' : 'photo') as 'photo' | 'video' | 'carousel',
        takenAt: p.timestamp || new Date().toISOString(),
        imageUrl: p.displayUrl || p.url || undefined,
        viewCount: p.videoViewCount || undefined,
        location: p.locationName || undefined,
      }))
      .slice(0, 30)
    return { posts, captions: posts.map(p => p.caption) }
  } catch {
    return { posts: [], captions: [] }
  }
}

// ── Store post engagement in Supabase ─────────────────────────────────────────
async function savePostPerformance(artistName: string, posts: PostData[]) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const rows = posts.map(p => ({
      artist_name: artistName,
      caption: p.caption,
      likes: p.likes,
      comments: p.comments,
      media_type: p.mediaType,
      taken_at: p.takenAt,
      engagement_score: p.likes + (p.comments * 3),
      scanned_at: new Date().toISOString(),
    }))
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/post_performance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    })
  } catch { /* non-critical */ }
}

// ── Deep analysis — Sonnet on top 20, images + engagement ───────────────────
const SCAN_POST_LIMIT = 20
const SCAN_IMAGE_LIMIT = 8

async function deepAnalyse(name: string, posts: PostData[], userProfile?: UserProfile): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY!

  // Sort by engagement to find top performers, cap at SCAN_POST_LIMIT
  const sorted = [...posts].sort((a, b) => (b.likes + b.comments * 3) - (a.likes + a.comments * 3))
  const topPosts = sorted.slice(0, SCAN_POST_LIMIT)

  // Get image URLs for top-performing posts
  const imageUrls = topPosts
    .filter(p => p.imageUrl)
    .slice(0, SCAN_IMAGE_LIMIT)
    .map(p => p.imageUrl!)

  // Build the content array — text analysis + images
  const content: any[] = []

  // Add top-performing images for visual analysis
  for (const url of imageUrls) {
    content.push({
      type: 'image',
      source: { type: 'url', url },
    })
  }

  // Build rich post data for text analysis
  const postSummary = posts.map((p, i) => {
    const engagement = p.likes + (p.comments * 3)
    const parts = [
      `${i + 1}. "${p.caption}"`,
      `   ${p.likes} likes, ${p.comments} comments (score: ${engagement})`,
      `   Type: ${p.mediaType}${p.viewCount ? `, ${p.viewCount} views` : ''}`,
      p.location ? `   Location: ${p.location}` : null,
      p.usertags?.length ? `   Tagged: ${p.usertags.join(', ')}` : null,
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n')

  const bioSection = userProfile ? [
    `\n\nPROFILE:`,
    `Bio: ${userProfile.biography || 'none'}`,
    `Followers: ${userProfile.followerCount?.toLocaleString() || 'unknown'}`,
    `Following: ${userProfile.followingCount?.toLocaleString() || 'unknown'}`,
    `Total posts: ${userProfile.mediaCount || 'unknown'}`,
    userProfile.category ? `Category: ${userProfile.category}` : null,
    userProfile.externalUrl ? `Link: ${userProfile.externalUrl}` : null,
  ].filter(Boolean).join('\n') : ''

  // Engagement stats
  const avgLikes = Math.round(posts.reduce((s, p) => s + p.likes, 0) / posts.length)
  const avgComments = Math.round(posts.reduce((s, p) => s + p.comments, 0) / posts.length)
  const photoCount = posts.filter(p => p.mediaType === 'photo').length
  const videoCount = posts.filter(p => p.mediaType === 'video').length
  const carouselCount = posts.filter(p => p.mediaType === 'carousel').length
  const locations = [...new Set(posts.map(p => p.location).filter(Boolean))]
  const allTags = [...new Set(posts.flatMap(p => p.usertags || []))]

  const statsSection = `\n\nENGAGEMENT STATS:
Avg likes: ${avgLikes}, Avg comments: ${avgComments}
Content mix: ${photoCount} photos, ${videoCount} videos, ${carouselCount} carousels
${locations.length > 0 ? `Locations: ${locations.join(', ')}` : 'No locations tagged'}
${allTags.length > 0 ? `Frequently tagged: ${allTags.slice(0, 10).join(', ')}` : 'No usertags'}`

  content.push({
    type: 'text',
    text: `You are doing a DEEP analysis of electronic music artist "${name}" for a voice + visual profiling system. You have their top ${topPosts.length} Instagram posts (by engagement) with full data, and their top-performing images above.

POSTS (ordered by recency):
${postSummary}
${bioSection}
${statsSection}

Analyse EVERYTHING — their writing voice, visual aesthetic, what content performs, their brand positioning, posting patterns, and the specific moves that make them recognisable.

The images above are their TOP-PERFORMING posts. Study the visual patterns: lighting, colour palette, subject matter, composition, mood. What do their best images have in common?

Return this exact JSON:
{
  "handle": "@instagramhandle",
  "genre": "genre (2-3 words max)",
  "lowercase_pct": number 0-100,
  "short_caption_pct": number 0-100 (captions under 10 words),
  "no_hashtags_pct": number 0-100,
  "chips": ["5-7 short style descriptors covering BOTH voice and visual, max 2 words each"],
  "highlight_chips": [0, 1, 2],
  "style_rules": "6-8 sentences. Cover BOTH writing voice AND visual aesthetic. Be specific and actionable: what do they always do, what do they never do, signature moves, what triggers saves. This feeds AI caption generation AND content recommendations.",
  "visual_aesthetic": {
    "mood": "2-3 word mood descriptor (e.g. 'dark atmospheric raw')",
    "palette": "dominant colour description",
    "subjects": ["what appears in their images — up to 5"],
    "signature_visual": "one sentence — their most recognisable visual move",
    "avoid": "what they never post visually"
  },
  "content_performance": {
    "best_type": "photo|video|carousel — which format gets most engagement",
    "best_subject": "what kind of content performs best for them",
    "engagement_rate": "calculated as (avg likes + avg comments) / followers as percentage, or 'unknown' if no follower data",
    "posting_frequency": "how often they post based on timestamps",
    "peak_content": "one sentence — their single highest-performing content pattern"
  },
  "brand_positioning": "2-3 sentences on how they position themselves — mysterious vs accessible, underground vs mainstream, personal vs professional",
  "collaboration_network": "who they tag and work with — labels, venues, other artists",
  "content_strategy_notes": "3-4 specific, actionable observations about their strategy that could inform someone in the same lane"
}`
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'You are an elite music industry content analyst. You deeply understand electronic music culture, underground aesthetics, and what makes artist brands resonate. Respond ONLY with valid JSON, no markdown.',
      messages: [{ role: 'user', content }],
    }),
  })

  const data = await res.json()
  if (data.error) {
    console.error(`[deepAnalyse] API error for ${name}:`, data.error)
    // Retry without images if image URLs caused the error
    if (imageUrls.length > 0) {
      console.log(`[deepAnalyse] Retrying ${name} without images...`)
      const textOnlyContent = content.filter((c: any) => c.type !== 'image')
      const retryRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 2000, system: 'You are an elite music industry content analyst. Respond ONLY with valid JSON, no markdown.', messages: [{ role: 'user', content: textOnlyContent }] }),
      })
      const retryData = await retryRes.json()
      if (retryData.error) { console.error(`[deepAnalyse] Retry also failed:`, retryData.error); return {} }
      const retryText = retryData.content?.[0]?.text || '{}'
      return JSON.parse(retryText.replace(/```json|```/g, '').trim())
    }
    return {}
  }
  const text = data.content?.[0]?.text || '{}'
  console.log(`[deepAnalyse] ${name}: got ${text.length} chars response`)
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// ── Lightweight analysis for manual caption paste (no images available) ───────
async function analyseTextOnly(name: string, captions: string[]): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: 'You are an elite music industry content analyst. Respond ONLY with valid JSON, no markdown.',
      messages: [{
        role: 'user',
        content: `Analyse the exact social media voice of music artist "${name}" from these ${captions.length} real Instagram captions:\n\n${captions.map((c, i) => `${i + 1}. ${JSON.stringify(c)}`).join('\n')}\n\nReturn this exact JSON:\n{\n  "handle": "@instagramhandle",\n  "genre": "genre (2-3 words max)",\n  "lowercase_pct": number 0-100,\n  "short_caption_pct": number 0-100 (captions under 10 words),\n  "no_hashtags_pct": number 0-100,\n  "chips": ["5-7 short style descriptors, max 2 words each"],\n  "highlight_chips": [0, 1, 2],\n  "style_rules": "6-8 sentences. Specific and actionable: what do they always do structurally, what do they never do, signature moves, what triggers saves, emotional register.",\n  "brand_positioning": "2-3 sentences on how they position themselves",\n  "content_strategy_notes": "3-4 specific observations about their caption strategy"\n}`,
      }],
    }),
  })
  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { name, handle, manualCaptions } = await req.json()
    if (!name) return NextResponse.json({ success: false, error: 'Artist name required' }, { status: 400 })

    // Tier-gate BEFORE any model call (Sonnet) to avoid token burn on a 402
    const userId = await resolveUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, error: 'No user session' }, { status: 401 })
    }
    const gate = await canRunArtistScan(userId)
    if (!gate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Artist Scan limit reached',
          message: gate.upgradeMessage,
          used: gate.used,
          limit: gate.limit,
        },
        { status: 402 }
      )
    }

    // Manual caption paste — text-only analysis (no images)
    if (manualCaptions && Array.isArray(manualCaptions) && manualCaptions.length > 0) {
      const profile = await analyseTextOnly(name, manualCaptions)
      const realStats = calcCaptionStats(manualCaptions)
      // Ledger the run — manual paste still counts (Sonnet was called)
      try {
        const tierAtRun = await getUserTier(userId)
        await recordArtistScanRun(userId, (handle || name).toLowerCase(), tierAtRun)
      } catch (e) { console.error('[artist-scan] ledger failed', e) }
      return NextResponse.json({
        success: true,
        profile: {
          name, ...profile,
          ...realStats, // override Claude's guesses with real calculated stats
          data_source: 'manual',
          post_count_analysed: manualCaptions.length,
          last_scanned: new Date().toISOString().split('T')[0],
        },
      })
    }

    const targetUsername = (handle || name).toLowerCase().replace(/[^a-z0-9_.]/g, '')

    let result = await scrapeViaHikerAPI(targetUsername)
    let dataSource: 'hikerapi' | 'apify' | 'manual' = 'hikerapi'

    if (result.captions.length === 0) {
      result = await scrapeViaApify(targetUsername)
      dataSource = 'apify'
    }

    if (result.captions.length === 0) {
      const hasAnyKey = !!(process.env.HIKER_API_KEY || process.env.APIFY_API_KEY)
      return NextResponse.json({
        success: false,
        error: hasAnyKey
          ? `Can't find ${name} — their Instagram handle is probably different from their name (e.g. Bicep → feelmybicep, HAAi → haaihaaihaai). Add the correct handle and try again.`
          : `No scraper configured. Add HIKER_API_KEY (hikerapi.com) to enable automatic scanning.`,
        canPaste: true,
      }, { status: 404 })
    }

    // Save engagement data (non-blocking)
    savePostPerformance(name, result.posts)

    // Deep analysis — Opus with images + captions + engagement + profile
    console.log(`[artist-scan] ${name}: ${result.posts.length} posts, userProfile: ${!!result.userProfile}, dataSource: ${dataSource}`)
    const profile = await deepAnalyse(name, result.posts, result.userProfile)
    console.log(`[artist-scan] ${name}: deepAnalyse returned keys:`, Object.keys(profile))
    const realStats = calcCaptionStats(result.captions)
    const realEngagement = calcEngagementRate(result.posts, result.userProfile?.followerCount)
    const realBestFormat = calcBestFormat(result.posts)

    // Override Claude's guesses with real calculated values
    if (profile.content_performance) {
      if (realEngagement) profile.content_performance.engagement_rate = realEngagement
      if (realBestFormat) profile.content_performance.best_type = realBestFormat
    }

    const fullProfile = {
      name, ...profile,
      ...realStats,
      data_source: dataSource,
      post_count_analysed: result.captions.length,
      last_scanned: new Date().toISOString().split('T')[0],
      profile_pic_url: result.userProfile?.profilePicUrl || undefined,
      follower_count: result.userProfile?.followerCount || undefined,
      biography: result.userProfile?.biography || undefined,
    }

    // Auto-save to artist_profiles so scan data is never lost
    supabase.from('artist_profiles').upsert(fullProfile, { onConflict: 'name' }).then(({ error }) => {
      if (error) console.error(`[artist-scan] Failed to save ${name}:`, error.message)
      else console.log(`[artist-scan] Saved ${name} to artist_profiles`)
    })

    // Ledger the run for tier accounting (after successful scrape + Sonnet only)
    try {
      const tierAtRun = await getUserTier(userId)
      await recordArtistScanRun(userId, targetUsername, tierAtRun)
    } catch (e) { console.error('[artist-scan] ledger failed', e) }

    return NextResponse.json({ success: true, profile: fullProfile })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    hikerapi: process.env.HIKER_API_KEY ? 'connected' : 'not configured',
    apify: process.env.APIFY_API_KEY ? 'connected (needs Personal plan for Instagram)' : 'not configured',
  })
}
