import { uploadFile } from '@/lib/storage'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const gigId = req.nextUrl.searchParams.get('gigId')
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const prefix = gigId ? `media/gigs/${gigId}` : 'media'
    const key = `${prefix}/${timestamp}-${safeName}`

    const result = await uploadFile(file, key, file.type || 'application/octet-stream')
    return NextResponse.json({ url: result.url, key: result.key })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
