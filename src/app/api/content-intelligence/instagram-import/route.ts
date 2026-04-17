import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

const IG_BUSINESS_ID = '17841400093363542' // NM's IG Business Account ID

/**
 * POST /api/content-intelligence/instagram-import
 * Pulls recent media URLs from a public IG account via business_discovery so the
 * Media Scanner can auto-score them.
 *
 * Body: { handle: string, max?: number, skipAlreadyScanned?: boolean, userId?: string }
 * Returns: { files: [{ url, filename }] }
 *
 * Notes:
 * - Business Discovery returns CAROUSEL children expanded. We flatten so each
 *   image/video asset becomes its own file entry.
 * - If skipAlreadyScanned, we drop any URL already present in media_scans for
 *   this user. Frontend then downloads the rest as blobs for scoring.
 */
export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'META_SYSTEM_USER_TOKEN not configured', files: [] }, { status: 500 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const handle = typeof body.handle === 'string' ? body.handle.replace(/^@/, '').trim().toLowerCase() : ''
    const max = Math.min(Number(body.max) || 12, 25)
    const skipAlreadyScanned = !!body.skipAlreadyScanned

    if (!handle) return NextResponse.json({ error: 'handle required', files: [] }, { status: 400 })

    // Ask for recent media — request children expansion so carousels explode into their items
    const mediaFields = 'id,media_type,media_url,permalink,thumbnail_url,caption,timestamp,children{media_type,media_url,thumbnail_url}'
    const fields = `business_discovery.username(${encodeURIComponent(handle)}){username,name,media.limit(${max}){${mediaFields}}}`
    const url = `https://graph.facebook.com/v25.0/${IG_BUSINESS_ID}?fields=${fields}&access_token=${token}`

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err?.error?.message || `Meta API ${res.status}`, files: [] }, { status: res.status })
    }

    const data = await res.json()
    const media = data?.business_discovery?.media?.data || []

    const files: { url: string, filename: string }[] = []
    for (const m of media) {
      const items: any[] = Array.isArray(m.children?.data) && m.children.data.length > 0 ? m.children.data : [m]
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const rawUrl = it.media_url || it.thumbnail_url
        if (!rawUrl) continue
        const isVideo = String(it.media_type || '').toUpperCase() === 'VIDEO'
        const ext = isVideo ? 'mp4' : 'jpg'
        const base = `${handle}_${m.id}`
        const filename = items.length > 1 ? `${base}_${i + 1}.${ext}` : `${base}.${ext}`
        files.push({ url: rawUrl, filename })
      }
    }

    if (skipAlreadyScanned && files.length > 0) {
      const { data: scanned } = await serviceClient
        .from('media_scans')
        .select('source_url')
        .eq('user_id', user.id)
        .in('source_url', files.map(f => f.url))
      const seen = new Set((scanned || []).map(s => s.source_url))
      return NextResponse.json({ files: files.filter(f => !seen.has(f.url)) })
    }

    return NextResponse.json({ files })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'timeout', files: [] }, { status: 504 })
    }
    return NextResponse.json({ error: err.message || 'import failed', files: [] }, { status: 500 })
  }
}
