// ── R2 Storage Utility ───────────────────────────────────────────────────────
// Unified file storage using Cloudflare R2 (bound as MEDIA_BUCKET in wrangler.jsonc).
// Replaces all @vercel/blob usage. In dev without wrangler, falls back to
// Supabase Storage so local dev still works.
// ─────────────────────────────────────────────────────────────────────────────

import { getCloudflareContext } from '@opennextjs/cloudflare'

// R2 types — minimal subset from @cloudflare/workers-types
// Keeps tsconfig clean without adding workers-types globally
interface R2Object {
  key: string
  size: number
  uploaded: Date
  httpMetadata?: { contentType?: string }
  body: ReadableStream
}
interface R2ObjectBody extends R2Object {
  body: ReadableStream
}
interface R2GetOptions {
  range?: { offset?: number; length?: number; suffix?: number }
}
interface R2Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<R2Object>
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>
  head(key: string): Promise<R2Object | null>
  list(options?: { prefix?: string }): Promise<{ objects: R2Object[] }>
  delete(key: string): Promise<void>
}

interface UploadResult {
  url: string
  key: string
}

interface R2Env {
  MEDIA_BUCKET: R2Bucket
}

const R2_CUSTOM_DOMAIN = process.env.R2_CUSTOM_DOMAIN // e.g. media.signallabos.com
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

/** Build a public URL for an R2 object */
function r2Url(key: string): string {
  if (R2_CUSTOM_DOMAIN) return `https://${R2_CUSTOM_DOMAIN}/${key}`
  // Fallback: serve via API route
  return `${APP_URL}/api/media/file/${encodeURIComponent(key)}`
}

/** Get the R2 bucket binding. Returns null if not available (local dev without wrangler). */
async function getBucket(): Promise<R2Bucket | null> {
  try {
    const ctx = await getCloudflareContext({ async: true })
    const env = ctx.env as unknown as R2Env
    return env.MEDIA_BUCKET || null
  } catch {
    return null
  }
}

/** Upload a file to R2. Returns { url, key }. */
export async function uploadFile(
  file: File | Buffer | ArrayBuffer,
  key: string,
  contentType?: string
): Promise<UploadResult> {
  const bucket = await getBucket()

  if (bucket) {
    // Production: R2
    let body: ArrayBuffer
    if (file instanceof File) {
      body = await file.arrayBuffer()
    } else if (Buffer.isBuffer(file)) {
      body = new Uint8Array(file).buffer as ArrayBuffer
    } else {
      body = file
    }
    await bucket.put(key, body, {
      httpMetadata: { contentType: contentType || 'application/octet-stream' },
    })
    return { url: r2Url(key), key }
  }

  // Dev fallback: Supabase Storage
  return uploadToSupabaseFallback(file, key, contentType)
}

/** List objects by prefix */
export async function listFiles(prefix: string): Promise<{ key: string; url: string; size: number; uploaded: Date }[]> {
  const bucket = await getBucket()

  if (bucket) {
    const listed = await bucket.list({ prefix })
    return listed.objects.map(obj => ({
      key: obj.key,
      url: r2Url(obj.key),
      size: obj.size,
      uploaded: obj.uploaded,
    }))
  }

  // Dev fallback
  return listFromSupabaseFallback(prefix)
}

/** Delete a file from R2 */
export async function deleteFile(key: string): Promise<void> {
  const bucket = await getBucket()

  if (bucket) {
    await bucket.delete(key)
    return
  }

  await deleteFromSupabaseFallback(key)
}

/** Get a file from R2. Returns the body + metadata, or null if not found. */
export async function getFile(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  const bucket = await getBucket()

  if (bucket) {
    const obj = await bucket.get(key)
    if (!obj) return null
    return {
      body: obj.body as unknown as ReadableStream,
      contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
    }
  }

  return getFromSupabaseFallback(key)
}

/**
 * Range-aware stream fetch for audio streaming.
 * If `range` is provided, returns the partial object with status 206 fields.
 * Falls back to Supabase Storage in dev (serves full body regardless of range).
 */
export async function getR2Stream(
  key: string,
  range?: { offset: number; length?: number }
): Promise<{
  body: ReadableStream
  contentType: string
  totalSize: number
  rangeStart: number
  rangeEnd: number
  isPartial: boolean
} | null> {
  const bucket = await getBucket()

  if (bucket) {
    // First HEAD for total size
    const head = await bucket.head(key)
    if (!head) return null
    const totalSize = head.size
    const contentType = head.httpMetadata?.contentType || 'application/octet-stream'

    if (range) {
      const offset = Math.max(0, range.offset)
      const length = range.length ?? totalSize - offset
      const end = Math.min(totalSize - 1, offset + length - 1)
      const obj = await bucket.get(key, { range: { offset, length: end - offset + 1 } })
      if (!obj) return null
      return {
        body: obj.body as unknown as ReadableStream,
        contentType,
        totalSize,
        rangeStart: offset,
        rangeEnd: end,
        isPartial: true,
      }
    }

    const obj = await bucket.get(key)
    if (!obj) return null
    return {
      body: obj.body as unknown as ReadableStream,
      contentType,
      totalSize,
      rangeStart: 0,
      rangeEnd: totalSize - 1,
      isPartial: false,
    }
  }

  // Dev fallback: serve whole file, ignore range
  const fallback = await getFromSupabaseFallback(key)
  if (!fallback) return null
  return {
    body: fallback.body,
    contentType: fallback.contentType,
    totalSize: 0,
    rangeStart: 0,
    rangeEnd: 0,
    isPartial: false,
  }
}

// ── Supabase Storage fallback (dev only) ─────────────────────────────────────

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const FALLBACK_BUCKET = 'media'

async function ensureFallbackBucket() {
  const supabase = await getSupabase()
  const { data } = await supabase.storage.listBuckets()
  if (!data?.some(b => b.name === FALLBACK_BUCKET)) {
    await supabase.storage.createBucket(FALLBACK_BUCKET, { public: true })
  }
}

async function uploadToSupabaseFallback(
  file: File | Buffer | ArrayBuffer,
  key: string,
  contentType?: string
): Promise<UploadResult> {
  await ensureFallbackBucket()
  const supabase = await getSupabase()

  let arrayBuf: ArrayBuffer
  if (file instanceof File) {
    arrayBuf = await file.arrayBuffer()
  } else if (Buffer.isBuffer(file)) {
    arrayBuf = new Uint8Array(file).buffer as ArrayBuffer
  } else {
    arrayBuf = file
  }

  await supabase.storage.from(FALLBACK_BUCKET).upload(key, new Blob([arrayBuf], { type: contentType || 'application/octet-stream' }), {
    contentType: contentType || 'application/octet-stream',
    upsert: true,
  })

  const { data } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(key)
  return { url: data.publicUrl, key }
}

async function listFromSupabaseFallback(prefix: string): Promise<{ key: string; url: string; size: number; uploaded: Date }[]> {
  const supabase = await getSupabase()
  const parts = prefix.split('/')
  const folder = parts.slice(0, -1).join('/') || ''
  const { data } = await supabase.storage.from(FALLBACK_BUCKET).list(folder)

  if (!data) return []

  return data.map(f => {
    const key = folder ? `${folder}/${f.name}` : f.name
    const { data: urlData } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(key)
    return {
      key,
      url: urlData.publicUrl,
      size: (f.metadata as Record<string, number>)?.size || 0,
      uploaded: new Date(f.created_at || Date.now()),
    }
  })
}

async function deleteFromSupabaseFallback(key: string): Promise<void> {
  const supabase = await getSupabase()
  await supabase.storage.from(FALLBACK_BUCKET).remove([key])
}

async function getFromSupabaseFallback(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.storage.from(FALLBACK_BUCKET).download(key)
  if (error || !data) return null
  return {
    body: data.stream() as unknown as ReadableStream,
    contentType: data.type || 'application/octet-stream',
  }
}
