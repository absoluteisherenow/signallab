import { uploadFile } from '@/lib/storage'
import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'

export async function POST(req: NextRequest) {
  const apiKey = await env('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File
    if (!file || !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'No valid image file provided' }, { status: 400 })
    }

    // Upload to R2
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `setlab/screenshots/${timestamp}-${safeName}`

    const stored = await uploadFile(file, key, file.type)

    // Convert to base64 for Claude Vision
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    // Send to Claude Vision for track extraction
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `You are a DJ tracklist extraction tool. You read screenshots of any source containing track information and extract every track visible.

Sources you can read:
- DJ software (Rekordbox, Traktor, Serato, CDJ screens)
- Handwritten setlists or typed tracklists
- Instagram posts, stories, reels, or captions showing track names
- Social media screenshots with track info in overlays, captions, or comments
- Spotify/Apple Music/Bandcamp playlist screenshots
- Any image containing artist names and track titles

Return ONLY a valid JSON array. No markdown, no explanation, just the array.

Each object in the array should have:
- "title": track title (string)
- "artist": artist name (string)
- "bpm": BPM if visible (number or null)
- "key": musical key if visible (string or null)
- "position": play order position starting from 1 (number)

Rules:
- Extract every track you can identify from ANY part of the image
- Check captions, overlays, text overlays, comments, and watermarks for track info
- If artist and title are in "Artist - Title" format, split them correctly
- If BPM or key columns are visible, include those values
- Preserve the exact order shown in the screenshot
- If you cannot determine artist, use "Unknown"
- Skip headers, column labels, UI chrome, and non-track content`,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: 'Extract all tracks from this DJ software screenshot. Return ONLY a JSON array.',
            },
          ],
        }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data?.error?.message || `Vision API error ${response.status}`
      return NextResponse.json({ error: msg }, { status: response.status })
    }

    const rawText = data.content?.[0]?.text || '[]'

    // Parse the JSON array from the response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({
        error: 'Could not extract tracks from this image',
        raw_text: rawText,
        imageUrl: stored.url,
        tracks: [],
      })
    }

    let tracks: Array<{ title: string; artist: string; bpm?: number | null; key?: string | null; position: number }>
    try {
      tracks = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({
        error: 'Failed to parse extracted tracks',
        raw_text: rawText,
        imageUrl: stored.url,
        tracks: [],
      })
    }

    // Ensure positions are sequential
    tracks = tracks.map((t, i) => ({
      ...t,
      position: t.position || i + 1,
    }))

    return NextResponse.json({
      tracks,
      imageUrl: stored.url,
      raw_text: rawText,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
