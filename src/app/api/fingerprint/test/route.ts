import { NextResponse } from 'next/server'
import crypto from 'crypto'

// ── Tests both AudD and ACRCloud connectivity ─────────────────────────────────

// Build a minimal valid WAV — 1 second of silence at 16000 Hz mono 16-bit
function buildSilentWav(): Uint8Array {
  const sampleRate = 16000
  const numSamples = sampleRate
  const dataBytes  = numSamples * 2
  const ab  = new ArrayBuffer(44 + dataBytes)
  const v   = new DataView(ab)
  // RIFF header
  ;[82,73,70,70].forEach((b,i) => v.setUint8(i, b))         // 'RIFF'
  v.setUint32(4,  36 + dataBytes, true)
  ;[87,65,86,69].forEach((b,i) => v.setUint8(8+i, b))       // 'WAVE'
  ;[102,109,116,32].forEach((b,i) => v.setUint8(12+i, b))   // 'fmt '
  v.setUint32(16, 16, true)          // chunk size
  v.setUint16(20, 1, true)           // PCM
  v.setUint16(22, 1, true)           // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  ;[100,97,116,97].forEach((b,i) => v.setUint8(36+i, b))    // 'data'
  v.setUint32(40, dataBytes, true)
  // silence — remaining bytes already 0
  return new Uint8Array(ab)
}

async function testAudD(wavBuf: Uint8Array): Promise<{ ok: boolean; detail: string }> {
  const apiToken = process.env.AUDD_API_TOKEN?.trim()
  if (!apiToken) return { ok: false, detail: 'AUDD_API_TOKEN not configured' }

  const wavBlob = new Blob([wavBuf.buffer as ArrayBuffer], { type: 'audio/wav' })
  const form = new FormData()
  form.append('api_token', apiToken)
  form.append('file', wavBlob, 'test.wav')

  try {
    const resp = await fetch('https://api.audd.io/', { method: 'POST', body: form, signal: AbortSignal.timeout(8000) })
    const data = await resp.json()
    // status=success (no match) OR error_code=300 (can't fingerprint silence) both mean auth is working
    const authOk = data.status === 'success' || data.error?.error_code === 300
    return {
      ok: authOk,
      detail: authOk ? 'AudD connected — token valid' : `AudD error: ${data.error?.error_message || JSON.stringify(data)}`,
    }
  } catch (err: unknown) {
    return { ok: false, detail: err instanceof Error ? err.message : 'Network error reaching AudD' }
  }
}

async function testACRCloud(wavBuf: Uint8Array): Promise<{ ok: boolean; detail: string }> {
  const host   = process.env.ACRCLOUD_HOST?.trim()
  const key    = process.env.ACRCLOUD_ACCESS_KEY?.trim()
  const secret = process.env.ACRCLOUD_SECRET_KEY?.trim()

  if (!host || !key || !secret) return { ok: false, detail: 'ACRCLOUD_HOST / ACRCLOUD_ACCESS_KEY / ACRCLOUD_SECRET_KEY not configured' }

  const timestamp = Math.floor(Date.now() / 1000)
  const stringToSign = `POST\n/v1/identify\n${key}\naudio\n1\n${timestamp}`
  const signature = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64')

  const wavBlob = new Blob([wavBuf.buffer as ArrayBuffer], { type: 'audio/wav' })
  const form = new FormData()
  form.append('access_key',        key)
  form.append('sample',            wavBlob, 'test.wav')
  form.append('sample_bytes',      String(wavBlob.size))
  form.append('timestamp',         String(timestamp))
  form.append('signature',         signature)
  form.append('data_type',         'audio')
  form.append('signature_version', '1')

  try {
    const resp = await fetch(`https://${host}/v1/identify`, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) })
    const data = await resp.json()
    // code 0 = success (found), code 1001 = no result — both mean auth is working
    const authOk = data?.status?.code === 0 || data?.status?.code === 1001
    return {
      ok: authOk,
      detail: authOk
        ? `ACRCloud connected — host ${host}`
        : `ACRCloud error ${data?.status?.code}: ${data?.status?.msg || JSON.stringify(data)}`,
    }
  } catch (err: unknown) {
    return { ok: false, detail: err instanceof Error ? err.message : 'Network error reaching ACRCloud' }
  }
}

export async function GET() {
  const wavBuf = buildSilentWav()

  const [auddResult, acrResult] = await Promise.allSettled([
    testAudD(wavBuf),
    testACRCloud(wavBuf),
  ])

  const audd = auddResult.status === 'fulfilled' ? auddResult.value : { ok: false, detail: 'Test threw an error' }
  const acr  = acrResult.status  === 'fulfilled' ? acrResult.value  : { ok: false, detail: 'Test threw an error' }

  const anyOk = audd.ok || acr.ok
  const summary = [
    audd.ok ? '✓ AudD' : '✗ AudD',
    acr.ok  ? '✓ ACRCloud' : '✗ ACRCloud',
  ].join(' · ')

  return NextResponse.json({
    ok:     anyOk,
    detail: `${summary}${!anyOk ? ' — configure at least one provider' : ''}`,
    providers: { audd, acrcloud: acr },
  })
}
