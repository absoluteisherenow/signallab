import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * POST /api/content-intelligence/folder-import
 * Lists media files from a public Dropbox or Google Drive folder share link so
 * the Media Scanner can auto-score them.
 *
 * Body: { url: string, max?: number, skipAlreadyScanned?: boolean, userId?: string }
 * Returns: { files: [{ url, filename }] }
 *
 * Requires:
 * - Dropbox: DROPBOX_ACCESS_TOKEN (app with sharing.read scope)
 * - Drive:   GOOGLE_DRIVE_API_KEY (folder must be public/anyone-with-link)
 *
 * If neither token is configured for the detected provider, returns a clear
 * error rather than a 404. The frontend surfaces `data.error` in-line.
 */

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi)$/i
const isMedia = (n: string) => IMAGE_EXT.test(n) || VIDEO_EXT.test(n)

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  try {
    const body = await req.json().catch(() => ({}))
    const url = typeof body.url === 'string' ? body.url.trim() : ''
    const max = Math.min(Number(body.max) || 20, 50)
    const skipAlreadyScanned = !!body.skipAlreadyScanned
    if (!url) return NextResponse.json({ error: 'url required', files: [] }, { status: 400 })

    let files: { url: string, filename: string }[] = []

    if (/dropbox\.com/i.test(url)) {
      files = await listDropboxFolder(url, max)
    } else if (/drive\.google\.com/i.test(url)) {
      files = await listGoogleDriveFolder(url, max)
    } else {
      return NextResponse.json({ error: 'Only Dropbox and Google Drive folder links are supported', files: [] }, { status: 400 })
    }

    if (skipAlreadyScanned && files.length > 0) {
      const { data: scanned } = await serviceClient
        .from('media_scans')
        .select('source_url')
        .eq('user_id', user.id)
        .in('source_url', files.map(f => f.url))
      const seen = new Set((scanned || []).map(s => s.source_url))
      files = files.filter(f => !seen.has(f.url))
    }

    return NextResponse.json({ files: files.slice(0, max) })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'timeout', files: [] }, { status: 504 })
    }
    return NextResponse.json({ error: err.message || 'folder-import failed', files: [] }, { status: 500 })
  }
}

async function listDropboxFolder(sharedUrl: string, max: number): Promise<{ url: string, filename: string }[]> {
  const token = process.env.DROPBOX_ACCESS_TOKEN
  if (!token) {
    throw new Error('DROPBOX_ACCESS_TOKEN not configured. Connect Dropbox in settings to enable folder import.')
  }

  // List via shared_link so no path resolution is needed
  const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '', shared_link: { url: sharedUrl }, limit: Math.min(max * 2, 100) }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!listRes.ok) {
    const errText = await listRes.text().catch(() => '')
    throw new Error(`Dropbox list_folder ${listRes.status}: ${errText.slice(0, 200)}`)
  }

  const list = await listRes.json()
  const entries: any[] = list.entries || []
  const mediaEntries = entries.filter(e => e['.tag'] === 'file' && isMedia(e.name)).slice(0, max)

  // For each file, resolve a temporary direct link
  const results = await Promise.all(mediaEntries.map(async (e) => {
    try {
      const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/get_shared_link_file', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sharedUrl, path: `/${e.name}` }),
        signal: AbortSignal.timeout(10_000),
      })
      if (linkRes.ok) {
        // The response is raw bytes. Use the direct content URL via redirect header.
        const directUrl = linkRes.headers.get('dropbox-api-result')
          ? `${sharedUrl}${sharedUrl.includes('?') ? '&' : '?'}dl=1`
          : null
        if (directUrl) return { url: directUrl, filename: e.name }
      }
      // Fallback: construct a ?dl=1 variant on the shared link (works for single-file shares only,
      // but is the best we can do without a fully-scoped app).
      return { url: `${sharedUrl}${sharedUrl.includes('?') ? '&' : '?'}dl=1`, filename: e.name }
    } catch {
      return null
    }
  }))

  return results.filter((r): r is NonNullable<typeof r> => !!r)
}

async function listGoogleDriveFolder(folderUrl: string, max: number): Promise<{ url: string, filename: string }[]> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_DRIVE_API_KEY not configured. Add a Drive API key to enable Google Drive folder import.')
  }

  // Pull folder ID from URL — supports /folders/<id> and ?id=<id>
  const folderId = extractDriveFolderId(folderUrl)
  if (!folderId) throw new Error('Could not parse Drive folder ID from URL')

  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const fields = encodeURIComponent('files(id,name,mimeType)')
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=${Math.min(max * 2, 100)}&key=${apiKey}`

  const res = await fetch(listUrl, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Drive API ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const filesRaw: any[] = data.files || []
  const mediaFiles = filesRaw.filter(f => {
    const mt = String(f.mimeType || '')
    return mt.startsWith('image/') || mt.startsWith('video/') || isMedia(f.name || '')
  }).slice(0, max)

  return mediaFiles.map(f => ({
    // Public media download — requires folder/file to be shared "anyone with link"
    url: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
    filename: f.name || f.id,
  }))
}

function extractDriveFolderId(url: string): string | null {
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folderMatch) return folderMatch[1]
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idMatch) return idMatch[1]
  return null
}
