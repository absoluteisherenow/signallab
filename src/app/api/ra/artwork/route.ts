import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url || !url.includes('ra.co')) {
    return NextResponse.json({ error: 'Invalid RA URL' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return NextResponse.json({ error: 'Could not fetch page' }, { status: 404 })

    const html = await res.text()

    // og:image — try both attribute orders
    const ogImage =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)?.[1] ||
      null

    const ogTitle =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i)?.[1] ||
      null

    const ogDescription =
      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i)?.[1] ||
      null

    if (!ogImage) return NextResponse.json({ error: 'No artwork found on this RA page' }, { status: 404 })

    return NextResponse.json({
      artwork: ogImage,
      title: ogTitle ? ogTitle.replace(' | RA', '').trim() : null,
      description: ogDescription || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
