import { NextResponse } from 'next/server'

// Sends a tiny silent WAV to AudD to test auth + connectivity
export async function GET() {
  const apiToken = process.env.AUDD_API_TOKEN?.trim()

  if (!apiToken) {
    return NextResponse.json({
      ok: false,
      configured: false,
      msg: 'AUDD_API_TOKEN not set in environment',
    })
  }

  // Build a minimal valid WAV — 1 second of silence at 16000 Hz mono 16-bit
  const sampleRate = 16000
  const numSamples = sampleRate
  const dataBytes  = numSamples * 2
  const buf        = Buffer.alloc(44 + dataBytes, 0)

  buf.write('RIFF', 0);                      buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8);                      buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16);                 buf.writeUInt16LE(1, 20)  // PCM
  buf.writeUInt16LE(1, 22);                  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28);     buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34);                 buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)

  const wavBlob = new Blob([buf], { type: 'audio/wav' })

  const form = new FormData()
  form.append('api_token', apiToken)
  form.append('audio', wavBlob, 'test.wav')

  try {
    const resp = await fetch('https://api.audd.io/', { method: 'POST', body: form })
    const data = await resp.json()

    // status=success + result=null means silence = no match = API is working fine
    const ok = data.status === 'success'

    return NextResponse.json({
      ok,
      configured: true,
      status: data.status,
      detail: ok
        ? 'AudD connected — API token valid'
        : `AudD error: ${data.error?.error_message || JSON.stringify(data)}`,
    })
  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      configured: true,
      detail: err instanceof Error ? err.message : 'Network error reaching AudD',
    })
  }
}
