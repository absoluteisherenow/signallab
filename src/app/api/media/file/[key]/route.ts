import { NextRequest, NextResponse } from 'next/server'
import { getR2Stream } from '@/lib/storage'

// Serve R2 files when no custom domain is configured. Range-aware because
// IG Graph API issues Range probes on video URLs before it accepts the
// container — a server that returns 200 + full body for a Range request
// can cause IG to silently reject the video. The custom domain
// (media.signallabos.com) handles this natively; this fallback needs to
// match that behaviour or mixed-media carousels break whenever the custom
// domain isn't reachable.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params
  const decoded = decodeURIComponent(key)

  const rangeHeader = req.headers.get('range')
  let range: { offset: number; length?: number } | undefined
  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d+)?/.exec(rangeHeader)
    if (m) {
      const offset = Number(m[1])
      const end = m[2] ? Number(m[2]) : undefined
      range = { offset, length: end != null ? end - offset + 1 : undefined }
    }
  }

  const file = await getR2Stream(decoded, range)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const headers: Record<string, string> = {
    'Content-Type': file.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
  }

  if (file.isPartial && file.totalSize) {
    headers['Content-Range'] = `bytes ${file.rangeStart}-${file.rangeEnd}/${file.totalSize}`
    headers['Content-Length'] = String(file.rangeEnd - file.rangeStart + 1)
    return new NextResponse(file.body, { status: 206, headers })
  }

  if (file.totalSize) headers['Content-Length'] = String(file.totalSize)
  return new NextResponse(file.body, { status: 200, headers })
}
