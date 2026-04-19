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
      canvas.width = 480
      canvas.height = 270
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
  const NO_DASHES = `HARD TEXT RULE: In every string field you output (reason, caption_context, post_recommendation, tone_match, shareable_core_note, reasoning, platform_cuts.*, platform_ranking[].reason), NEVER use em-dashes (\u2014) or en-dashes (\u2013). Use commas, full stops, or split into separate sentences. This is surfaced directly in the UI.`

  if (isImage) {
    return `You are an expert visual content strategist for electronic music artists (Bicep, Floating Points, fred again.., Four Tet, Bonobo).

${SKILLS_MEDIA_SCANNER}

${NO_DASHES}

Analyse what you genuinely see. Return ONLY valid JSON. No markdown, no explanation.`
  }
  return `You are an expert video editor and social media strategist for electronic music artists (Bicep, Floating Points, fred again.., Four Tet, Bonobo).

CRITICAL SOCIAL MEDIA RULE: The clip MUST start on the strongest, most attention-grabbing frame. The first 1-3 seconds decide everything on TikTok and Instagram Reels. Never bury the best moment in the middle. Set best_clip_start AT or just before best_moment.timestamp so the hook is the opening frame.

${SKILLS_MEDIA_SCANNER}

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
  const frames = isImage ? await extractImageFrame(file) : await extractFrames(file, 8)
  const system = buildSystemPrompt(isImage)
  const textPrompt = buildTextPrompt(file, frames)
  const raw = await callClaudeVision(system, frames, textPrompt, 2000)
  const data = JSON.parse(raw.replace(/```json|```/g, '').trim()) as ChainScanResult
  return { result: data, frames, composite: compositeScore(data) }
}
