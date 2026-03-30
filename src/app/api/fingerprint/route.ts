import { NextRequest, NextResponse } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  const apiToken = process.env.AUDD_API_TOKEN?.trim()

  if (!apiToken) {
    return NextResponse.json({ error: 'AUDD_API_TOKEN not configured' }, { status: 500, headers: CORS })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Could not parse form data' }, { status: 400, headers: CORS })
  }

  const audio = formData.get('audio') as Blob | null
  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400, headers: CORS })
  }

  const auddForm = new FormData()
  auddForm.append('api_token', apiToken)
  auddForm.append('file', audio, 'snippet.wav')
  auddForm.append('return', 'spotify,apple_music')

  try {
    const resp = await fetch('https://api.audd.io/', {
      method: 'POST',
      body: auddForm,
    })
    const data = await resp.json()

    if (data.status === 'success' && data.result) {
      const track = data.result
      return NextResponse.json({
        found:        true,
        title:        track.title        || '',
        artist:       track.artist       || '',
        album:        track.album        || '',
        label:        track.label        || '',
        release_date: track.release_date || '',
        confidence:   85, // AudD doesn't return a score — 85 signals a solid match
      }, { headers: CORS })
    } else if (data.status === 'success' && !data.result) {
      return NextResponse.json({ found: false, msg: 'No match found' }, { headers: CORS })
    } else {
      return NextResponse.json({ found: false, code: data.error?.error_code, msg: data.error?.error_message }, { headers: CORS })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS })
  }
}
