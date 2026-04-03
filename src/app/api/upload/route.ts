import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const gigId = req.nextUrl.searchParams.get('gigId')
    const ext = file.name.split('.').pop() || 'bin'
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const prefix = gigId ? `media/gigs/${gigId}` : 'media'
    const filename = `${prefix}/${timestamp}-${safeName}.${ext}`

    const blob = await put(filename, file, {
      access: 'public',
      contentType: file.type || 'application/octet-stream',
    })
    return NextResponse.json({ url: blob.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
