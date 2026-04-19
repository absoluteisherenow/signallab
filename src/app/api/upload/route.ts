import { uploadFile } from '@/lib/storage'
import { NextRequest, NextResponse } from 'next/server'

// Content fingerprint = SHA-256 of the first 1MB + total byte size. A full
// hash of the whole file is bulletproof but slow on Workers for big video
// uploads; first-1MB + size collides vanishingly rarely for photo/video.
async function fingerprint(buf: ArrayBuffer): Promise<string> {
  const sample = buf.byteLength > 1_048_576 ? buf.slice(0, 1_048_576) : buf
  const digest = await crypto.subtle.digest('SHA-256', sample)
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 16) + '-' + buf.byteLength
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const gigId = req.nextUrl.searchParams.get('gigId')
    const bytes = await file.arrayBuffer()
    const fp = await fingerprint(bytes)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const prefix = gigId ? `media/gigs/${gigId}` : 'media'
    // Content-addressed key: same file → same key → R2 overwrite (idempotent,
    // no duplicate object). Dropping the timestamp in favour of the
    // fingerprint means re-uploading the same photo twice is a no-op.
    const key = `${prefix}/${fp}-${safeName}`

    const result = await uploadFile(Buffer.from(bytes), key, file.type || 'application/octet-stream')
    return NextResponse.json({ url: result.url, key: result.key })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
