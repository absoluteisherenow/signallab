import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filename = `media/${Date.now()}.${ext}`
  const blob = await put(filename, file, { access: 'public' })
  return NextResponse.json({ url: blob.url })
}
