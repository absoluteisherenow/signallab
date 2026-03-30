import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  const accessKey    = process.env.ACRCLOUD_ACCESS_KEY?.trim()
  const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET?.trim()
  const host         = (process.env.ACRCLOUD_HOST || 'identify-eu-west-1.acrcloud.com').trim()

  if (!accessKey || !accessSecret) {
    return NextResponse.json({ error: 'ACRCloud not configured — add ACRCLOUD_ACCESS_KEY and ACRCLOUD_ACCESS_SECRET env vars' }, { status: 500, headers: CORS })
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

  const timestamp     = Math.floor(Date.now() / 1000).toString()
  const stringToSign  = `POST\n/v1/identify\n${accessKey}\naudio\n1\n${timestamp}`
  const signature     = crypto.createHmac('sha1', accessSecret).update(stringToSign).digest('base64')

  const acrForm = new FormData()
  acrForm.append('sample', audio, 'audio.wav')
  acrForm.append('sample_bytes', audio.size.toString())
  acrForm.append('access_key', accessKey)
  acrForm.append('data_type', 'audio')
  acrForm.append('signature_version', '1')
  acrForm.append('signature', signature)
  acrForm.append('timestamp', timestamp)

  try {
    const resp = await fetch(`https://${host}/v1/identify`, {
      method: 'POST',
      body: acrForm,
    })
    const data = await resp.json()

    if (data.status?.code === 0 && data.metadata?.music?.[0]) {
      const track = data.metadata.music[0]
      return NextResponse.json({
        found: true,
        title:        track.title        || '',
        artist:       track.artists?.[0]?.name || '',
        album:        track.album?.name   || '',
        label:        track.label         || '',
        release_date: track.release_date  || '',
        confidence:   Math.round(track.score || 100),
      }, { headers: CORS })
    } else {
      // code 1001 = no result, others = errors
      return NextResponse.json({ found: false, code: data.status?.code, msg: data.status?.msg }, { headers: CORS })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS })
  }
}
