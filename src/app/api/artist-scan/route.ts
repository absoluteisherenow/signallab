import { NextRequest, NextResponse } from 'next/server'

interface PostData {
  caption: string
  likes: number
  comments: number
  mediaType: 'photo' | 'video' | 'carousel'
  takenAt: string
}

interface ScrapeResult {
  posts: PostData[]
  captions: string[]
  profilePicUrl?: string
}

// ── HikerAPI scraper ─────────────────────────────────────────────────────────
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

    const mediaRes = await fetch(
      `https://api.hikerapi.com/v2/user/medias?user_id=${userId}&count=30`,
      { headers: { 'x-access-key': key, 'Accept': 'application/json' }, signal: AbortSignal.timeout(25000) }
    )
    if (!mediaRes.ok) return { posts: [], captions: [] }
    const mediaData = await mediaRes.json()
    const items: any[] = mediaData?.response?.items || mediaData?.items || mediaData?.data || []

    const posts: PostData[] = items.map((p: any) => {
      const cap = p?.caption
      const caption = typeof cap === 'string' ? cap : (cap?.text || '')
      const mediaTypeMap: Record<number, 'photo' | 'video' | 'carousel'> = { 1: 'photo', 2: 'video', 8: 'carousel' }
      return {
        caption,
        likes: p?.like_count || 0,
        comments: p?.comment_count || 0,
        mediaType: (mediaTypeMap[p?.media_type] ?? 'photo') as 'photo' | 'video' | 'carousel',
        takenAt: p?.taken_at ? new Date(p.taken_at * 1000).toISOString() : new Date().toISOString(),
      }
    }).filter(p => p.caption.length > 3).slice(0, 30)

    const profilePicUrl = user?.profile_pic_url || user?.profile_pic_url_hd || undefined
    return { posts, captions: posts.map(p => p.caption), profilePicUrl }
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
      engagement_score: p.likes + (p.comments * 3), // comments weighted 3x
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
  } catch {
    // non-critical — don't fail the scan if this fails
  }
}

// ── Analyse captions with Claude ─────────────────────────────────────────────
async function analyseWithClaude(name: string, captions: string[]): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: 'You are a social media voice analyst. Respond ONLY with valid JSON, no markdown.',
      messages: [{
        role: 'user',
        content: `Analyse the exact social media voice of music artist "${name}" from these ${captions.length} real Instagram captions:\n\n${captions.map((c, i) => `${i + 1}. ${JSON.stringify(c)}`).join('\n')}\n\nStudy the patterns deeply — word count, punctuation, capitalisation, hashtag use, what they never do, emotional register, structural moves.\n\nReturn this exact JSON:\n{\n  "handle": "@instagramhandle",\n  "genre": "genre (2-3 words max)",\n  "lowercase_pct": number 0-100,\n  "short_caption_pct": number 0-100 (captions under 10 words),\n  "no_hashtags_pct": number 0-100,\n  "chips": ["3-5 short style descriptors, max 2 words each"],\n  "highlight_chips": [0, 1],\n  "style_rules": "4-6 sentences. Must be specific and actionable: what do they always do structurally, what do they never do, what is the signature move that makes their voice recognisable, what triggers saves in their posts, what emotional register do they operate in. This feeds directly into AI caption generation — make it a brief for a copywriter, not a description."\n}`,
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

    // Manual caption paste — user provides real captions directly
    if (manualCaptions && Array.isArray(manualCaptions) && manualCaptions.length > 0) {
      const profile = await analyseWithClaude(name, manualCaptions)
      return NextResponse.json({
        success: true,
        profile: {
          name, ...profile,
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

    // Save engagement data for trend analysis (non-blocking)
    savePostPerformance(name, result.posts)

    const profile = await analyseWithClaude(name, result.captions)
    return NextResponse.json({
      success: true,
      profile: {
        name, ...profile,
        data_source: dataSource,
        post_count_analysed: result.captions.length,
        last_scanned: new Date().toISOString().split('T')[0],
        ...(result.profilePicUrl ? { profile_pic_url: result.profilePicUrl } : {}),
      },
    })
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
