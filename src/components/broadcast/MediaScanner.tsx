'use client'

import { useState, useRef, useEffect } from 'react'
import { SCAN_TIERS, DEFAULT_TIER } from '@/lib/scanTiers'
import { supabase } from '@/lib/supabase'

const USER_TIER = DEFAULT_TIER  // 'artist' — 10 per batch, 60/month

interface MediaMoment {
  timestamp: number
  score: number
  reason: string
  type: 'peak' | 'crowd' | 'lighting' | 'transition'
  thumbnail?: string
}

interface ContentScore {
  engagement: number
  brand_alignment: number
  virality: number
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

async function callClaude(system: string, userPrompt: string, maxTokens = 600): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', system, max_tokens: maxTokens, messages: [{ role: 'user', content: userPrompt }] }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `API error ${res.status}`)
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty response from API')
  return text
}

async function extractFrames(file: File, count = 8): Promise<{ dataUrl: string; timestamp: number }[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const frames: { dataUrl: string; timestamp: number }[] = []

    video.preload = 'metadata'
    video.src = URL.createObjectURL(file)

    video.onloadedmetadata = () => {
      canvas.width = 320
      canvas.height = 180
      const duration = video.duration
      const interval = duration / count
      let captured = 0

      const captureFrame = (time: number) => { video.currentTime = time }

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, 320, 180)
        frames.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.7), timestamp: video.currentTime })
        captured++
        if (captured < count) {
          captureFrame(captured * interval)
        } else {
          URL.revokeObjectURL(video.src)
          resolve(frames)
        }
      }

      captureFrame(0)
    }
  })
}

function compositeScore(r: ScanResult) {
  return Math.round((r.content_score.engagement + r.content_score.brand_alignment + r.content_score.virality) / 3)
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
    bg: '#070706',
    panel: '#0e0d0b',
    border: '#2e2c29',
    gold: '#b08d57',
    text: '#f0ebe2',
    textDim: '#8a8780',
    textDimmer: '#52504c',
    font: "'DM Mono', monospace",
    green: '#3d6b4a',
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const videos = Array.from(incoming).filter(f => f.type.startsWith('video/'))
    if (!videos.length) { setError('Please select video files'); return }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      const merged = [...prev, ...videos.filter(f => !names.has(f.name))]
      if (merged.length > tierLimits.batchLimit) {
        setError(`Your plan allows ${tierLimits.batchLimit} clips per batch`)
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
    setProgressLabel(`Extracting frames from ${file.name}...`)
    setProgress(Math.round((index / total) * 100 + 5))

    const frames = await extractFrames(file, 8)

    setProgressLabel(`Analysing ${file.name} (${index + 1} of ${total})...`)
    setProgress(Math.round((index / total) * 100 + 30))

    const frameDescriptions = frames.map((f, i) => `Frame ${i + 1} at ${f.timestamp.toFixed(1)}s`).join(', ')

    const raw = await callClaude(
      'You are an expert video editor and social media strategist for electronic music artists like Bicep, Floating Points, fred again.., and Four Tet. You understand what content performs well in this space — raw, unpolished, observational. No corporate energy. Analyse video content and score it for engagement potential and brand alignment. Return ONLY valid JSON.',
      `Analyse this show video for social media content:
File: ${file.name}
Duration: approx ${frames[frames.length - 1]?.timestamp.toFixed(0)}s
Frames extracted at: ${frameDescriptions}

Based on typical show footage patterns and what performs well for electronic artists on social media, identify the best moments and score the content.

Return JSON:
{
  "best_moment": { "timestamp": number, "score": 95, "reason": "Peak crowd energy with strong lighting", "type": "crowd" },
  "moments": [
    { "timestamp": number, "score": number, "reason": "description", "type": "peak|crowd|lighting|transition" },
    { "timestamp": number, "score": number, "reason": "description", "type": "peak|crowd|lighting|transition" },
    { "timestamp": number, "score": number, "reason": "description", "type": "peak|crowd|lighting|transition" }
  ],
  "overall_energy": number 1-10,
  "best_clip_start": number,
  "best_clip_end": number,
  "caption_context": "one sentence describing what happened — for caption generation",
  "post_recommendation": "one sentence on why this is the best moment to post",
  "content_score": {
    "engagement": number 0-100,
    "brand_alignment": number 0-100,
    "virality": number 0-100,
    "reasoning": "one sentence explaining the scores"
  },
  "tags": ["venue name from filename if detectable", "photographer: [credit placeholder]"],
  "tone_match": "which reference artist (Bicep/Floating Points/fred again../Four Tet) this content aligns with most and why in one sentence",
  "platform_cuts": {
    "instagram": "0:00 – 0:30 (best crowd moment)",
    "tiktok": "0:15 – 0:45 (peak energy section)",
    "story": "0:00 – 0:15 (strong opening)"
  },
  "platform_ranking": [
    { "platform": "TikTok", "score": 92, "reason": "Raw crowd energy performs best here" },
    { "platform": "Instagram Reel", "score": 85, "reason": "Strong visual moment" },
    { "platform": "Instagram Story", "score": 78, "reason": "Good for day-after posting" }
  ]
}`,
      1500
    )

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
    window.location.href = '/broadcast?' + params.toString()
  }

  const typeColors: Record<string, string> = {
    peak: '#b08d57',
    crowd: '#3d6b4a',
    lighting: '#6a7a9a',
    transition: '#9a6a5a',
  }

  const activeScan = scans[selectedScan] || null

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '32px' }}>

      {/* HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          Signal Lab — Intelligent Media Scanner
        </div>
        <div style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.04em' }}>
          Media <span style={{ fontStyle: 'italic', color: s.gold, fontFamily: 'Georgia, serif' }}>scanner</span>
        </div>
        <div style={{ fontSize: '12px', color: s.textDim, marginTop: '8px', letterSpacing: '0.06em' }}>
          Upload multiple show clips — scanner ranks them and surfaces the strongest
        </div>
        {usageInfo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '14px', fontSize: '10px', color: s.textDimmer, letterSpacing: '0.1em' }}>
            <span>{usageInfo.used} / {usageInfo.monthlyLimit} scans used this month</span>
            {usageInfo.credits > 0 && <span style={{ color: s.gold }}>+{usageInfo.credits} credits</span>}
            <div style={{ flex: 1, maxWidth: '120px', height: '2px', background: s.border }}>
              <div style={{ height: '2px', background: usageInfo.remaining < 5 ? '#8a4a3a' : s.gold, width: `${Math.min(100, (usageInfo.used / usageInfo.monthlyLimit) * 100)}%`, transition: 'width 0.5s' }} />
            </div>
            <span style={{ color: usageInfo.remaining < 5 ? '#8a4a3a' : s.textDimmer }}>{usageInfo.remaining} remaining</span>
          </div>
        )}
      </div>

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
              accept="video/*"
              multiple
              onChange={e => addFiles(e.target.files)}
              style={{ display: 'none' }}
            />
            {files.length === 0 ? (
              <div>
                <div style={{ fontSize: '32px', color: s.textDimmer, marginBottom: '12px' }}>⬆</div>
                <div style={{ fontSize: '14px', color: s.textDim, marginBottom: '8px' }}>Drop show videos here</div>
                <div style={{ fontSize: '11px', color: s.textDimmer }}>MP4, MOV, AVI · Multiple files supported</div>
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
              {files.length > 1 ? `Scan all ${files.length} clips →` : 'Scan for best moments →'}
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
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Clip ranking</div>
              {scans.map((scan, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedScan(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px 0',
                    borderBottom: i < scans.length - 1 ? `1px solid ${s.border}` : 'none',
                    cursor: 'pointer',
                    opacity: selectedScan === i ? 1 : 0.55,
                    transition: 'opacity 0.15s',
                  }}>
                  <div style={{ fontSize: '20px', fontWeight: 300, color: i === 0 ? s.green : i === 1 ? s.gold : s.textDimmer, width: '36px', flexShrink: 0 }}>
                    {scan.composite}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '11px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
                      {i === 0 && <span style={{ color: s.green, marginRight: '6px' }}>★</span>}
                      {scan.file.name}
                    </div>
                    <div style={{ fontSize: '10px', color: s.textDimmer }}>
                      E:{scan.result.content_score.engagement} · B:{scan.result.content_score.brand_alignment} · V:{scan.result.content_score.virality}
                    </div>
                  </div>
                  <div style={{ height: '2px', width: '60px', background: '#1a1917', flexShrink: 0 }}>
                    <div style={{ height: '2px', background: i === 0 ? s.green : i === 1 ? s.gold : s.textDimmer, width: `${scan.composite}%` }} />
                  </div>
                </div>
              ))}
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
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px' }}>Content intelligence</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[
                  { label: 'Engagement', value: activeScan.result.content_score.engagement, desc: 'Save + share potential' },
                  { label: 'Brand fit', value: activeScan.result.content_score.brand_alignment, desc: 'Tone lane alignment' },
                  { label: 'Virality', value: activeScan.result.content_score.virality, desc: 'Organic reach' },
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
              <div style={{ fontSize: '12px', color: s.textDim, lineHeight: '1.7', fontStyle: 'italic', fontFamily: 'Georgia, serif', paddingTop: '16px', borderTop: `1px solid ${s.border}` }}>
                {activeScan.result.content_score.reasoning}
              </div>
            </div>

            {/* Best moment */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Best moment</div>
              <div style={{ fontSize: '28px', fontWeight: 300, color: s.gold, marginBottom: '6px' }}>{activeScan.result.best_moment.timestamp.toFixed(1)}s</div>
              <div style={{ fontSize: '12px', color: s.textDim, marginBottom: '12px', lineHeight: '1.6', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{activeScan.result.best_moment.reason}</div>
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
                  <div style={{ fontSize: '10px', color: s.textDimmer, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{moment.reason}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '11px', color: s.textDim, marginBottom: '14px', lineHeight: '1.6', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{activeScan.result.post_recommendation}</div>
              <div style={{ fontSize: '10px', color: s.textDimmer, marginBottom: '14px' }}>Caption context: <span style={{ color: s.textDim }}>{activeScan.result.caption_context}</span></div>
              <button onClick={useInBroadcast} style={{
                width: '100%',
                background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
                border: `1px solid ${s.gold}`,
                color: s.gold,
                fontFamily: s.font,
                fontSize: '10px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                padding: '14px',
                cursor: 'pointer',
              }}>
                Generate caption in Signal Lab →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
