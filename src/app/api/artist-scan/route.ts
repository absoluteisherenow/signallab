import { NextRequest, NextResponse } from 'next/server'

// ── HikerAPI scraper ─────────────────────────────────────────────────────────
// Sign up free at hikerapi.com — 100 req/month free, then from $10/month
// Add HIKER_API_KEY to Vercel env vars

async function scrapeViaHikerAPI(username: string): Promise<{ captions: string[]; postCount: number }> {
  const key = process.env.HIKER_API_KEY
  if (!key) return { captions: [], postCount: 0 }

  try {
    // Step 1: resolve username → user ID (v2 endpoint)
    const userRes = await fetch(
      `https://api.hikerapi.com/v2/user/by/username?username=${encodeURIComponent(username)}`,
      {
        headers: { 'x-access-key': key, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(20000),
      }
    )
    if (!userRes.ok) return { captions: [], postCount: 0 }
    const userData = await userRes.json()
    // v2 returns { user: { pk, is_private, ... } } or flat { pk, ... }
    const user = userData?.user || userData
    if (user?.is_private) return { captions: [], postCount: 0 }
    const userId = user?.pk || user?.id
    if (!userId) return { captions: [], postCount: 0 }

    // Step 2: fetch recent posts (v2 — returns { response: { items: [...] }, next_page_id })
    const mediaRes = await fetch(
      `https://api.hikerapi.com/v2/user/medias?user_id=${userId}&count=30`,
      {
        headers: { 'x-access-key': key, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(25000),
      }
    )
    if (!mediaRes.ok) return { captions: [], postCount: 0 }
    const mediaData = await mediaRes.json()
    const items: any[] = mediaData?.response?.items || mediaData?.items || mediaData?.data || []
    const captions = items
      .map((p: any) => {
        const cap = p?.caption
        return typeof cap === 'string' ? cap : (cap?.text || '')
      })
      .filter((c: string) => c.length > 3)
      .slice(0, 30)
    return { captions, postCount: items.length }
  } catch {
    return { captions: [], postCount: 0 }
  }
}

// ── Apify fallback (requires Personal plan for residential proxies) ───────────
async function scrapeViaApify(username: string): Promise<{ captions: string[]; postCount: number }> {
  const key = process.env.APIFY_API_KEY
  if (!key) return { captions: [], postCount: 0 }
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
    if (!res.ok) return { captions: [], postCount: 0 }
    const data = await res.json()
    const posts: any[] = Array.isArray(data) ? data : (data[0]?.latestPosts || [])
    // Check Apify returned real posts (not a bot-block empty response)
    if (posts.length === 1 && posts[0]?.error) return { captions: [], postCount: 0 }
    const captions = posts.map((p: any) => p.caption || p.text || '').filter((c: string) => c.length > 3).slice(0, 30)
    return { captions, postCount: posts.length }
  } catch {
    return { captions: [], postCount: 0 }
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
          name,
          ...profile,
          data_source: 'manual',
          post_count_analysed: manualCaptions.length,
          last_scanned: new Date().toISOString().split('T')[0],
        },
      })
    }

    const targetUsername = (handle || name).toLowerCase().replace(/[^a-z0-9_.]/g, '')

    // Try HikerAPI first (purpose-built for Instagram, residential proxies built-in)
    let result = await scrapeViaHikerAPI(targetUsername)
    let dataSource: 'hikerapi' | 'apify' | 'manual' = 'hikerapi'

    // Fall back to Apify if HikerAPI not configured or returned nothing
    if (result.captions.length === 0) {
      result = await scrapeViaApify(targetUsername)
      dataSource = 'apify'
    }

    if (result.captions.length === 0) {
      const hasAnyKey = !!(process.env.HIKER_API_KEY || process.env.APIFY_API_KEY)
      return NextResponse.json({
        success: false,
        error: hasAnyKey
          ? `No posts found for ${name} — their Instagram may be set to private, or try a different handle (e.g. @artistname).`
          : `No scraper configured. Add HIKER_API_KEY (hikerapi.com) to enable automatic scanning.`,
        canPaste: true,
      }, { status: 404 })
    }

    const profile = await analyseWithClaude(name, result.captions)
    return NextResponse.json({
      success: true,
      profile: {
        name,
        ...profile,
        data_source: dataSource,
        post_count_analysed: result.captions.length,
        last_scanned: new Date().toISOString().split('T')[0],
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
