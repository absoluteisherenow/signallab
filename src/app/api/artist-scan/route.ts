import { NextRequest, NextResponse } from 'next/server'

async function scrapeInstagramPosts(username: string): Promise<{ captions: string[]; postCount: number }> {
  if (!process.env.APIFY_API_KEY) return { captions: [], postCount: 0 }
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_KEY}&timeout=60`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [`https://www.instagram.com/${username.replace('@', '')}/`],
          resultsType: 'posts',
          resultsLimit: 30,
        }),
        signal: AbortSignal.timeout(50000),
      }
    )
    if (!res.ok) return { captions: [], postCount: 0 }
    const data = await res.json()
    // apify~instagram-scraper returns a flat array of post objects
    const posts: any[] = Array.isArray(data) ? data : (data[0]?.latestPosts || [])
    const captions = posts.map((p: any) => p.caption || p.text || '').filter((c: string) => c.length > 0).slice(0, 30)
    return { captions, postCount: posts.length }
  } catch {
    return { captions: [], postCount: 0 }
  }
}

async function analyseWithClaude(name: string, captions: string[]): Promise<any> {
  const hasRealData = captions.length > 0
  const analysisContent = hasRealData
    ? `Analyse the exact social media voice of music artist "${name}" from these ${captions.length} real Instagram captions:\n\n${captions.map((c, i) => `${i + 1}. ${JSON.stringify(c)}`).join('\n')}\n\nStudy the patterns deeply — word count, punctuation, capitalisation, hashtag use, what they never do, emotional register, structural moves.`
    : `Based on your knowledge of music artist "${name}", analyse their social media posting style on Instagram and TikTok in depth.`

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
        content: `${analysisContent}

Return this exact JSON:
{
  "handle": "@instagramhandle",
  "genre": "genre (2-3 words max)",
  "lowercase_pct": number 0-100,
  "short_caption_pct": number 0-100 (captions under 10 words),
  "no_hashtags_pct": number 0-100,
  "chips": ["3-5 short style descriptors, max 2 words each"],
  "highlight_chips": [0, 1],
  "style_rules": "4-6 sentences. Must be specific and actionable: what do they always do structurally, what do they never do, what is the signature move that makes their voice recognisable, what triggers saves in their posts, what emotional register do they operate in. This feeds directly into AI caption generation — make it a brief for a copywriter, not a description."
}`,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

export async function POST(req: NextRequest) {
  try {
    const { name, handle } = await req.json()
    if (!name) return NextResponse.json({ success: false, error: 'Artist name required' }, { status: 400 })

    if (!process.env.APIFY_API_KEY) {
      return NextResponse.json({ success: false, error: 'Instagram scanning requires Apify — add APIFY_API_KEY to enable real post analysis' }, { status: 503 })
    }

    const targetUsername = (handle || name).toLowerCase().replace(/[^a-z0-9_.]/g, '')
    const { captions, postCount } = await scrapeInstagramPosts(targetUsername)

    if (captions.length === 0) {
      return NextResponse.json({ success: false, error: `No posts found for ${name} — check the Instagram handle is correct` }, { status: 404 })
    }

    const profile = await analyseWithClaude(name, captions)
    return NextResponse.json({
      success: true,
      profile: {
        name,
        ...profile,
        data_source: 'apify',
        post_count_analysed: captions.length || postCount,
        last_scanned: new Date().toISOString().split('T')[0],
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', apify: !!process.env.APIFY_API_KEY ? 'connected' : 'not configured — using Claude only' })
}
