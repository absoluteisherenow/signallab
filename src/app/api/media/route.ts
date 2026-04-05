import { list, del, put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

const MEDIA_CATEGORIES = ['promo', 'crowd', 'studio', 'artwork', 'bts', 'travel', 'other'] as const

function autoDetectCategory(filename: string): string {
  const name = filename.toLowerCase()
  const rules: [string, string[]][] = [
    ['promo', ['promo', 'press', 'headshot', 'portrait', 'profile', 'shot']],
    ['crowd', ['crowd', 'gig', 'venue', 'live', 'show', 'festival', 'dancefloor']],
    ['studio', ['studio', 'session', 'mix', 'desk', 'daw', 'ableton', 'synth', 'gear']],
    ['artwork', ['artwork', 'cover', 'sleeve', 'art', 'design', 'visual']],
    ['bts', ['bts', 'behind', 'backstage', 'setup', 'soundcheck', 'greenroom']],
    ['travel', ['travel', 'hotel', 'airport', 'flight', 'train', 'road']],
  ]
  for (const [cat, keywords] of rules) {
    if (keywords.some(kw => name.includes(kw))) return cat
  }
  return 'other'
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const manualCategory = formData.get('category') as string | null
    const category = manualCategory || autoDetectCategory(file?.name || '')

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() || 'bin'
    const filename = `media/${category}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const blob = await put(filename, file, { access: 'public' })

    return NextResponse.json({ url: blob.url, category, pathname: blob.pathname })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get('category')
    const prefix = category ? `media/${category}/` : 'media/'
    const { blobs } = await list({ prefix })
    // Enrich with category from path
    const items = blobs.map(b => {
      const parts = b.pathname.split('/')
      const cat = parts.length >= 2 ? parts[1] : 'other'
      return { ...b, category: MEDIA_CATEGORIES.includes(cat as any) ? cat : 'other' }
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
