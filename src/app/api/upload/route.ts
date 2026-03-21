import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    const filename = `media/${Date.now()}.jpg`
    const blob = await put(filename, file.stream(), {
      access: 'public',
      contentType: 'image/jpeg',
    })
    return NextResponse.json({ url: blob.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
