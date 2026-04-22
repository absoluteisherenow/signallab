import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// POST /api/clip-inbox/import
// Body: { urls: string[], notes?: string }
// Parses pasted Dropbox / generic URLs, normalises them, derives a title from
// the filename, and inserts clip_sources rows with status='pending'. Zero AI cost.
//
// Dropbox share URLs are rewritten ?dl=0 → ?raw=1 so the stored URL streams
// directly into <video> tags. Duplicates (same user + source_url) are skipped
// via the unique index — counted in `skipped`.

function normaliseDropboxUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    if (u.hostname.endsWith('dropbox.com')) {
      u.searchParams.set('raw', '1')
      u.searchParams.delete('dl')
    }
    return u.toString()
  } catch {
    return raw.trim()
  }
}

function detectSourceType(url: string): 'dropbox' | 'youtube' | 'url' {
  try {
    const host = new URL(url).hostname
    if (host.endsWith('dropbox.com')) return 'dropbox'
    if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube'
    return 'url'
  } catch {
    return 'url'
  }
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() || ''
    return decodeURIComponent(last.replace(/\.[a-z0-9]+$/i, '')) || u.hostname
  } catch {
    return url.slice(0, 80)
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  let body: { urls?: unknown; notes?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0) : []
  if (urls.length === 0) {
    return NextResponse.json({ error: 'no_urls' }, { status: 400 })
  }
  if (urls.length > 500) {
    return NextResponse.json({ error: 'too_many_urls', max: 500 }, { status: 400 })
  }

  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null

  const rows = urls.map((raw) => {
    const source_url = normaliseDropboxUrl(raw)
    return {
      user_id: user.id,
      source_type: detectSourceType(source_url),
      source_url,
      title: titleFromUrl(source_url),
      status: 'pending',
      notes,
    }
  })

  const { data, error } = await serviceClient
    .from('clip_sources')
    .upsert(rows, { onConflict: 'user_id,source_url', ignoreDuplicates: true })
    .select('id, source_url')

  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  const inserted = data?.length ?? 0
  return NextResponse.json({ inserted, skipped: urls.length - inserted })
}
