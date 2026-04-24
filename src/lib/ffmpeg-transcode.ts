// ffmpeg.wasm MTS/M2TS → MP4 transcode, in-browser.
//
// Chrome has no decoder for MPEG-TS (AVCHD camera footage), so the scan
// pipeline rejects .MTS at drop time. This module takes the raw File, remuxes
// the H.264 video stream into an MP4 container (no re-encode), and transcodes
// the AC-3 audio into AAC. That's ~50× faster than re-encoding video — H.264
// is already MP4-compatible, only the container needs swapping.
//
// ffmpeg.wasm core is lazy-loaded from our own R2 bucket via
// media.signallabos.com on first use. We self-host (was: unpkg CDN) because
// unpkg has sporadic outages and a single blip at posting time was killing
// the drop flow. Can't bundle under /public/ either — the wasm is ~30MB and
// Cloudflare Workers caps bundled assets at 25MB per file.

let ffmpegInstance: unknown = null
let loadingPromise: Promise<unknown> | null = null

async function getFfmpeg() {
  if (ffmpegInstance) return ffmpegInstance
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { toBlobURL } = await import('@ffmpeg/util')
    const ffmpeg = new FFmpeg()
    // Single-thread build: works without COOP/COEP headers. Multi-thread
    // would need Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy
    // set on every response, which is a much bigger platform change.
    // Self-hosted on our R2 bucket (same domain that serves post media)
    // so we don't depend on unpkg being up at posting time.
    const baseURL = 'https://media.signallabos.com/ffmpeg'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegInstance = ffmpeg
    return ffmpeg
  })()
  return loadingPromise
}

export interface TranscodeProgress {
  stage: 'loading' | 'transcoding' | 'done'
  /** 0–100, only meaningful in 'transcoding' stage */
  percent?: number
}

export async function transcodeMtsToMp4(
  file: File,
  onProgress?: (p: TranscodeProgress) => void,
): Promise<File> {
  onProgress?.({ stage: 'loading' })
  const ffmpeg = (await getFfmpeg()) as {
    on: (event: string, cb: (data: { progress: number }) => void) => void
    off: (event: string, cb: (data: { progress: number }) => void) => void
    writeFile: (name: string, data: Uint8Array) => Promise<void>
    exec: (args: string[]) => Promise<number>
    readFile: (name: string) => Promise<Uint8Array>
    deleteFile: (name: string) => Promise<void>
  }
  const { fetchFile } = await import('@ffmpeg/util')

  const progressHandler = (data: { progress: number }) => {
    // ffmpeg.wasm can report progress > 1 or negative on some codecs; clamp.
    const pct = Math.max(0, Math.min(100, Math.round(data.progress * 100)))
    onProgress?.({ stage: 'transcoding', percent: pct })
  }
  ffmpeg.on('progress', progressHandler)

  const inputName = 'input' + (file.name.match(/\.[^.]+$/)?.[0] ?? '.mts')
  const outputName = 'output.mp4'

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    // -c:v copy    → remux H.264 stream untouched (the 50× win)
    // -c:a aac     → transcode AC-3 audio to AAC (MP4-compatible)
    // -movflags +faststart → moov atom up front, for streaming playback
    await ffmpeg.exec([
      '-i', inputName,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputName,
    ])
    const data = await ffmpeg.readFile(outputName)
    const newName = file.name.replace(/\.(mts|m2ts|m2t|ts)$/i, '.mp4')
    onProgress?.({ stage: 'done' })
    return new File([new Uint8Array(data)], newName, { type: 'video/mp4' })
  } finally {
    ffmpeg.off('progress', progressHandler)
    // Best-effort cleanup — if exec failed partway these may not exist.
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
  }
}

export function isMtsFile(file: File): boolean {
  return /\.(mts|m2ts|m2t|ts)$/i.test(file.name)
}
