'use client'

import { useState, useRef, useEffect } from 'react'
import { SignalLabHeader } from './SignalLabHeader'
import { SCAN_TIERS, DEFAULT_TIER } from '@/lib/scanTiers'
import { supabase } from '@/lib/supabase'
import { SKILLS_MEDIA_SCANNER } from '@/lib/skillPromptsClient'

const USER_TIER = 'pro' as const  // 25 per batch, 150/month

interface MediaMoment {
  timestamp: number
  score: number
  reason: string
  type: 'peak' | 'crowd' | 'lighting' | 'transition'
  thumbnail?: string
}

interface ContentScore {
  reach: number
  authenticity: number
  culture: number
  visual_identity: number
  reasoning: string
}

interface ScanResult {
  best_moment: MediaMoment
  moments: MediaMoment[]
  overall_energy: number
  best_clip_start: number
  best_clip_end: number
  caption_context: string
  post_recommendation: string
  content_score: ContentScore
  tags: string[]
  tone_match: string
  platform_cuts: {
    instagram: string
    tiktok: string
    story: string
  }
  platform_ranking: {
    platform: string
    score: number
    reason: string
  }[]
}

interface FileScan {
  file: File
  result: ScanResult
  frames: { dataUrl: string; timestamp: number }[]
  composite: number
}

// Vision-capable Claude call — sends actual frame images alongside the prompt
async function callClaudeVision(
  system: string,
  frames: { dataUrl: string; timestamp: number }[],
  textPrompt: string,
  maxTokens = 2000
): Promise<string> {
  // Build content array: one image block per frame, then the text prompt
  const content: object[] = frames.map(f => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: f.dataUrl.replace(/^data:image\/jpeg;base64,/, ''),
    },
  }))

  // Add timestamp labels as a text block before the prompt
  const frameLabels = frames.map((f, i) => `Frame ${i + 1}: ${f.timestamp.toFixed(1)}s`).join(' | ')
  content.push({ type: 'text', text: `Frame timestamps: ${frameLabels}\n\n${textPrompt}` })

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `API error ${res.status}`)
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty response from API')
  return text
}

async function extractFrames(file: File, count = 12): Promise<{ dataUrl: string; timestamp: number }[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const frames: { dataUrl: string; timestamp: number }[] = []

    video.preload = 'metadata'
    video.src = URL.createObjectURL(file)

    video.onloadedmetadata = () => {
      // Higher resolution for better visual analysis
      canvas.width = 480
      canvas.height = 270
      const duration = video.duration
      // Sample full duration — the opening frames may be the strongest hook
      const start = 0
      const end = duration
      const range = end - start
      const interval = range / (count - 1)
      let captured = 0

      const captureFrame = (time: number) => { video.currentTime = time }

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.75), timestamp: video.currentTime })
        captured++
        if (captured < count) {
          captureFrame(start + captured * interval)
        } else {
          URL.revokeObjectURL(video.src)
          resolve(frames)
        }
      }

      captureFrame(start)
    }
  })
}

async function extractImageFrame(file: File): Promise<{ dataUrl: string; timestamp: number }[]> {
  return new Promise((resolve) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    img.onload = () => {
      // Scale down to max 720px wide
      const scale = Math.min(1, 720 / img.width)
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve([{ dataUrl: canvas.toDataURL('image/jpeg', 0.8), timestamp: 0 }])
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  })
}

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

function compositeScore(r: ScanResult) {
  const s = r.content_score
  // Weighted: Reach 25%, Authenticity 30%, Culture 25%, Visual Identity 20%
  return Math.round((s.reach * 0.25) + (s.authenticity * 0.30) + (s.culture * 0.25) + (s.visual_identity * 0.20))
}

function scoreVerdict(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'POST IT', color: 'var(--green)' }
  if (score >= 60) return { label: 'TWEAK', color: 'var(--gold)' }
  if (score >= 45) return { label: 'RECONSIDER', color: '#9a6a5a' }
  return { label: "DON'T POST", color: '#8a4a3a' }
}

export function MediaScanner() {
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanningIndex, setScanningIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [scans, setScans] = useState<FileScan[]>([])
  const [selectedScan, setSelectedScan] = useState(0)
  const [error, setError] = useState('')
  const [usageInfo, setUsageInfo] = useState<{ used: number; remaining: number; monthlyLimit: number; credits: number } | null>(null)
  const [userId, setUserId] = useState('dev-user')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const tierLimits = SCAN_TIERS[USER_TIER]

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const id = session?.user?.id || 'dev-user'
      setUserId(id)
      fetch(`/api/scan-usage?userId=${id}&tier=${USER_TIER}`)
        .then(r => r.json())
        .then(d => setUsageInfo({ used: d.used, remaining: d.remaining, monthlyLimit: d.monthlyLimit, credits: d.credits }))
        .catch(() => {})
    })
  }, [])

  const s = {
    bg: 'var(--bg)',
    panel: 'var(--panel)',
    border: 'var(--border)',
    gold: 'var(--gold)',
    text: 'var(--text)',
    textDim: 'var(--text-dim)',
    textDimmer: 'var(--text-dimmer)',
    font: 'var(--font-mono)',
    green: 'var(--green)',
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const media = Array.from(incoming).filter(f => f.type.startsWith('video/') || f.type.startsWith('image/'))
    if (!media.length) { setError('Please select video or image files'); return }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      const merged = [...prev, ...media.filter(f => !names.has(f.name))]
      if (merged.length > tierLimits.batchLimit) {
        setError(`Your plan allows ${tierLimits.batchLimit} files per batch`)
        return merged.slice(0, tierLimits.batchLimit)
      }
      setError('')
      return merged
    })
    setScans([])
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index))
    setScans([])
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function scanFile(file: File, index: number, total: number): Promise<FileScan> {
    setScanningIndex(index)
    const isImage = isImageFile(file)
    setProgressLabel(isImage ? `Analysing ${file.name}...` : `Extracting frames from ${file.name}...`)
    setProgress(Math.round((index / total) * 100 + 5))

    const frames = isImage ? await extractImageFrame(file) : await extractFrames(file, 8)

    setProgressLabel(`Analysing ${file.name} (${index + 1} of ${total})...`)
    setProgress(Math.round((index / total) * 100 + 30))

    const duration = frames[frames.length - 1]?.timestamp ?? 0

    const systemPrompt = isImage
      ? `You are an expert visual content strategist for electronic music artists — Bicep, Floating Points, fred again.., Four Tet, Bonobo. You deeply understand what images and photos perform in this world: raw, atmospheric, authentic.

${SKILLS_MEDIA_SCANNER}

Analyse what you genuinely see in this image. Return ONLY valid JSON — no markdown, no explanation.`
      : `You are an expert video editor and social media strategist for electronic music artists — Bicep, Floating Points, fred again.., Four Tet, Bonobo. You deeply understand what show footage performs in this world: raw, human, unpolished, in-the-room. You are looking at actual frames extracted from a show video.

CRITICAL SOCIAL MEDIA RULE: The clip MUST start on the strongest, most attention-grabbing frame. The first 1-3 seconds decide everything on TikTok and Instagram Reels. Never bury the best moment in the middle — set best_clip_start AT or just before best_moment.timestamp so the hook is the opening frame. A strong hook = more loops = more reach.

${SKILLS_MEDIA_SCANNER}

Analyse what you genuinely see in each frame. Return ONLY valid JSON — no markdown, no explanation.`

    const textPrompt = isImage
      ? `You are looking at a photo/image called "${file.name}".

Analyse what you see:
- SUBJECT: what's in the image — crowd, artist, studio, venue, record, equipment, landscape, abstract
- LIGHTING: quality, colour, mood, drama
- COMPOSITION: framing, depth, focus, visual interest
- EMOTIONAL QUALITY: raw vs polished, authentic vs staged, atmospheric vs flat
- PLATFORM FIT: would this stop a scroll on Instagram? Work as a grid post? A story?
- AESTHETIC: does it fit the underground electronic music world

Return JSON exactly:
{
  "best_moment": {
    "timestamp": 0,
    "frame_number": 1,
    "score": <0-100>,
    "reason": "<describe exactly what you see — subject, lighting, composition, why it works or doesn't>",
    "type": "peak|crowd|lighting|transition|intimate"
  },
  "moments": [
    { "timestamp": 0, "frame_number": 1, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" }
  ],
  "overall_energy": <1-10>,
  "best_clip_start": 0,
  "best_clip_end": 0,
  "visual_quality": "<one sentence on image quality, lighting, sharpness, composition>",
  "caption_context": "<one sentence describing what is in the image — use for caption generation>",
  "post_recommendation": "<specific recommendation: grid post, story, carousel lead, skip>",
  "content_score": {
    "reach": <0-100 scroll-stop power, hook strength, share trigger>,
    "authenticity": <0-100 voice consistency, genuine energy, personal signature>,
    "culture": <0-100 scene credibility, underground codes, genre awareness>,
    "visual_identity": <0-100 colour palette, tonal match, composition style>,
    "reasoning": "<based on what you see: subject, mood, composition, platform fit>"
  },
  "tags": ["<subject>", "<mood>", "<context if detectable>"],
  "tone_match": "<which reference artist's aesthetic this feels closest to, and why>",
  "platform_cuts": {
    "instagram": "<grid post / carousel / skip — why>",
    "tiktok": "<still image with audio / skip — why>",
    "story": "<good for story / skip — why>"
  },
  "platform_ranking": [
    { "platform": "Instagram Grid", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Instagram Story", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Carousel Lead", "score": <0-100>, "reason": "<would this work as the first image in a carousel>" }
  ]
}`
      : `You are looking at ${frames.length} frames extracted from a show video called "${file.name}" (duration ~${duration.toFixed(0)}s).

Each image is a real frame from the footage. Look carefully at:
- CROWD: density, energy, movement, hands up, phones out, faces
- LIGHTING: quality, colour, drama, whether it enhances the shot
- COMPOSITION: is the artist visible, is the crowd in frame, angle quality
- MOMENT TYPE: is this a peak drop, breakdown, crowd swell, lighting change, intimate moment
- EMOTIONAL QUALITY: raw vs polished, authentic vs staged
- PLATFORM FIT: would this stop a scroll on TikTok? Instagram?

Identify which SPECIFIC FRAME NUMBER (1-${frames.length}) contains the single best moment for social media. Be specific about what you actually see.

Return JSON exactly:
{
  "best_moment": {
    "timestamp": <exact timestamp of best frame>,
    "frame_number": <1-${frames.length}>,
    "score": <0-100>,
    "reason": "<describe exactly what you see in this frame — crowd state, lighting, composition, why it works>",
    "type": "peak|crowd|lighting|transition|intimate"
  },
  "moments": [
    { "timestamp": <ts>, "frame_number": <n>, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" },
    { "timestamp": <ts>, "frame_number": <n>, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" },
    { "timestamp": <ts>, "frame_number": <n>, "score": <0-100>, "reason": "<what you see>", "type": "peak|crowd|lighting|transition|intimate" }
  ],
  "overall_energy": <1-10>,
  "best_clip_start": <timestamp of best_moment or 1-2s before it — this IS the hook/opening frame>,
  "best_clip_end": <best_clip_start + 15 to 30 seconds>,
  "visual_quality": "<one sentence on actual image quality, lighting conditions, shakiness>",
  "caption_context": "<one sentence describing what is genuinely happening in the footage>",
  "post_recommendation": "<specific recommendation based on what you actually see>",
  "content_score": {
    "reach": <0-100 scroll-stop power, hook strength, completion likelihood, share trigger>,
    "authenticity": <0-100 voice consistency, genuine energy, raw vs manufactured>,
    "culture": <0-100 scene credibility, underground codes, genre awareness, peer respect>,
    "visual_identity": <0-100 colour palette, tonal match, composition style, grid cohesion>,
    "reasoning": "<based on what you see: crowd reaction, lighting, composition>"
  },
  "tags": ["<venue/event if detectable from context>", "<show footage>", "<live electronic>"],
  "tone_match": "<which reference artist this footage feels closest to, and specifically why based on what you see>",
  "platform_cuts": {
    "instagram": "<timestamp range e.g. 0:15 – 0:45 — why>",
    "tiktok": "<timestamp range — why>",
    "story": "<timestamp range — why>"
  },
  "platform_ranking": [
    { "platform": "TikTok", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Instagram Reel", "score": <0-100>, "reason": "<based on what you see>" },
    { "platform": "Instagram Story", "score": <0-100>, "reason": "<based on what you see>" }
  ]
}`

    const raw = await callClaudeVision(systemPrompt, frames, textPrompt, 2000)

    const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return { file, result: data, frames, composite: compositeScore(data) }
  }

  async function scanAll() {
    if (!files.length) return

    // Check monthly limit
    if (usageInfo && usageInfo.remaining < files.length) {
      const shortfall = files.length - usageInfo.remaining
      setError(`Not enough scans remaining this month (${usageInfo.remaining} left). Remove ${shortfall} clip${shortfall > 1 ? 's' : ''} or top up with credits.`)
      return
    }

    setScanning(true)
    setProgress(0)
    setError('')
    setScans([])

    const results: FileScan[] = []
    try {
      for (let i = 0; i < files.length; i++) {
        const scan = await scanFile(files[i], i, files.length)
        results.push(scan)
        setScans([...results])
      }

      // Record usage
      await fetch('/api/scan-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tier: USER_TIER, count: files.length }),
      }).then(r => r.json()).then(d => {
        if (d.remaining !== undefined) setUsageInfo(prev => prev ? { ...prev, used: prev.used + files.length, remaining: d.remaining } : null)
      }).catch(() => {})

      // Sort: highest composite first
      results.sort((a, b) => b.composite - a.composite)
      setScans(results)
      setSelectedScan(0)
      setProgress(100)
      setProgressLabel('All scans complete')
    } catch (err: any) {
      setError('Scan failed: ' + err.message)
    } finally {
      setScanning(false)
    }
  }

  function useInBroadcast() {
    const scan = scans[selectedScan]
    if (!scan) return
    const params = new URLSearchParams({ context: scan.result.caption_context })
    window.open('/broadcast?' + params.toString(), '_blank')
  }

  async function downloadClip(scan: FileScan) {
    // Download the original file — browser-based clip extraction is unreliable
    // The best_clip timestamps are shown in the UI for manual trimming
    const url = URL.createObjectURL(scan.file)
    const a = document.createElement('a')
    a.href = url
    const ext = scan.file.name.split('.').pop() || 'mp4'
    const start = scan.result.best_clip_start?.toFixed(0) ?? '0'
    const end = scan.result.best_clip_end?.toFixed(0) ?? '30'
    a.download = `${scan.file.name.replace(/\.[^.]+$/, '')}_trim_${start}s-${end}s.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const [downloading, setDownloading] = useState(false)

  async function handleDownload(scan: FileScan) {
    setDownloading(true)
    try { await downloadClip(scan) } finally { setDownloading(false) }
  }

  const typeColors: Record<string, string> = {
    peak: '#b08d57',
    crowd: '#3d6b4a',
    lighting: '#6a7a9a',
    transition: '#9a6a5a',
  }

  const activeScan = scans[selectedScan] || null

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>

      <SignalLabHeader right={usageInfo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '10px', color: s.textDimmer, letterSpacing: '0.1em' }}>
          <span>{usageInfo.used} / {usageInfo.monthlyLimit} scans</span>
          {usageInfo.credits > 0 && <span style={{ color: s.gold }}>+{usageInfo.credits} credits</span>}
          <div style={{ width: '80px', height: '2px', background: s.border }}>
            <div style={{ height: '2px', background: usageInfo.remaining < 5 ? '#8a4a3a' : s.gold, width: `${Math.min(100, (usageInfo.used / usageInfo.monthlyLimit) * 100)}%` }} />
          </div>
        </div>
      ) : undefined} />

      <div style={{ padding: '32px' }}>

      <div style={{ display: 'grid', gridTemplateColumns: scans.length > 0 ? '1fr 1fr' : '1fr', gap: '24px' }}>

        {/* LEFT: UPLOAD + CONTROLS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !files.length && fileInputRef.current?.click()}
            style={{
              background: dragging ? '#1a1917' : s.panel,
              border: `1px dashed ${dragging ? s.gold : files.length ? s.gold + '60' : s.border}`,
              padding: '32px',
              textAlign: 'center',
              cursor: files.length ? 'default' : 'pointer',
              transition: 'all 0.15s',
            }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              multiple
              onChange={e => addFiles(e.target.files)}
              style={{ display: 'none' }}
            />
            {files.length === 0 ? (
              <div>
                <div style={{ fontSize: '32px', color: s.textDimmer, marginBottom: '12px' }}>⬆</div>
                <div style={{ fontSize: '14px', color: s.textDim, marginBottom: '8px' }}>Drop videos and photos here</div>
                <div style={{ fontSize: '11px', color: s.textDimmer }}>MP4, MOV, JPG, PNG · Up to {tierLimits.batchLimit} files per batch</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '12px' }}>{files.length} file{files.length > 1 ? 's' : ''} queued</div>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${s.border}`, fontSize: '11px' }}>
                    <span style={{ color: s.textDim, textAlign: 'left', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ color: s.textDimmer, marginLeft: '12px', flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      onClick={e => { e.stopPropagation(); removeFile(i) }}
                      style={{ background: 'transparent', border: 'none', color: s.textDimmer, cursor: 'pointer', marginLeft: '8px', fontSize: '14px', padding: '0 4px', flexShrink: 0 }}>
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                  style={{ marginTop: '12px', background: 'transparent', border: `1px solid ${s.border}`, color: s.textDim, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                  + Add more
                </button>
              </div>
            )}
          </div>

          {/* Scan button */}
          {files.length > 0 && !scanning && (
            <button onClick={scanAll} style={{
              background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
              border: `1px solid ${s.gold}`,
              color: s.gold,
              fontFamily: s.font,
              fontSize: '11px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              padding: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              boxShadow: '0 0 20px rgba(176,141,87,0.1)',
            }}>
              {files.length > 1 ? `Scan all ${files.length} files →` : 'Scan content →'}
            </button>
          )}

          {/* Progress */}
          {scanning && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDim, marginBottom: '12px', textTransform: 'uppercase' }}>{progressLabel}</div>
              <div style={{ height: '2px', background: s.border, position: 'relative', marginBottom: '8px' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '2px', background: s.gold, width: `${progress}%`, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: '10px', color: s.textDimmer }}>{progress}%</div>
            </div>
          )}

          {error && <div style={{ fontSize: '11px', color: '#8a4a3a', padding: '12px 16px', border: '1px solid #4a2a1a', background: '#1a0a06' }}>{error}</div>}

          {/* Rankings — shown once scans complete */}
          {scans.length > 1 && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Content ranking</div>
              {scans.map((scan, i) => {
                const v = scoreVerdict(scan.composite)
                const thumb = scan.frames[0]?.dataUrl
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedScan(i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 0',
                      borderBottom: i < scans.length - 1 ? `1px solid ${s.border}` : 'none',
                      cursor: 'pointer',
                      opacity: selectedScan === i ? 1 : 0.5,
                      transition: 'opacity 0.15s',
                    }}>
                    {thumb && (
                      <img src={thumb} alt="" style={{ width: '48px', height: '28px', objectFit: 'cover', flexShrink: 0, border: `1px solid ${selectedScan === i ? s.gold + '60' : s.border}` }} />
                    )}
                    <div style={{ fontSize: '20px', fontWeight: 300, color: v.color, width: '36px', flexShrink: 0, textAlign: 'center' }}>
                      {scan.composite}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                      <div style={{ fontSize: '11px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px' }}>
                        {i === 0 && <span style={{ color: s.green, marginRight: '6px' }}>★</span>}
                        {scan.result.caption_context || scan.file.name}
                      </div>
                      <div style={{ fontSize: '9px', color: s.textDimmer }}>
                        R:{scan.result.content_score.reach} · A:{scan.result.content_score.authenticity} · C:{scan.result.content_score.culture} · V:{scan.result.content_score.visual_identity}
                      </div>
                    </div>
                    <div style={{ fontSize: '8px', letterSpacing: '0.12em', color: v.color, textTransform: 'uppercase', flexShrink: 0, fontFamily: s.font }}>
                      {v.label}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Frames for selected scan */}
          {activeScan && activeScan.frames.length > 0 && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '16px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '10px' }}>Extracted frames</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {activeScan.frames.map((f, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={f.dataUrl} alt="" style={{ width: '100%', display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', fontSize: '10px', color: s.textDim, padding: '2px 4px' }}>{f.timestamp.toFixed(1)}s</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: RESULTS */}
        {activeScan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {scans.length > 1 && (
              <div style={{ fontSize: '10px', color: s.textDimmer, letterSpacing: '0.1em', paddingBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedScan === 0 ? <span style={{ color: s.green }}>★ TOP PICK — </span> : null}
                {activeScan.file.name}
              </div>
            )}

            {/* Content Score */}
            <div style={{ background: s.panel, border: `1px solid ${s.gold}`, padding: '24px 28px', boxShadow: '0 0 20px rgba(176,141,87,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase' }}>Content intelligence</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 300, color: scoreVerdict(activeScan.composite).color }}>{activeScan.composite}</span>
                  <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: scoreVerdict(activeScan.composite).color, textTransform: 'uppercase' }}>{scoreVerdict(activeScan.composite).label}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Reach', value: activeScan.result.content_score.reach, desc: 'Scroll-stop · share trigger' },
                  { label: 'Authenticity', value: activeScan.result.content_score.authenticity, desc: 'Voice · genuine energy' },
                  { label: 'Culture', value: activeScan.result.content_score.culture, desc: 'Scene cred · underground' },
                  { label: 'Visual ID', value: activeScan.result.content_score.visual_identity, desc: 'Palette · composition' },
                ].map(metric => (
                  <div key={metric.label}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>{metric.label}</div>
                    <div style={{ fontSize: '28px', fontWeight: 300, color: metric.value >= 80 ? s.green : metric.value >= 60 ? s.gold : '#8a4a3a', marginBottom: '4px' }}>{metric.value}</div>
                    <div style={{ height: '2px', background: '#1a1917', marginBottom: '6px' }}>
                      <div style={{ height: '2px', background: metric.value >= 80 ? s.green : metric.value >= 60 ? s.gold : '#8a4a3a', width: `${metric.value}%`, transition: 'width 0.8s ease' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: s.textDimmer }}>{metric.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: s.textDim, lineHeight: '1.7', paddingTop: '16px', borderTop: `1px solid ${s.border}` }}>
                {activeScan.result.content_score.reasoning}
              </div>
            </div>

            {/* Best moment */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase' }}>Best moment</div>
                {!isImageFile(activeScan.file) && (
                  <button
                    onClick={() => handleDownload(activeScan)}
                    disabled={downloading}
                    style={{
                      background: downloading ? 'transparent' : 'rgba(176,141,87,0.08)',
                      border: `1px solid ${downloading ? s.border : s.gold + '80'}`,
                      color: downloading ? s.textDimmer : s.gold,
                      fontFamily: s.font,
                      fontSize: '9px',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      padding: '6px 14px',
                      cursor: downloading ? 'default' : 'pointer',
                    }}
                  >
                    {downloading ? 'Extracting...' : `↓ Download clip (${activeScan.result.best_clip_start?.toFixed(0) ?? '?'}s – ${activeScan.result.best_clip_end?.toFixed(0) ?? '?'}s)`}
                  </button>
                )}
              </div>
              {!isImageFile(activeScan.file) ? (
                <div style={{ fontSize: '36px', fontWeight: 300, color: s.gold, marginBottom: '6px', fontFamily: "'Unbounded', sans-serif", letterSpacing: '-0.02em' }}>
                  {activeScan.result.best_moment.timestamp.toFixed(1)}s
                </div>
              ) : (
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '6px' }}>Photo</div>
              )}
              <div style={{ fontSize: '12px', color: s.textDim, marginBottom: '14px', lineHeight: '1.7' }}>
                {activeScan.result.best_moment.reason}
              </div>
              {(activeScan.result as ScanResult & { visual_quality?: string }).visual_quality && (
                <div style={{ fontSize: '11px', color: s.textDimmer, marginBottom: '12px', lineHeight: '1.6', paddingTop: '12px', borderTop: `1px solid ${s.border}` }}>
                  {(activeScan.result as ScanResult & { visual_quality?: string }).visual_quality}
                </div>
              )}
              <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: s.textDimmer }}>
                <span>Energy: <span style={{ color: s.gold }}>{activeScan.result.overall_energy}/10</span></span>
                <span>Type: <span style={{ color: typeColors[activeScan.result.best_moment.type] || s.gold }}>{activeScan.result.best_moment.type}</span></span>
              </div>
            </div>

            {/* Tone + Tags */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {activeScan.result.tone_match && (
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.green, textTransform: 'uppercase', marginBottom: '10px' }}>Tone match</div>
                  <div style={{ fontSize: '12px', color: s.textDim, lineHeight: '1.7' }}>{activeScan.result.tone_match}</div>
                </div>
              )}
              {activeScan.result.tags && activeScan.result.tags.length > 0 && (
                <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '10px' }}>Auto-tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {activeScan.result.tags.map((tag, i) => (
                      <span key={i} style={{ fontSize: '11px', color: s.textDim, background: '#1a1917', padding: '4px 10px', letterSpacing: '0.04em' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Platform ranking */}
            {activeScan.result.platform_ranking && (
              <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Platform ranking</div>
                {activeScan.result.platform_ranking.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: i < activeScan.result.platform_ranking.length - 1 ? `1px solid ${s.border}` : 'none' }}>
                    <div style={{ fontSize: '20px', fontWeight: 300, color: i === 0 ? s.green : i === 1 ? s.gold : s.textDimmer, width: '36px' }}>{p.score}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: s.text, marginBottom: '2px' }}>{p.platform}</div>
                      <div style={{ fontSize: '10px', color: s.textDimmer }}>{p.reason}</div>
                    </div>
                    <div style={{ height: '2px', width: '80px', background: '#1a1917' }}>
                      <div style={{ height: '2px', background: i === 0 ? s.green : i === 1 ? s.gold : s.textDimmer, width: `${p.score}%`, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Platform cuts */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Clip timestamps</div>
              {Object.entries(activeScan.result.platform_cuts).map(([platform, cut]) => (
                <div key={platform} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${s.border}`, fontSize: '11px' }}>
                  <span style={{ color: s.textDimmer, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{platform}</span>
                  <span style={{ color: s.textDim }}>{cut}</span>
                </div>
              ))}
            </div>

            {/* All moments */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>All moments</div>
              {activeScan.result.moments.map((moment, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: `1px solid ${s.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: s.text }}>{moment.timestamp.toFixed(1)}s</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: typeColors[moment.type] || s.gold, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{moment.type}</span>
                      <span style={{ fontSize: '12px', color: s.gold }}>{moment.score}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: s.textDimmer }}>{moment.reason}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '11px', color: s.textDim, marginBottom: '14px', lineHeight: '1.6' }}>{activeScan.result.post_recommendation}</div>
              <div style={{ fontSize: '10px', color: s.textDimmer, marginBottom: '18px' }}>Caption context: <span style={{ color: s.textDim }}>{activeScan.result.caption_context}</span></div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={useInBroadcast} style={{
                  flex: 1,
                  background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
                  border: `1px solid ${s.gold}`,
                  color: s.gold,
                  fontFamily: s.font,
                  fontSize: '10px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '14px',
                  cursor: 'pointer',
                }}>
                  Write caption →
                </button>
                {!isImageFile(activeScan.file) && (
                  <button
                    onClick={() => handleDownload(activeScan)}
                    disabled={downloading}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${s.border}`,
                      color: downloading ? s.textDimmer : s.textDim,
                      fontFamily: s.font,
                      fontSize: '10px',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      padding: '14px 18px',
                      cursor: downloading ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {downloading ? 'Extracting...' : '↓ Best clip'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      </div>{/* end inner padding */}
    </div>
  )
}
