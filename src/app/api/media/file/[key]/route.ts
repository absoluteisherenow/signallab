import { NextRequest, NextResponse } from 'next/server'
import { getFile } from '@/lib/storage'

// Serve R2 files when no custom domain is configured
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params
  const decoded = decodeURIComponent(key)

  const file = await getFile(decoded)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new NextResponse(file.body, {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
