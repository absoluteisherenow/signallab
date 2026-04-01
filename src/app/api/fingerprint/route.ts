import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// ── Fingerprinting: AudD primary, ACRCloud secondary (when credentials valid) ─
// ACRCloud is wired but disabled until a working EU credential set is obtained.
// Strategy: fire whichever providers are configured; highest confidence wins.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// ── ACRCloud ──────────────────────────────────────────────────────────────────

function buildACRSignature(accessKey: string, secretKey: string, timestamp: number): string {
  const stringToSign = `POST\n/v1/identify\n${accessKey}\naudio\n1\n${timestamp}`
  // ACRCloud EU requires HMAC-SHA1 (not SHA256)
  return crypto.createHmac('sha1', secretKey).update(stringToSign).digest('base64')
}

async function queryACRCloud(audioBlob: Blob): Promise<{
  found: boolean; title?: string; artist?: string; album?: string;
  label?: string; release_date?: string; confidence: number; source: 'acrcloud';
  _debug?: string
}> {
  const host    = process.env.ACRCLOUD_HOST?.trim()
  const key     = process.env.ACRCLOUD_ACCESS_KEY?.trim()
  const secret  = process.env.ACRCLOUD_SECRET_KEY?.trim()

  if (!host || !key || !secret) {
    return { found: false, confidence: 0, source: 'acrcloud', _debug: `missing env: host=${!!host} key=${!!key} secret=${!!secret}` }
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = buildACRSignature(key, secret, timestamp)

  const form = new FormData()
  form.append('access_key',         key)
  form.append('sample',             audioBlob, 'snippet.wav')
  form.append('sample_bytes',       String(audioBlob.size))
  form.append('timestamp',          String(timestamp))
  form.append('signature',          signature)
  form.append('data_type',          'audio')
  form.append('signature_version',  '1')

  let data: Record<string, unknown>
  try {
    const resp = await fetch(`https://${host}/v1/identify`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20000),
    })
    const text = await resp.text()
    try {
      data = JSON.parse(text)
    } catch {
      return { found: false, confidence: 0, source: 'acrcloud', _debug: `bad JSON from ACRCloud (HTTP ${resp.status}): ${text.slice(0, 200)}` }
    }
  } catch (err) {
    return { found: false, confidence: 0, source: 'acrcloud', _debug: `network error: ${err instanceof Error ? err.message : String(err)}` }
  }

  const status = data?.status as { code?: number; msg?: string } | undefined
  if (status?.code !== 0) {
    return { found: false, confidence: 0, source: 'acrcloud', _debug: `ACRCloud code ${status?.code}: ${status?.msg}` }
  }

  const music = (data?.metadata as { music?: unknown[] } | undefined)?.music
  if (!music?.length) {
    return { found: false, confidence: 0, source: 'acrcloud', _debug: 'code 0 but no music results' }
  }

  const track = music[0] as {
    title?: string; artists?: { name?: string }[]; album?: { name?: string };
    label?: string; release_date?: string; score?: number
  }
  return {
    found:        true,
    title:        track.title || '',
    artist:       track.artists?.[0]?.name || '',
    album:        track.album?.name || '',
    label:        track.label || '',
    release_date: track.release_date || '',
    confidence:   Math.round(track.score ?? 90),
    source:       'acrcloud',
  }
}

// ── AudD ─────────────────────────────────────────────────────────────────────

async function queryAudD(audioBlob: Blob): Promise<{
  found: boolean; title?: string; artist?: string; album?: string;
  label?: string; release_date?: string; confidence: number; source: 'audd';
  _debug?: string
}> {
  const apiToken = process.env.AUDD_API_TOKEN?.trim()
  if (!apiToken) return { found: false, confidence: 0, source: 'audd', _debug: 'AUDD_API_TOKEN not set' }

  const form = new FormData()
  form.append('api_token', apiToken)
  form.append('file',      audioBlob, 'snippet.wav')
  form.append('return',    'spotify,apple_music')

  let data: Record<string, unknown>
  try {
    const resp = await fetch('https://api.audd.io/', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    })
    data = await resp.json()
  } catch (err) {
    return { found: false, confidence: 0, source: 'audd', _debug: `network error: ${err instanceof Error ? err.message : String(err)}` }
  }

  if (data.status === 'error') {
    const errMsg = (data.error as { error_message?: string })?.error_message || JSON.stringify(data.error)
    return { found: false, confidence: 0, source: 'audd', _debug: `AudD error: ${errMsg}` }
  }

  if (data.status !== 'success' || !data.result) {
    return { found: false, confidence: 0, source: 'audd', _debug: `status=${data.status}, result=${data.result ? 'present' : 'null'}` }
  }

  const track = data.result as { title?: string; artist?: string; album?: string; label?: string; release_date?: string }
  return {
    found:        true,
    title:        track.title        || '',
    artist:       track.artist       || '',
    album:        track.album        || '',
    label:        track.label        || '',
    release_date: track.release_date || '',
    confidence:   85, // AudD has no score — 85 indicates a confirmed match
    source:       'audd',
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

  // Fire both providers simultaneously
  const [acrResult, auddResult] = await Promise.allSettled([
    queryACRCloud(audio),
    queryAudD(audio),
  ])

  const acr  = acrResult.status  === 'fulfilled' ? acrResult.value  : { found: false, confidence: 0, source: 'acrcloud' as const }
  const audd = auddResult.status === 'fulfilled' ? auddResult.value : { found: false, confidence: 0, source: 'audd' as const }

  // Pick winner: higher confidence wins; ACRCloud preferred on ties (real score)
  let winner: typeof acr | typeof audd | null = null

  if (acr.found && audd.found) {
    winner = acr.confidence >= audd.confidence ? acr : audd
  } else if (acr.found) {
    winner = acr
  } else if (audd.found) {
    winner = audd
  }

  if (!winner) {
    return NextResponse.json({
      found:   false,
      msg:     'No match found',
      tried:   ['acrcloud', 'audd'].filter((s, i) => [!!process.env.ACRCLOUD_ACCESS_KEY, !!process.env.AUDD_API_TOKEN][i]),
      debug: {
        acrcloud: acr._debug ?? 'no match',
        audd: (audd as { _debug?: string })._debug ?? (audd.found ? 'found' : 'no match'),
      },
    }, { headers: CORS })
  }

  return NextResponse.json({
    found:        true,
    title:        winner.title,
    artist:       winner.artist,
    album:        winner.album,
    label:        winner.label,
    release_date: winner.release_date,
    confidence:   winner.confidence,
    source:       winner.source,
    providers: {
      acrcloud: acr.found  ? { title: acr.title,  artist: acr.artist,  confidence: acr.confidence }  : null,
      audd:     audd.found ? { title: audd.title, artist: audd.artist, confidence: audd.confidence } : null,
    },
    debug: {
      acrcloud: acr.found ? 'found' : (acr._debug ?? 'no match'),
      audd: (audd as { _debug?: string })._debug ?? (audd.found ? 'found' : 'no match'),
    },
  }, { headers: CORS })
}
