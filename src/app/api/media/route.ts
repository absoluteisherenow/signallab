import { list, del, put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

const MEDIA_CATEGORIES = ['promo', 'crowd', 'studio', 'artwork', 'bts', 'travel', 'other'] as const
type MediaCategory = typeof MEDIA_CATEGORIES[number]

async function classifyImage(imageBytes: ArrayBuffer, mimeType: string): Promise<MediaCategory> {
  const apiKey = process.env.ANTHROPIC_API_KEY
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
      // Re-create file from bytes for upload
      const ext = file.name.split('.').pop() || 'bin'
      const filename = `media/${category}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const blob = await put(filename, Buffer.from(bytes), { access: 'public', contentType: file.type })
      return NextResponse.json({ url: blob.url, category, pathname: blob.pathname })
    } else {
      category = 'other'
      const ext = file.name.split('.').pop() || 'bin'
      const filename = `media/${category}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const blob = await put(filename, file, { access: 'public' })
      return NextResponse.json({ url: blob.url, category, pathname: blob.pathname })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get('category')
    const prefix = category ? `media/${category}/` : 'media/'
    const { blobs } = await list({ prefix })
    const items = blobs.map(b => {
      const parts = b.pathname.split('/')
      const cat = parts.length >= 2 ? parts[1] : 'other'
      return { ...b, category: MEDIA_CATEGORIES.includes(cat as MediaCategory) ? cat : 'other' }
    })
    return NextResponse.json({ blobs: items })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
    await del(url)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
