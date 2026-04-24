import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SKILL_CONTENT_SCORING } from '@/lib/skillPrompts'
import { getFile } from '@/lib/storage'
import { callClaude } from '@/lib/callClaude'

// ── Server-side content scanner ──────────────────────────────────────────────
// Same Sonnet vision analysis as the client-side MediaScanner, but runs
// server-side so photographer uploads get auto-scanned without the artist
// needing to manually scan each file.
//
// POST /api/media/scan
// Body: { url, gigId, fileName, mimeType }
// Returns: { scanId, composite, verdict, scores, category, ... }
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function compositeScore(scores: { reach: number; authenticity: number; culture: number; visual_identity: number }) {
  // Weighted: Reach 25%, Authenticity 30%, Culture 25%, Visual Identity 20%
  return Math.round((scores.reach * 0.25) + (scores.authenticity * 0.30) + (scores.culture * 0.25) + (scores.visual_identity * 0.20))
}

function getVerdict(score: number): string {
  if (score >= 75) return 'POST IT'
  if (score >= 60) return 'TWEAK'
  if (score >= 45) return 'RECONSIDER'
  return "DON'T POST"
}

function detectCategory(tags: string[], recommendation: string): string {
  const combined = [...tags, recommendation].join(' ').toLowerCase()
  if (combined.match(/crowd|live|dance|floor|audience|hands/)) return 'crowd'
  if (combined.match(/studio|gear|synth|mixer|daw|production/)) return 'studio'
  if (combined.match(/promo|portrait|headshot|press|posed/)) return 'promo'
  if (combined.match(/backstage|soundcheck|behind|setup|load/)) return 'bts'
  if (combined.match(/artwork|cover|sleeve|graphic|design/)) return 'artwork'
  if (combined.match(/travel|airport|hotel|train|tour/)) return 'travel'
  return 'other'
}

export async function POST(req: NextRequest) {
  try {
    const { url, key, gigId, fileName, mimeType } = await req.json()
    if (!url && !key) return NextResponse.json({ error: 'No URL or key provided' }, { status: 400 })

    const isImage = mimeType?.startsWith('image/')

    // Videos: save record but skip vision analysis (no server-side frame extraction)
    if (!isImage) {
      const { data: row } = await supabase.from('media_scans').insert({
        gig_id: gigId || null,
        file_url: url,
        file_name: fileName || null,
        file_type: mimeType || null,
        source: 'upload',
        verdict: 'VIDEO_PENDING',
        uploaded_by: 'photographer',
        created_at: new Date().toISOString(),
      }).select('id').single()

      return NextResponse.json({
        scanId: row?.id,
        skipped: true,
        reason: 'Video auto-scan requires manual review via MediaScanner',
      })
    }

    // 1. Get image bytes — try R2 direct first, fallback to URL fetch
    let imgBuffer: ArrayBuffer
    if (key) {
      const file = await getFile(key)
      if (!file) return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
      // Cap the stream read at 25s — a slow R2 reader or network hiccup can
      // hold the Worker thread past its CPU budget, and the user sees a
      // dead scan with no log. Bail with a clean error instead.
      const reader = file.body.getReader()
      const chunks: Uint8Array[] = []
      const deadline = Date.now() + 25_000
      while (true) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) {
          try { await reader.cancel() } catch {}
          return NextResponse.json({ error: 'R2 read timed out — retry scan or check bucket health' }, { status: 504 })
        }
        const result = await Promise.race([
          reader.read(),
          new Promise<{ value: undefined; done: true; timedOut: true }>(r =>
            setTimeout(() => r({ value: undefined, done: true, timedOut: true }), remaining)
          ),
        ])
        if ('timedOut' in result && result.timedOut) {
          try { await reader.cancel() } catch {}
          return NextResponse.json({ error: 'R2 read timed out — retry scan or check bucket health' }, { status: 504 })
        }
        if (result.value) chunks.push(result.value)
        if (result.done) break
      }
      imgBuffer = Buffer.concat(chunks).buffer
    } else {
      const imgRes = await fetch(url)
      if (!imgRes.ok) return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
      imgBuffer = await imgRes.arrayBuffer()
    }
    const base64 = Buffer.from(imgBuffer).toString('base64')
    const mediaType = mimeType || 'image/jpeg'

    // 2. Get artist context
    let artistName = 'the artist'
    try {
      const { data: settings } = await supabase
        .from('artist_settings')
        .select('artist_name, profile')
        .single()
      artistName = settings?.artist_name || settings?.profile?.name || 'the artist'
    } catch { /* non-critical */ }

    // 3. Build prompts (identical to client-side MediaScanner)
    const systemPrompt = `You are an expert visual content strategist for electronic music artists \u2014 Bicep, Floating Points, fred again.., Four Tet, Bonobo. You deeply understand what images and photos perform in this world: raw, atmospheric, authentic.

${SKILL_CONTENT_SCORING}

Analyse what you genuinely see in this image. Return ONLY valid JSON \u2014 no markdown, no explanation.`

    const textPrompt = `You are looking at a photo called "${fileName || 'uploaded image'}".

Analyse what you see:
- SUBJECT: what\u2019s in the image \u2014 crowd, artist, studio, venue, record, equipment, landscape, abstract
- LIGHTING: quality, colour, mood, drama
- COMPOSITION: framing, depth, focus, visual interest
- EMOTIONAL QUALITY: raw vs polished, authentic vs staged, atmospheric vs flat
- PLATFORM FIT: would this stop a scroll on Instagram? Work as a grid post? A story?
- AESTHETIC: does it fit the underground electronic music world

Return JSON exactly:
{
  "best_moment": {
    "timestamp": 0,
    "frame_number": 1,
    "score": <0-100>,
    "reason": "<describe exactly what you see \u2014 subject, lighting, composition, why it works or doesn\u2019t>",
    "type": "peak|crowd|lighting|transition|intimate"
  },
  "moments": [
    { "timestamp": 0, "frame_number": 1, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" }
  ],
  "overall_energy": <1-10>,
  "best_clip_start": 0,
  "best_clip_end": 0,
  "visual_quality": "<one sentence on image quality, lighting, sharpness, composition>",
  "caption_context": "<one sentence describing what is in the image \u2014 use for caption generation>",
  "post_recommendation": "<specific recommendation: grid post, story, carousel lead, skip>",
  "content_score": {
    "reach": <0-100 scroll-stop power, hook strength, share trigger>,
    "authenticity": <0-100 voice consistency, genuine energy, personal signature>,
    "culture": <0-100 scene credibility, underground codes, genre awareness>,
    "visual_identity": <0-100 colour palette, tonal match, composition style>,
    "reasoning": "<based on what you see: subject, mood, composition, platform fit>"
  },
  "tags": ["<subject>", "<mood>", "<context if detectable>"],
  "tone_match": "<which reference artist\u2019s aesthetic this feels closest to, and why>",
  "platform_cuts": {
    "instagram": "<grid post / carousel / skip \u2014 why>",
    "tiktok": "<still image with audio / skip \u2014 why>",
    "story": "<good for story / skip \u2014 why>"
  },
  "platform_ranking": [
    { "platform": "Instagram Grid", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Instagram Story", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Carousel Lead", "score": <0-100>, "reason": "<would this work as the first image in a carousel>" }
  ]
}`

    // 4. Call Anthropic Sonnet vision
    const res = await callClaude({
      feature: 'media_scan',
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: textPrompt },
        ],
      }],
    })

    if (!res.ok) {
      throw new Error(res.data?.error?.message || `Anthropic API error ${res.status}`)
    }

    const rawText = res.text || ''
    const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())

    // 5. Calculate scores
    const scores = parsed.content_score
    const composite = compositeScore(scores)
    const verdict = getVerdict(composite)
    const category = detectCategory(parsed.tags || [], parsed.post_recommendation || '')

    // 6. Save to DB (Auto-Save Scan Data pillar)
    const { data: row, error: dbError } = await supabase.from('media_scans').insert({
      gig_id: gigId || null,
      file_url: url,
      file_name: fileName || null,
      file_type: mimeType || null,
      source: 'upload',
      composite_score: composite,
      reach_score: scores.reach,
      authenticity_score: scores.authenticity,
      culture_score: scores.culture,
      visual_identity_score: scores.visual_identity,
      verdict,
      scan_result: parsed,
      caption_context: parsed.caption_context || null,
      post_recommendation: parsed.post_recommendation || null,
      category,
      tags: parsed.tags || [],
      uploaded_by: 'photographer',
      scanned_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }).select('id').single()

    if (dbError) {
      console.error('Failed to save scan result:', dbError.message)
    }

    // Usage tracked automatically by callClaude → api_usage.

    return NextResponse.json({
      scanId: row?.id,
      composite,
      verdict,
      scores: {
        reach: scores.reach,
        authenticity: scores.authenticity,
        culture: scores.culture,
        visual_identity: scores.visual_identity,
      },
      category,
      captionContext: parsed.caption_context,
      postRecommendation: parsed.post_recommendation,
      tags: parsed.tags,
      platformRanking: parsed.platform_ranking,
    })
  } catch (err: any) {
    console.error('Media scan error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
