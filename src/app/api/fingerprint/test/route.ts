import { NextResponse } from 'next/server'
import crypto from 'crypto'

// Sends a tiny silent WAV to ACRCloud just to test auth + connectivity
// Returns { ok, code, msg, configured } — does NOT require real audio
export async function GET() {
  const accessKey    = process.env.ACRCLOUD_ACCESS_KEY?.trim()
  const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET?.trim()
  const host         = (process.env.ACRCLOUD_HOST || 'identify-eu-west-1.acrcloud.com').trim()

  if (!accessKey || !accessSecret) {
    return NextResponse.json({
      ok: false,
      configured: false,
      msg: 'ACRCLOUD_ACCESS_KEY or ACRCLOUD_ACCESS_SECRET not set in environment',
    })
  }

  // Build a minimal valid WAV — 1 second of silence at 16000 Hz mono 16-bit
  const sampleRate  = 16000
  const numSamples  = sampleRate // 1 second
  const dataBytes   = numSamples * 2 // 16-bit = 2 bytes per sample
  const buf         = Buffer.alloc(44 + dataBytes, 0)

  buf.write('RIFF', 0);                      buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8);                      buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16);                 buf.writeUInt16LE(1, 20)  // PCM
  buf.writeUInt16LE(1, 22);                  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28);     buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34);                 buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  // samples remain zero (silence)

  const wavBlob = new Blob([buf], { type: 'audio/wav' })

  const timestamp    = Math.floor(Date.now() / 1000).toString()
  const stringToSign = `POST\n/v1/identify\n${accessKey}\naudio\n1\n${timestamp}`
  const signature    = crypto.createHmac('sha1', accessSecret).update(stringToSign).digest('base64')

  const form = new FormData()
  form.append('sample',           wavBlob, 'test.wav')
  form.append('sample_bytes',     wavBlob.size.toString())
  form.append('access_key',       accessKey)
  form.append('data_type',        'audio')
  form.append('signature_version','1')
  form.append('signature',        signature)
  form.append('timestamp',        timestamp)

  try {
    const resp = await fetch(`https://${host}/v1/identify`, { method: 'POST', body: form })
    const data = await resp.json()
    const code = data.status?.code
    const msg  = data.status?.msg || ''

    // code 1001 = no result found (silence, expected) = ACRCloud is working fine
    // code 3000/3001 = auth error
    // code 3003 = rate limit
    const authOk = code === 1001 || code === 0

    return NextResponse.json({
      ok:         authOk,
      configured: true,
      code,
      msg,
      host,
      detail: authOk
        ? 'ACRCloud connected — credentials valid'
        : code === 3000 || code === 3001
          ? `Auth failed (${code}) — check ACRCLOUD_ACCESS_KEY and ACRCLOUD_ACCESS_SECRET`
          : code === 3003
            ? 'Rate limit hit — wait a moment and retry'
            : `Unexpected response (${code}): ${msg}`,
    })
  } catch (err: unknown) {
    return NextResponse.json({
      ok:         false,
      configured: true,
      msg:        err instanceof Error ? err.message : 'Network error reaching ACRCloud',
      detail:     'Could not connect to ACRCloud — check ACRCLOUD_HOST env var',
    })
  }
}
