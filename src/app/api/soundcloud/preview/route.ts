import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url || !url.includes('soundcloud.com')) {
    return NextResponse.json({ error: 'Invalid SoundCloud URL' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(
      `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { next: { revalidate: 3600 }, signal: controller.signal }
    )
    clearTimeout(timeout)
    if (!res.ok) {
      return NextResponse.json({ error: 'Track not found — may be fully private (no secret token)' }, { status: 404 })
    }
    const data = await res.json()

    // Upgrade thumbnail to 500x500 where available
    const artwork = data.thumbnail_url
      ? data.thumbnail_url.replace('-large', '-t500x500').replace('-small', '-t500x500')
      : null

    return NextResponse.json({
      title: data.title || null,
      author: data.author_name || null,
      description: data.description || null,
      artwork,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
