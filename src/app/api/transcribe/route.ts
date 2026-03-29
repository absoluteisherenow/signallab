import { NextRequest, NextResponse } from 'next/server'

// ── CORS ───────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// ── POST /api/transcribe ───────────────────────────────────────────────────────
// Receives multipart form with `audio` blob, forwards to OpenAI Whisper,
// returns { text: string }

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY not configured on server' },
      { status: 500, headers: CORS }
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'Could not parse form data' },
      { status: 400, headers: CORS }
    )
  }

  const audio = formData.get('audio') as Blob | null
  if (!audio || audio.size === 0) {
    return NextResponse.json(
      { error: 'No audio provided' },
      { status: 400, headers: CORS }
    )
  }

  // Determine file extension from mime type so Whisper knows what format it is
  const mime = (audio as any).type || 'audio/webm'
  const ext  = mime.includes('mp4') ? 'audio.mp4'
             : mime.includes('ogg') ? 'audio.ogg'
             : mime.includes('wav') ? 'audio.wav'
             : 'audio.webm'

  // Build the multipart request for Whisper
  const whisperForm = new FormData()
  whisperForm.append('file', audio, ext)
  whisperForm.append('model', 'whisper-1')
  whisperForm.append('language', 'en')
  // Hint so Whisper gets music production terminology right
  whisperForm.append(
    'prompt',
    'Music production, DAW, Ableton Live, synthesizer, compressor, reverb, EQ, ' +
    'BPM, techno, house, drum and bass, Fabfilter, Serum, 808, sidechain, saturation'
  )

  try {
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    })

    const data = await resp.json()

    if (!resp.ok) {
      const msg = data?.error?.message || `Whisper API error ${resp.status}`
      return NextResponse.json({ error: msg }, { status: resp.status, headers: CORS })
    }

    return NextResponse.json({ text: data.text ?? '' }, { headers: CORS })
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: CORS }
    )
  }
}
