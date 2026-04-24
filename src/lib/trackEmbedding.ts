// ── Track embedding helper ───────────────────────────────────────────────────
// Composes a descriptor string from real track metadata and embeds it via
// Cloudflare Workers AI (bge-base-en-v1.5, 768 dims).
//
// Hard rule from describe-search architecture: a track without BPM + artist +
// genre is NOT embeddable and stays invisible to describe-search. This is the
// zero-fabrication guardrail — we never embed placeholder strings that would
// cluster unrelated tracks together.
// ─────────────────────────────────────────────────────────────────────────────

import { getCloudflareContext } from '@opennextjs/cloudflare'

export const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
export const EMBEDDING_DIMS = 768

export type TrackLike = {
  title?: string | null
  artist?: string | null
  genre?: string | null
  bpm?: number | null
  key?: string | null
  camelot?: string | null
  energy?: number | null
  moment_type?: string | null
  producer_style?: string | null
  crowd_reaction?: string | null
  similar_to?: string | null
  notes?: string | null
}

// Compose a dense descriptor from real track metadata. Skip empty fields so
// we never embed template-shaped placeholder strings.
export function composeEmbeddingInput(track: TrackLike): string {
  const parts: string[] = []

  const nameLine = [track.title, track.artist].filter(Boolean).join(' by ')
  if (nameLine) parts.push(nameLine + '.')

  if (track.genre) parts.push(`Genre: ${track.genre}.`)
  if (track.bpm && track.bpm > 0) parts.push(`${track.bpm} BPM.`)
  if (track.camelot) parts.push(`Key: ${track.camelot}.`)
  else if (track.key) parts.push(`Key: ${track.key}.`)
  if (track.energy && track.energy > 0) parts.push(`Energy ${track.energy}/10.`)
  if (track.moment_type) parts.push(`Moment: ${track.moment_type}.`)
  if (track.producer_style) parts.push(`Style: ${track.producer_style}.`)
  if (track.crowd_reaction) parts.push(`Crowd: ${track.crowd_reaction}.`)
  if (track.similar_to) parts.push(`Similar to: ${track.similar_to}.`)
  if (track.notes) parts.push(track.notes)

  return parts.join(' ').trim()
}

// Embeddability threshold — must have real metadata. No embedding = invisible
// to describe-search (zero-fabrication rule).
export function isEmbeddable(track: TrackLike): boolean {
  return !!(
    track.title &&
    track.artist &&
    track.genre &&
    track.bpm && track.bpm > 0
  )
}

interface AiBinding {
  run: (model: string, input: { text: string | string[] }) => Promise<unknown>
}

async function getAi(): Promise<AiBinding> {
  const ctx = await getCloudflareContext({ async: true })
  const ai = (ctx.env as unknown as Record<string, unknown>).AI as AiBinding | undefined
  if (!ai) {
    throw new Error('Workers AI binding not available. Run `npx wrangler dev` for AI features.')
  }
  return ai
}

function parseEmbeddingResponse(res: unknown, expectBatch: boolean): number[][] {
  const data = (res as { data?: unknown }).data
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected embedding response: ${JSON.stringify(res).slice(0, 200)}`)
  }
  if (!expectBatch) return [data as number[]]
  return data as number[][]
}

export async function embedText(text: string): Promise<number[]> {
  if (!text.trim()) throw new Error('Cannot embed empty text')
  const ai = await getAi()
  const res = await ai.run(EMBEDDING_MODEL, { text })
  const [vec] = parseEmbeddingResponse(res, false)
  if (!vec || vec.length !== EMBEDDING_DIMS) {
    throw new Error(`Embedding returned ${vec?.length ?? 0} dims, expected ${EMBEDDING_DIMS}`)
  }
  return vec
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const ai = await getAi()
  const res = await ai.run(EMBEDDING_MODEL, { text: texts })
  return parseEmbeddingResponse(res, true)
}

export interface EmbeddedTrack {
  input: string
  vector: number[]
}

export async function embedTrack(track: TrackLike): Promise<EmbeddedTrack | null> {
  if (!isEmbeddable(track)) return null
  const input = composeEmbeddingInput(track)
  if (!input) return null
  const vector = await embedText(input)
  return { input, vector }
}
