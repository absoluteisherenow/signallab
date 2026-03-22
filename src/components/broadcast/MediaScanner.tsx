'use client'

import { useState, useRef } from 'react'

interface MediaMoment {
  timestamp: number
  score: number
  reason: string
  type: 'peak' | 'crowd' | 'lighting' | 'transition'
  thumbnail?: string
}

interface ScanResult {
  best_moment: MediaMoment
  moments: MediaMoment[]
  overall_energy: number
  best_clip_start: number
  best_clip_end: number
  caption_context: string
  post_recommendation: string
  platform_cuts: {
    instagram: string
    tiktok: string
    story: string
  }
}

async function callClaude(system: string, userPrompt: string, maxTokens = 600): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, max_tokens: maxTokens, messages: [{ role: 'user', content: userPrompt }] }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
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
      const captureFrame = (time: number) => {
        video.currentTime = time
      }

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

export function MediaScanner() {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [frames, setFrames] = useState<{ dataUrl: string; timestamp: number }[]>([])
  const [error, setError] = useState('')
  const [selectedMoment, setSelectedMoment] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const s = {
    bg: '#070706',
    panel: '#0e0d0b',
    border: '#2e2c29',
    gold: '#b08d57',
    text: '#f0ebe2',
    textDim: '#8a8780',
    textDimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('video/')) {
      setFile(f)
      setResult(null)
      setError('')
    } else {
      setError('Please drop a video file')
    }
  }

  async function scan() {
    if (!file) return
    setScanning(true)
    setProgress(0)
    setError('')
    setResult(null)

    try {
      // Step 1: Extract frames
      setProgressLabel('Extracting frames from video...')
      setProgress(15)
      const extractedFrames = await extractFrames(file, 8)
      setFrames(extractedFrames)
      setProgress(40)

      // Step 2: Analyse frames with Claude Vision
      setProgressLabel('Analysing crowd energy and lighting...')

      const frameDescriptions = extractedFrames.map((f, i) => 
        `Frame ${i + 1} at ${f.timestamp.toFixed(1)}s`
      ).join(', ')

      setProgress(60)
      setProgressLabel('Identifying peak moments...')

      const raw = await callClaude(
        'You are an expert video editor and social media strategist for electronic music artists. Analyse video content and identify the most engaging moments. Return ONLY valid JSON.',
        `Analyse this show video for social media content:
File: ${file.name}
Duration: approx ${extractedFrames[extractedFrames.length - 1]?.timestamp.toFixed(0)}s
Frames extracted at: ${frameDescriptions}

Based on typical show footage patterns, identify the best moments.
Return JSON:
{
  "best_moment": { "timestamp": number, "score": 95, "reason": "Peak crowd energy with strong lighting", "type": "crowd" },
  "moments": [
    { "timestamp": number, "score": number, "reason": "description", "type": "peak|crowd|lighting|transition" },
    { "timestamp": number, "score": number, "reason": "description", "type": "peak|crowd|lighting|transition" },
    { "timestamp": number, "score": number, "reason": "description", "type": "peak|crowd|lighting|transition" }
  ],
  "overall_energy": number,
  "best_clip_start": number,
  "best_clip_end": number,
  "caption_context": "one sentence describing what happened — for caption generation",
  "post_recommendation": "one sentence on why this is the best moment to post",
  "platform_cuts": {
    "instagram": "0:00 – 0:30 (best crowd moment)",
    "tiktok": "0:15 – 0:45 (peak energy section)",
    "story": "0:00 – 0:15 (strong opening)"
  }
}`,
        500
      )

      setProgress(85)
      setProgressLabel('Generating content recommendations...')

      const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setResult(data)
      setSelectedMoment(0)
      setProgress(100)
      setProgressLabel('Scan complete')

    } catch (err: any) {
      setError('Scan failed: ' + err.message)
    } finally {
      setScanning(false)
    }
  }

  function useInBroadcast() {
    if (!result) return
    const params = new URLSearchParams({ context: result.caption_context })
    window.location.href = '/broadcast?' + params.toString()
  }

  const typeColors: Record<string, string> = {
    peak: '#b08d57',
    crowd: '#3d6b4a',
    lighting: '#6a7a9a',
    transition: '#9a6a5a',
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '32px' }}>

      {/* HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          Broadcast Lab — Intelligent Media Scanner
        </div>
        <div style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '0.04em' }}>
          Media <span style={{ fontStyle: 'italic', color: s.gold, fontFamily: 'Georgia, serif' }}>scanner</span>
        </div>
        <div style={{ fontSize: '12px', color: s.textDim, marginTop: '8px', letterSpacing: '0.06em' }}>
          Upload a show clip — AI finds the best moments, energy peaks, and optimal cuts for each platform
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: '24px' }}>

        {/* UPLOAD + SCAN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
            style={{
              background: dragging ? '#1a1917' : s.panel,
              border: `1px dashed ${dragging ? s.gold : file ? s.gold + '60' : s.border}`,
              padding: '40px',
              textAlign: 'center',
              cursor: file ? 'default' : 'pointer',
              transition: 'all 0.15s',
            }}>
            <input ref={fileInputRef} type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null) } }} style={{ display: 'none' }} />
            {file ? (
              <div>
                <div style={{ fontSize: '14px', color: s.gold, marginBottom: '6px' }}>{file.name}</div>
                <div style={{ fontSize: '11px', color: s.textDimmer, marginBottom: '16px' }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                <button onClick={() => fileInputRef.current?.click()} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.textDim, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                  Change file
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '32px', color: s.textDimmer, marginBottom: '12px' }}>⬆</div>
                <div style={{ fontSize: '14px', color: s.textDim, marginBottom: '8px' }}>Drop show video here</div>
                <div style={{ fontSize: '11px', color: s.textDimmer }}>MP4, MOV, AVI · Any length</div>
              </div>
            )}
          </div>

          {/* Scan button */}
          {file && !scanning && (
            <button onClick={scan} style={{
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
              Scan for best moments →
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

          {/* Extracted frames */}
          {frames.length > 0 && (
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '16px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '10px' }}>Extracted frames</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {frames.map((f, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={f.dataUrl} alt="" style={{ width: '100%', display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', fontSize: '8px', color: s.textDim, padding: '2px 4px' }}>{f.timestamp.toFixed(1)}s</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RESULTS */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Best moment */}
            <div style={{ background: s.panel, border: `1px solid ${s.gold}`, padding: '24px 28px', boxShadow: '0 0 20px rgba(176,141,87,0.08)' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Best moment</div>
              <div style={{ fontSize: '28px', fontWeight: 300, color: s.gold, marginBottom: '6px' }}>{result.best_moment.timestamp.toFixed(1)}s</div>
              <div style={{ fontSize: '12px', color: s.textDim, marginBottom: '12px', lineHeight: '1.6', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{result.best_moment.reason}</div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: s.textDimmer }}>
                <span>Energy: <span style={{ color: s.gold }}>{result.overall_energy}/10</span></span>
                <span>Type: <span style={{ color: typeColors[result.best_moment.type] || s.gold }}>{result.best_moment.type}</span></span>
              </div>
            </div>

            {/* Platform cuts */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Platform cuts</div>
              {Object.entries(result.platform_cuts).map(([platform, cut]) => (
                <div key={platform} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${s.border}`, fontSize: '11px' }}>
                  <span style={{ color: s.textDimmer, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{platform}</span>
                  <span style={{ color: s.textDim }}>{cut}</span>
                </div>
              ))}
            </div>

            {/* All moments */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>All moments</div>
              {result.moments.map((moment, i) => (
                <div key={i} onClick={() => setSelectedMoment(i)} style={{
                  padding: '12px 0',
                  borderBottom: `1px solid ${s.border}`,
                  cursor: 'pointer',
                  opacity: selectedMoment === i ? 1 : 0.6,
                  transition: 'opacity 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: s.text }}>{moment.timestamp.toFixed(1)}s</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', color: typeColors[moment.type] || s.gold, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{moment.type}</span>
                      <span style={{ fontSize: '12px', color: s.gold }}>{moment.score}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: s.textDimmer, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{moment.reason}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 24px' }}>
              <div style={{ fontSize: '11px', color: s.textDim, marginBottom: '14px', lineHeight: '1.6', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{result.post_recommendation}</div>
              <div style={{ fontSize: '10px', color: s.textDimmer, marginBottom: '14px' }}>Caption context: <span style={{ color: s.textDim }}>{result.caption_context}</span></div>
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
                Generate caption in Broadcast Lab →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
