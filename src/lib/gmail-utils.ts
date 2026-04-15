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
