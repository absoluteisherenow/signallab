import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getR2Stream } from '@/lib/storage'
import { verifyStreamToken } from '@/lib/promoTokens'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const payload = await verifyStreamToken(token)
  if (!payload) return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 })

  const { data: track } = await supabase
    .from('promo_tracks')
    .select('id, file_key, format')
    .eq('id', payload.track_id)
    .single()

  if (!track?.file_key || track.file_key === 'pending') {
    return NextResponse.json({ error: 'track not found' }, { status: 404 })
  }

  // Parse Range header if present
  const rangeHeader = req.headers.get('range')
  let range: { offset: number; length?: number } | undefined
  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (m) {
      const start = Number(m[1])
      const end = m[2] ? Number(m[2]) : undefined
      range = { offset: start, length: end !== undefined ? end - start + 1 : undefined }
    }
  }

  const result = await getR2Stream(track.file_key, range)
  if (!result) return NextResponse.json({ error: 'file not found' }, { status: 404 })

  const contentType = result.contentType.startsWith('audio/')
    ? result.contentType
    : `audio/${track.format || 'mpeg'}`

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, no-store, max-age=0',
    'Accept-Ranges': 'bytes',
  }

  if (result.isPartial && result.totalSize > 0) {
    headers['Content-Range'] = `bytes ${result.rangeStart}-${result.rangeEnd}/${result.totalSize}`
    headers['Content-Length'] = String(result.rangeEnd - result.rangeStart + 1)
    return new NextResponse(result.body as any, { status: 206, headers })
  }

  if (result.totalSize > 0) {
    headers['Content-Length'] = String(result.totalSize)
  }

  return new NextResponse(result.body as any, { status: 200, headers })
}
