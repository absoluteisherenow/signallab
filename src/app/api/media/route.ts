import { list, del } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const { blobs } = await list({ prefix: 'media/' })
    return NextResponse.json({ blobs })
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
