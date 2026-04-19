import { uploadFile, listFiles, deleteFile } from '@/lib/storage'
import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'

const MEDIA_CATEGORIES = ['promo', 'crowd', 'studio', 'artwork', 'bts', 'travel', 'other'] as const
type MediaCategory = typeof MEDIA_CATEGORIES[number]

// Content fingerprint: SHA-256 of first 1MB + total byte size. Full-file
// hash is too slow on Workers for big videos. Used to derive
// content-addressed R2 keys so re-uploading the same photo is a no-op
// overwrite instead of a new duplicate object.
async function fingerprint(buf: ArrayBuffer): Promise<string> {
  const sample = buf.byteLength > 1_048_576 ? buf.slice(0, 1_048_576) : buf
  const digest = await crypto.subtle.digest('SHA-256', sample)
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 16) + '-' + buf.byteLength
}

async function classifyImage(imageBytes: ArrayBuffer, mimeType: string): Promise<MediaCategory> {
  const apiKey = await env('ANTHROPIC_API_KEY')
  if (!apiKey) return 'other'

  try {
    const base64 = Buffer.from(imageBytes).toString('base64')
    const mediaType = mimeType.startsWith('image/') ? mimeType : 'image/jpeg'

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Classify this image into exactly ONE category for an electronic music artist\'s media library. Reply with ONLY the category word, nothing else.\n\nCategories:\n- promo (press shots, portraits, headshots, posed photos)\n- crowd (live gigs, crowds, venues, dancefloors, festival shots)\n- studio (studio sessions, gear, synths, mixing desks, DAWs)\n- artwork (cover art, sleeve designs, visual art, graphics)\n- bts (behind the scenes, backstage, soundcheck, setup)\n- travel (hotels, airports, travel shots, tour life)\n- other (anything that doesn\'t fit above)',
            },
          ],
        }],
      }),
    })

    if (!res.ok) return 'other'
    const data = await res.json()
    const answer = (data.content?.[0]?.text || '').trim().toLowerCase()
    return MEDIA_CATEGORIES.includes(answer as MediaCategory) ? answer as MediaCategory : 'other'
  } catch {
    return 'other'
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Auto-classify images with vision, skip for videos
    let category: string
    const isImage = file.type.startsWith('image/')
    if (isImage) {
      const bytes = await file.arrayBuffer()
      category = await classifyImage(bytes, file.type)
      const fp = await fingerprint(bytes)
      // Content-addressed key — uploading the same image twice overwrites
      // the same R2 object instead of creating a duplicate.
      const key = `media/${category}/${fp}`
      const result = await uploadFile(Buffer.from(bytes), key, file.type)
      return NextResponse.json({ url: result.url, category, key: result.key })
    } else {
      category = 'other'
      const bytes = await file.arrayBuffer()
      const fp = await fingerprint(bytes)
      const key = `media/${category}/${fp}`
      const result = await uploadFile(Buffer.from(bytes), key, file.type)
      return NextResponse.json({ url: result.url, category, key: result.key })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get('category')
    const prefix = category ? `media/${category}/` : 'media/'
    const items = await listFiles(prefix)
    const blobs = items.map(item => {
      const parts = item.key.split('/')
      const cat = parts.length >= 2 ? parts[1] : 'other'
      return {
        url: item.url,
        key: item.key,
        size: item.size,
        uploadedAt: item.uploaded,
        category: MEDIA_CATEGORIES.includes(cat as MediaCategory) ? cat : 'other',
      }
    })
    return NextResponse.json({ blobs })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { key } = await req.json()
    if (!key) return NextResponse.json({ error: 'No key provided' }, { status: 400 })
    await deleteFile(key)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
