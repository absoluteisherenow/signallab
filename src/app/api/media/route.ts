import { list, del, put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

const MEDIA_CATEGORIES = ['promo', 'crowd', 'studio', 'artwork', 'bts', 'travel', 'other'] as const

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const category = (formData.get('category') as string | null) || 'other'

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
