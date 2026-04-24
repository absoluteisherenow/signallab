// Shared Gmail payload helpers
// Previously duplicated across several /api/gmail/* routes — consolidated here.

function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

export function extractEmailBody(payload: any): string {
  if (!payload) return ''

  // Plain text part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBody(payload.body.data)
  }

  // HTML part (strip tags)
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBody(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  // Multipart — prefer plain text
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBody(plain.body.data)
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (html?.body?.data) return decodeBody(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const text = extractEmailBody(part)
      if (text) return text
    }
  }

  return ''
}

// ─── PDF attachments ────────────────────────────────────────────────────────
// Lifted from /api/gmail/process so the invoice-requests scraper can read
// billing-change PDFs too. Caps: 3 PDFs/email, 5MB/PDF.

export interface PdfAttachmentRef {
  attachmentId: string
  filename: string
  size: number
}

export function collectPdfAttachments(payload: any, out: PdfAttachmentRef[] = []): PdfAttachmentRef[] {
  if (!payload) return out
  const isPdf = payload.mimeType === 'application/pdf' ||
    (payload.filename || '').toLowerCase().endsWith('.pdf')
  if (isPdf && payload.body?.attachmentId) {
    out.push({
      attachmentId: payload.body.attachmentId,
      filename: payload.filename || 'attachment.pdf',
      size: payload.body.size || 0,
    })
  }
  if (payload.parts) {
    for (const part of payload.parts) collectPdfAttachments(part, out)
  }
  return out
}

// ─── Image attachments ──────────────────────────────────────────────────────
// Many promoters/venues screenshot their updated billing details or paste an
// image of a signed invoice. We send these to Claude as vision blocks.

export interface ImageAttachmentRef {
  attachmentId: string
  filename: string
  size: number
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
}

const IMAGE_MIME_MAP: Record<string, ImageAttachmentRef['mediaType']> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
}

function imageMediaType(mime: string, filename: string): ImageAttachmentRef['mediaType'] | null {
  const byMime = IMAGE_MIME_MAP[mime?.toLowerCase?.() || '']
  if (byMime) return byMime
  const ext = (filename || '').toLowerCase().split('.').pop() || ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return null
}

export function collectImageAttachments(payload: any, out: ImageAttachmentRef[] = []): ImageAttachmentRef[] {
  if (!payload) return out
  const mt = imageMediaType(payload.mimeType || '', payload.filename || '')
  // Skip inline tracking pixels / signature icons — typically <5KB.
  if (mt && payload.body?.attachmentId && (payload.body.size || 0) >= 5 * 1024) {
    out.push({
      attachmentId: payload.body.attachmentId,
      filename: payload.filename || `image.${mt.split('/')[1]}`,
      size: payload.body.size || 0,
      mediaType: mt,
    })
  }
  if (payload.parts) {
    for (const part of payload.parts) collectImageAttachments(part, out)
  }
  return out
}

export async function fetchImagesForClaude(
  gmail: any,
  messageId: string,
  refs: ImageAttachmentRef[],
  opts: { maxImages?: number; maxBytes?: number } = {}
): Promise<Array<{ filename: string; base64: string; mediaType: ImageAttachmentRef['mediaType'] }>> {
  const MAX = opts.maxImages ?? 3
  const MAX_BYTES = opts.maxBytes ?? 5 * 1024 * 1024
  const picked = refs.filter(r => r.size > 0 && r.size <= MAX_BYTES).slice(0, MAX)
  const out: Array<{ filename: string; base64: string; mediaType: ImageAttachmentRef['mediaType'] }> = []
  for (const ref of picked) {
    try {
      const { data } = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: ref.attachmentId,
      })
      if (data?.data) {
        const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/')
        out.push({ filename: ref.filename, base64, mediaType: ref.mediaType })
      }
    } catch {
      // Non-fatal — skip this attachment.
    }
  }
  return out
}

export async function fetchPdfsForClaude(
  gmail: any,
  messageId: string,
  refs: PdfAttachmentRef[],
  opts: { maxPdfs?: number; maxBytes?: number } = {}
): Promise<Array<{ filename: string; base64: string }>> {
  const MAX_PDFS = opts.maxPdfs ?? 3
  const MAX_BYTES = opts.maxBytes ?? 5 * 1024 * 1024
  const picked = refs.filter(r => r.size > 0 && r.size <= MAX_BYTES).slice(0, MAX_PDFS)

  const out: Array<{ filename: string; base64: string }> = []
  for (const ref of picked) {
    try {
      const { data } = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: ref.attachmentId,
      })
      if (data?.data) {
        const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/')
        out.push({ filename: ref.filename, base64 })
      }
    } catch {
      // Non-fatal — skip this attachment.
    }
  }
  return out
}
