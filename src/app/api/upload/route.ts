import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const gigId = req.nextUrl.searchParams.get('gigId')
    const isVideo = file.type.startsWith('video/')
    const buffer = Buffer.from(await file.arrayBuffer())

    let finalBuffer: Buffer
    let contentType: string
    let ext: string

    if (isVideo) {
      // Store videos as-is (no sharp conversion)
      finalBuffer = buffer
      contentType = file.type
      ext = file.name.split('.').pop() || 'mp4'
    } else {
      // Convert images to JPEG via sharp
      finalBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer()
      contentType = 'image/jpeg'
      ext = 'jpg'
    }

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const prefix = gigId ? `media/gigs/${gigId}` : 'media'
    const filename = `${prefix}/${timestamp}-${safeName}.${ext}`

    const blob = await put(filename, finalBuffer, {
      access: 'public',
      contentType,
    })
    return NextResponse.json({ url: blob.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
