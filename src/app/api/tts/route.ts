import { NextRequest, NextResponse } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// POST /api/tts  { text: string }  → audio/mpeg stream
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500, headers: CORS })
  }

  let text: string
  try {
    const body = await req.json()
    text = (body.text || '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS })
  }

  if (!text) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400, headers: CORS })
  }

  // OpenAI TTS supports up to 4096 chars — allow longer meditation scripts
  const clipped = text.length > 2000 ? text.substring(0, 1997) + '…' : text

  try {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'fable',     // warm, British-ish, character-ful — suits the NM aesthetic
        input: clipped,
        speed: 0.95,
      }),
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      const msg = (err as any)?.error?.message || `OpenAI TTS error ${resp.status}`
      return NextResponse.json({ error: msg }, { status: resp.status, headers: CORS })
    }

    // Stream the audio buffer back
    const audioBuffer = await resp.arrayBuffer()
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS })
  }
}
