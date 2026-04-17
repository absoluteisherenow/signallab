import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/image-proxy?url=<remote image url>
 * Server-side proxy for remote images (IG profile pics, collab avatars) that
 * can't be hot-linked directly from the browser due to CDN referrer rules.
 *
 * No auth required — this is a public read-only image pipe. But we clamp to
 * an allowlist of hostnames so it can't be used as an open proxy.
 */

const ALLOWED_HOSTS = [
  /\.cdninstagram\.com$/i,
  /\.fbcdn\.net$/i,
  /^cdninstagram\.com$/i,
  /scontent[-.][^.]+\.cdninstagram\.com$/i,
  /\.googleusercontent\.com$/i,
  /\.ggpht\.com$/i,
  /\.sndcdn\.com$/i,
  /i\.scdn\.co$/i,
]

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')
  if (!raw) return new NextResponse('url required', { status: 400 })

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return new NextResponse('invalid url', { status: 400 })
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return new NextResponse('scheme not allowed', { status: 400 })
  }
  if (!ALLOWED_HOSTS.some(re => re.test(target.hostname))) {
    return new NextResponse('host not allowed', { status: 403 })
  }

  try {
    const res = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (SignalLab ImageProxy)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return new NextResponse(`upstream ${res.status}`, { status: 502 })

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const body = await res.arrayBuffer()
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return new NextResponse('timeout', { status: 504 })
    }
    return new NextResponse(err.message || 'proxy failed', { status: 500 })
  }
}
