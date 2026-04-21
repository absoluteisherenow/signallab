/**
 * chainScan — minimal scan pipeline for the Broadcast chain flow.
 *
 * Self-contained version of the MediaScanner scan logic (frame extract +
 * Claude vision call + JSON parse). No UI. No persistence to DB — the caller
 * can fire-and-forget a POST to /api/media/scans after success.
 */

import { SKILLS_MEDIA_SCANNER } from './skillPromptsClient'

export interface ChainScanMoment {
  timestamp: number
  frame_number?: number
  score: number
  reason: string
  type: 'peak' | 'crowd' | 'lighting' | 'transition' | 'intimate'
}

export interface ChainScanResult {
  best_moment: ChainScanMoment
  moments: ChainScanMoment[]
  overall_energy: number
  best_clip_start: number
  best_clip_end: number
  caption_context: string
  post_recommendation: string
  content_score: {
    reach: number
    authenticity: number
    culture: number
    visual_identity: number
    shareable_core: number
    shareable_core_note: string
    reasoning: string
    aesthetic?: number
  }
  tags: string[]
  tone_match: string
  platform_cuts: { instagram: string; tiktok: string; story: string }
  platform_ranking: { platform: string; score: number; reason: string }[]
  /** Optional WOW line — a short editorial-director read that names the
   *  single most surprising / shareable / culturally-alive thing about
   *  this clip. Written for the artist to feel: "yes, the scanner actually
   *  SAW this." Added Apr 2026 as part of the Opus scanner upgrade. */
  wow_note?: string
  /** Optional editorial angle — one-sentence recommendation on how this
   *  should be posted (eg. "release tease carousel slide 3", "story only,
   *  too intimate for grid"). Meant to sit between raw scan and caption
   *  gen so the artist has a direction, not just a score. */
  editorial_angle?: string
}

export interface ScanFrame { dataUrl: string; timestamp: number }

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export async function extractFrames(file: File, count = 8): Promise<ScanFrame[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return reject(new Error('canvas 2d context unavailable'))
    const frames: ScanFrame[] = []

    video.preload = 'metadata'
    video.src = URL.createObjectURL(file)

    video.onloadedmetadata = () => {
      // Preserve the source's aspect ratio. The previous 480x270 hardcode
      // squashed every 9:16 Reel into 16:9, which both distorted the hero
      // thumbnail in the results UI and fed Claude a stretched frame (wrong
      // composition judgement). MAX keeps the JPEG payload lean for the
      // vision call; portrait and landscape both scale to fit under it.
      const MAX = 720
      const vw = video.videoWidth || 16
      const vh = video.videoHeight || 9
      const aspect = vw / vh
      if (aspect >= 1) {
        canvas.width = Math.min(MAX, vw)
        canvas.height = Math.round(canvas.width / aspect)
      } else {
        canvas.height = Math.min(MAX, vh)
        canvas.width = Math.round(canvas.height * aspect)
      }
      const duration = video.duration || 1
      const interval = duration / (count - 1)
      let captured = 0

      const capture = (t: number) => { video.currentTime = t }

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push({
          dataUrl: canvas.toDataURL('image/jpeg', 0.75),
          timestamp: video.currentTime,
        })
        captured++
        if (captured < count) capture(captured * interval)
        else {
          URL.revokeObjectURL(video.src)
          resolve(frames)
        }
      }

      capture(0)
    }
    video.onerror = () => reject(new Error('video failed to load'))
  })
}

export async function extractImageFrame(file: File): Promise<ScanFrame[]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return reject(new Error('canvas 2d context unavailable'))
    img.onload = () => {
      const scale = Math.min(1, 720 / img.width)
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve([{ dataUrl: canvas.toDataURL('image/jpeg', 0.8), timestamp: 0 }])
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = URL.createObjectURL(file)
  })
}

async function callClaudeVision(
  system: string,
  frames: ScanFrame[],
  textPrompt: string,
  maxTokens = 2000,
): Promise<string> {
  const content: object[] = frames.map((f, idx) => {
    const match = f.dataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/)
    if (!match) throw new Error(`frame ${idx + 1} produced an invalid data URL`)
    return {
      type: 'image',
      source: { type: 'base64', media_type: match[1], data: match[2] },
    }
  })
  const frameLabels = frames.map((f, i) => `Frame ${i + 1}: ${f.timestamp.toFixed(1)}s`).join(' | ')
  content.push({ type: 'text', text: `Frame timestamps: ${frameLabels}\n\n${textPrompt}` })

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Sonnet drafts the vision scan (grunt work). Opus oversight polish
      // runs after in runScanEditorialPolish and rewrites the artist-facing
      // strings (wow_note, editorial_angle, caption_context,
      // post_recommendation) where prose quality actually matters. This is
      // ~5x cheaper than all-Opus and keeps the WOW feel because the strings
      // the artist READS are Opus-written.
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: maxTokens,
      // temperature: 0 so the same image scores reproducibly. Without this,
      // Claude defaults to 1.0 and each re-scan of an identical file drifts
      // several points across the 5 pillars, producing different composites.
      // Scoring must be deterministic; caption variance lives in chainCaptionGen.
      temperature: 0,
      messages: [{ role: 'user', content }],
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `API error ${res.status}`)
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty response from API')
  return text
}

function buildSystemPrompt(isImage: boolean): string {
  const NO_DASHES = `HARD TEXT RULE: In every string field you output (reason, caption_context, post_recommendation, tone_match, shareable_core_note, reasoning, platform_cuts.*, platform_ranking[].reason, wow_note, editorial_angle), NEVER use em-dashes (\u2014) or en-dashes (\u2013). Use commas, full stops, or split into separate sentences. This is surfaced directly in the UI.`

  const EDITORIAL = `EDITORIAL DIRECTOR ROLE: You are also the artist's editorial director for this upload. You produce TWO extra fields that make the scan feel alive to the artist, not just scored.

- wow_note: ONE short sentence (under 25 words, no dashes, no cliché). Name the SINGLE most surprising / shareable / culturally-alive thing about this specific clip. Not a summary of the scores. Not a platform recommendation. The thing a smart friend would text the artist: "Dude, the moment at 1:22 when the crowd catches the drop, that's the post." If there's nothing genuinely wow-worthy, say so plainly ("thin for a solo post, might work as carousel slide 3"). Never fake enthusiasm.
- editorial_angle: ONE short sentence (under 20 words). The actual POSTING RECOMMENDATION in plain-artist terms: "story only, too intimate for grid" / "Reel lead with the 2s crowd shot" / "carousel slide 3, not a lead" / "don't post solo, keep for collage". Not "post to TikTok" — that's platform_ranking's job.

Both fields go straight to the UI above the scores. They are the artist's headline read. Never hedge, never use words like "consider", "potentially", "might be suitable". Direct editorial call.`

  if (isImage) {
    return `You are an expert visual content strategist for electronic music artists (Bicep, Floating Points, fred again.., Four Tet, Bonobo).

${SKILLS_MEDIA_SCANNER}

${EDITORIAL}

${NO_DASHES}

Analyse what you genuinely see. Return ONLY valid JSON. No markdown, no explanation.`
  }
  return `You are an expert video editor and social media strategist for electronic music artists (Bicep, Floating Points, fred again.., Four Tet, Bonobo).

CRITICAL SOCIAL MEDIA RULE: The clip MUST start on the strongest, most attention-grabbing frame. The first 1-3 seconds decide everything on TikTok and Instagram Reels. Never bury the best moment in the middle. Set best_clip_start AT or just before best_moment.timestamp so the hook is the opening frame.

${SKILLS_MEDIA_SCANNER}

${EDITORIAL}

${NO_DASHES}

Analyse what you genuinely see in each frame. Return ONLY valid JSON. No markdown, no explanation.`
}

function buildTextPrompt(file: File, frames: ScanFrame[]): string {
  const isImage = isImageFile(file)
  if (isImage) {
    return `You are looking at a photo/image called "${file.name}".

Analyse what you see (subject, lighting, composition, emotional quality, platform fit, aesthetic).

Return JSON exactly:
{
  "wow_note": "<editorial director one-liner, see system prompt>",
  "editorial_angle": "<posting recommendation in plain artist terms, see system prompt>",
  "best_moment": { "timestamp": 0, "frame_number": 1, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" },
  "moments": [{ "timestamp": 0, "frame_number": 1, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" }],
  "overall_energy": <1-10>,
  "best_clip_start": 0, "best_clip_end": 0,
  "caption_context": "<one sentence>",
  "post_recommendation": "<specific recommendation>",
  "content_score": { "reach": <0-100>, "authenticity": <0-100>, "culture": <0-100>, "visual_identity": <0-100>, "shareable_core": <0-100>, "shareable_core_note": "<exact detail or 'none found'>", "aesthetic": <0-100>, "reasoning": "<based on what you see>" },
  "tags": ["<subject>", "<mood>"],
  "tone_match": "<closest reference artist + why>",
  "platform_cuts": { "instagram": "<verdict>", "tiktok": "<verdict>", "story": "<verdict>" },
  "platform_ranking": [ { "platform": "Instagram Grid", "score": <0-100>, "reason": "<why>" }, { "platform": "Instagram Story", "score": <0-100>, "reason": "<why>" }, { "platform": "Carousel Lead", "score": <0-100>, "reason": "<why>" } ]
}`
  }
  const duration = frames[frames.length - 1]?.timestamp ?? 0
  return `You are looking at ${frames.length} frames extracted from a show video called "${file.name}" (duration ~${duration.toFixed(0)}s).

Look carefully: crowd, lighting, composition, moment type, emotional quality, platform fit.
Identify which SPECIFIC FRAME NUMBER (1-${frames.length}) contains the single best moment for social media.

Return JSON exactly:
{
  "wow_note": "<editorial director one-liner, see system prompt>",
  "editorial_angle": "<posting recommendation in plain artist terms, see system prompt>",
  "best_moment": { "timestamp": <ts>, "frame_number": <n>, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" },
  "moments": [
    { "timestamp": <ts>, "frame_number": <n>, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" },
    { "timestamp": <ts>, "frame_number": <n>, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" }
  ],
  "overall_energy": <1-10>,
  "best_clip_start": <ts at/before best_moment>,
  "best_clip_end": <start + 15 to 30s>,
  "caption_context": "<one sentence>",
  "post_recommendation": "<specific>",
  "content_score": { "reach": <0-100>, "authenticity": <0-100>, "culture": <0-100>, "visual_identity": <0-100>, "shareable_core": <0-100>, "shareable_core_note": "<exact moment or 'none found'>", "aesthetic": <0-100>, "reasoning": "<based on what you see>" },
  "tags": ["<venue/event>", "<show footage>", "<live electronic>"],
  "tone_match": "<closest reference artist + why>",
  "platform_cuts": { "instagram": "<ts range + why>", "tiktok": "<ts range + why>", "story": "<ts range + why>" },
  "platform_ranking": [ { "platform": "TikTok", "score": <0-100>, "reason": "<why>" }, { "platform": "Instagram Reel", "score": <0-100>, "reason": "<why>" }, { "platform": "Instagram Story", "score": <0-100>, "reason": "<why>" } ]
}`
}

/**
 * Opus editorial polish. Runs AFTER Sonnet has drafted the full scan.
 * Sonnet provides accurate scores, tags, platform fit, and detailed
 * per-moment reasons. Opus rewrites ONLY the artist-facing prose that
 * sits above the scores (wow_note, editorial_angle, caption_context,
 * post_recommendation) — the four strings that decide whether the scan
 * feels WOW or feels like a spreadsheet.
 *
 * Text-only call. No image re-upload (Sonnet's reads are rich enough
 * for Opus to write from). Falls back to Sonnet's originals on any
 * error so the user is never blocked.
 */
async function runScanEditorialPolish(
  draft: ChainScanResult,
  isImage: boolean,
): Promise<ChainScanResult> {
  const momentLines = (draft.moments || [])
    .slice(0, 5)
    .map((m) => `  - ${m.timestamp.toFixed(1)}s (score ${m.score}, ${m.type}): ${m.reason}`)
    .join('\n')

  const topPlatform = [...(draft.platform_ranking || [])].sort((a, b) => b.score - a.score)[0]

  const system = `You are the EDITORIAL DIRECTOR for a social content scanner used by electronic music artists (Bicep, Floating Points, fred again.., Four Tet, Bonobo). A faster scanner (Sonnet) has already analysed the ${isImage ? 'image' : 'video frames'} and produced scores, tags, per-moment reads, and first-draft editorial prose.

Your ONE job: rewrite four artist-facing strings so they feel ALIVE. The scores stay; the prose gets the premium-model treatment. When the artist opens this scan, these four lines are what they actually READ.

HARD RULES:
- Never use em-dashes (—) or en-dashes (–). Commas, full stops, or split sentences only.
- Never use words like "potentially", "might be suitable", "consider". Direct editorial calls.
- Never fake enthusiasm. If Sonnet's draft says the clip is thin, you say it's thin — sharper.
- Never invent facts. If Sonnet didn't see a crowd, don't add one.
- Write like a smart friend texting the artist, not like a brand voice.
- Under length caps: wow_note ≤ 25 words, editorial_angle ≤ 20 words, caption_context ≤ 22 words, post_recommendation ≤ 20 words.

Return ONLY this JSON. No markdown.
{
  "wow_note": "<ONE sentence naming the SINGLE most surprising/shareable/culturally-alive thing in this specific clip. Not a score summary. If nothing's WOW, say so plainly ('thin for a solo post, works as carousel slide 3'). Never generic.>",
  "editorial_angle": "<ONE sentence posting recommendation in plain artist terms. eg 'story only, too intimate for grid' / 'Reel lead with the 2s crowd shot' / 'carousel slide 3, not a lead'. Not 'post to TikTok' — platform_ranking already handled that.>",
  "caption_context": "<ONE sentence naming what the clip IS, concretely. Real nouns (gear, person, room, moment). Feeds directly into caption generation, so it must be writeable-from.>",
  "post_recommendation": "<ONE sentence giving the specific posting move. Concrete. Different angle from editorial_angle if possible — this one can lean into timing, pairing, or supporting content.>"
}`

  const userText = `Sonnet's draft scan for a ${isImage ? 'still image' : 'video clip'}:

Top-line scores:
- reach ${draft.content_score.reach}, authenticity ${draft.content_score.authenticity}, culture ${draft.content_score.culture}, visual_identity ${draft.content_score.visual_identity}, shareable_core ${draft.content_score.shareable_core}
- energy ${draft.overall_energy}/10
- tone match: ${draft.tone_match}
- tags: ${(draft.tags || []).join(', ') || '(none)'}
${topPlatform ? `- best platform fit: ${topPlatform.platform} (${topPlatform.score}) — ${topPlatform.reason}` : ''}

Sonnet's per-moment reads:
${momentLines || '  (none flagged)'}

Best moment: ${draft.best_moment?.reason || '(none)'}

Sonnet's FIRST-DRAFT artist-facing prose (rewrite these four fields):
- wow_note (draft): "${draft.wow_note || '(Sonnet did not produce one)'}"
- editorial_angle (draft): "${draft.editorial_angle || '(Sonnet did not produce one)'}"
- caption_context (draft): "${draft.caption_context || '(none)'}"
- post_recommendation (draft): "${draft.post_recommendation || '(none)'}"

Shareable-core note (Sonnet): "${draft.content_score.shareable_core_note || '(none)'}"

Rewrite the four fields. Keep what Sonnet got right. Sharpen what's generic. Cut hedge words. Return the JSON.`

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        system,
        max_tokens: 500,
        messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) return draft
    const text = data.content?.[0]?.text
    if (!text) return draft
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      wow_note?: string
      editorial_angle?: string
      caption_context?: string
      post_recommendation?: string
    }
    return {
      ...draft,
      wow_note: (parsed.wow_note || draft.wow_note || '').trim() || draft.wow_note,
      editorial_angle: (parsed.editorial_angle || draft.editorial_angle || '').trim() || draft.editorial_angle,
      caption_context: (parsed.caption_context || draft.caption_context || '').trim() || draft.caption_context,
      post_recommendation: (parsed.post_recommendation || draft.post_recommendation || '').trim() || draft.post_recommendation,
    }
  } catch {
    return draft
  }
}

export function compositeScore(r: ChainScanResult): number {
  const s = r.content_score
  const aes = typeof s.aesthetic === 'number' ? s.aesthetic : null
  const base = Math.round((s.reach * 0.20) + (s.authenticity * 0.25) + (s.culture * 0.20) + (s.visual_identity * 0.15) + (s.shareable_core * 0.20))
  return aes !== null ? Math.round(base * 0.90 + aes * 0.10) : base
}

/**
 * Single-file scan. Extracts frames, calls Claude vision, parses JSON.
 * No DB persistence here — the caller decides whether to POST /api/media/scans.
 */
export async function scanSingleFile(file: File): Promise<{
  result: ChainScanResult
  frames: ScanFrame[]
  composite: number
}> {
  const isImage = isImageFile(file)
  // 6 frames instead of 8 — cuts ~25% of Sonnet wall time. 6 is still enough
  // coverage on typical 15-60s clips to catch the hero moment and flag
  // pacing issues; 8 was overkill and noticeably slowed perceived scan.
  const frames = isImage ? await extractImageFrame(file) : await extractFrames(file, 6)
  const system = buildSystemPrompt(isImage)
  const textPrompt = buildTextPrompt(file, frames)
  const raw = await callClaudeVision(system, frames, textPrompt, 2000)
  const draft = JSON.parse(raw.replace(/```json|```/g, '').trim()) as ChainScanResult
  // Opus polishes the four artist-facing strings. Non-blocking: errors
  // fall back to Sonnet's originals so scanning never breaks on polish.
  const polished = await runScanEditorialPolish(draft, isImage)
  return { result: polished, frames, composite: compositeScore(polished) }
}
