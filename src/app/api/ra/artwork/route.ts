import { NextRequest, NextResponse } from 'next/server'

// Try to extract event ID from various RA URL formats
function extractEventId(url: string): string | null {
  const match = url.match(/ra\.co\/events\/(\d+)/i)
  return match ? match[1] : null
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url || !url.includes('ra.co')) {
    return NextResponse.json({ error: 'Invalid RA URL' }, { status: 400 })
  }

  const eventId = extractEventId(url)

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    })

    if (!res.ok) {
      // If RA blocks us but we have an event ID, try their CDN directly
      if (eventId) {
        const cdnUrl = `https://img.ra.co/events/${eventId}/wide/original.jpg`
        return NextResponse.json({ artwork: cdnUrl, title: null, description: null, fromCdn: true })
      }
      return NextResponse.json({ error: `RA returned ${res.status} — try uploading the poster directly` }, { status: 404 })
    }

    const html = await res.text()

    // 1. Try __NEXT_DATA__ — RA is Next.js, event data is embedded server-side
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1])
        const event =
          data?.props?.pageProps?.event ||
          data?.props?.pageProps?.data?.event ||
          data?.props?.initialProps?.event ||
          null

        if (event) {
          // RA stores flyer images in various shapes
          const artwork =
            event?.images?.[0]?.filename ||
            event?.flyer?.front ||
            event?.flyerFront ||
            event?.image ||
            null

          if (artwork) {
            return NextResponse.json({
              artwork,
              title: event.title || event.name || null,
              description: event.description || null,
            })
          }
        }
      } catch {
        // JSON parse failed, continue to other methods
      }
    }

    // 2. Try JSON-LD structured data
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1])
        const img = ld?.image || ld?.['image']?.[0] || null
        if (img) {
          return NextResponse.json({
            artwork: typeof img === 'string' ? img : img?.url || null,
            title: ld?.name || null,
            description: ld?.description || null,
          })
        }
      } catch {}
    }

    // 3. og:image meta fallback
    const ogImage =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)?.[1] ||
      null

    const ogTitle =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i)?.[1] ||
      null

    if (ogImage) {
      return NextResponse.json({
        artwork: ogImage,
        title: ogTitle ? ogTitle.replace(/ [\|–\-] RA$/i, '').trim() : null,
        description: null,
      })
    }

    // 4. Last resort — try RA CDN with event ID
    if (eventId) {
      const cdnUrl = `https://img.ra.co/events/${eventId}/wide/original.jpg`
      return NextResponse.json({ artwork: cdnUrl, title: null, description: null, fromCdn: true })
    }

    return NextResponse.json({ error: 'No artwork found — try uploading the poster directly' }, { status: 404 })
  } catch (err: any) {
    // Network error — still try CDN fallback
    if (eventId) {
      const cdnUrl = `https://img.ra.co/events/${eventId}/wide/original.jpg`
      return NextResponse.json({ artwork: cdnUrl, title: null, description: null, fromCdn: true })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
