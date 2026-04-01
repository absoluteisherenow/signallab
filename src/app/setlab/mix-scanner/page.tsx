'use client'

import { useState, useRef, useCallback } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'

// ── Types ────────────────────────────────────────────────────────────────────

interface TransitionPoint {
  time_seconds: number
  energy_before: number
  energy_after: number
  energy_dip: number
}

interface TrackAnalysis {
  position: number
  title: string
  artist: string
  estimated_time: string
  mix_quality: string
  issue: string | null
  fix: string | null
}

interface MixScanResult {
  overall_score: number
  grade: string
  headline: string
  summary: string
  data_quality: string
  structure_analysis: string
  technical_assessment: string
  transition_quality: string
  transition_notes: string
  energy_arc: string
  tracks: TrackAnalysis[]
  strengths: string[]
  improvements: string[]
  key_moments: { time: string; description: string }[]
  overall_verdict: string
}

type SetContext = 'club' | 'festival' | 'warm-up' | 'peak-time' | 'closing' | ''

// ── Audio Analysis (client-side) ─────────────────────────────────────────────

function computeRMSEnergyCurve(audioBuffer: AudioBuffer, windowSec: number = 1): number[] {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const windowSize = Math.floor(sampleRate * windowSec)
  const numWindows = Math.floor(channelData.length / windowSize)
  const curve: number[] = []

  for (let i = 0; i < numWindows; i++) {
    let sum = 0
    const start = i * windowSize
    const end = start + windowSize
    for (let j = start; j < end; j++) {
      sum += channelData[j] * channelData[j]
    }
    curve.push(Math.sqrt(sum / windowSize))
  }

  return curve
}

function detectTransitions(energyCurve: number[], windowSec: number = 1): TransitionPoint[] {
  const transitions: TransitionPoint[] = []
  if (energyCurve.length < 5) return transitions

  // Compute local average energy for normalization
  const avgEnergy = energyCurve.reduce((a, b) => a + b, 0) / energyCurve.length
  if (avgEnergy === 0) return transitions

  // Normalize
  const normalized = energyCurve.map(e => e / (avgEnergy * 2))

  // Look for significant dips (energy drops by >15% of local context)
  const contextWindow = 8 // look 8 seconds before/after
  for (let i = contextWindow; i < normalized.length - contextWindow; i++) {
    const before = normalized.slice(i - contextWindow, i)
    const after = normalized.slice(i + 1, i + 1 + contextWindow)
    const avgBefore = before.reduce((a, b) => a + b, 0) / before.length
    const avgAfter = after.reduce((a, b) => a + b, 0) / after.length
    const current = normalized[i]

    const dipFromBefore = avgBefore - current
    const dipFromAfter = avgAfter - current

    if (dipFromBefore > 0.08 && dipFromAfter > 0.05) {
      // Check we're not too close to previous transition
      const lastTransition = transitions[transitions.length - 1]
      if (!lastTransition || (i * windowSec - lastTransition.time_seconds) > 30) {
        transitions.push({
          time_seconds: i * windowSec,
          energy_before: Math.min(1, avgBefore),
          energy_after: Math.min(1, avgAfter),
          energy_dip: Math.min(1, Math.max(dipFromBefore, dipFromAfter)),
        })
      }
    }
  }

  return transitions
}

function estimateBPM(audioBuffer: AudioBuffer): number | null {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate

  // Take 30s from middle of track
  const analysisLength = Math.min(sampleRate * 30, channelData.length)
  const startOffset = Math.max(0, Math.floor((channelData.length - analysisLength) / 2))
  const samples = channelData.slice(startOffset, startOffset + analysisLength)

  // Low-pass filter for kick detection
  const rc = 1.0 / (2.0 * Math.PI * 200)
  const dt = 1.0 / sampleRate
  const alpha = dt / (rc + dt)
  const filtered = new Float32Array(samples.length)
  filtered[0] = samples[0]
  for (let i = 1; i < samples.length; i++) {
    filtered[i] = filtered[i - 1] + alpha * (samples[i] - filtered[i - 1])
  }

  // Energy envelope
  const hopSize = Math.floor(sampleRate / 100)
  const numFrames = Math.floor(filtered.length / hopSize)
  const envelope = new Float32Array(numFrames)
  for (let i = 0; i < numFrames; i++) {
    let sum = 0
    const start = i * hopSize
    const end = Math.min(start + hopSize, filtered.length)
    for (let j = start; j < end; j++) sum += filtered[j] * filtered[j]
    envelope[i] = Math.sqrt(sum / (end - start))
  }

  // Onset detection
  const onsets = new Float32Array(envelope.length)
  for (let i = 1; i < envelope.length; i++) {
    onsets[i] = Math.max(0, envelope[i] - envelope[i - 1])
  }

  // Autocorrelation BPM
  const frameRate = sampleRate / hopSize
  const minLag = Math.floor((60 / 180) * frameRate)
  const maxLag = Math.ceil((60 / 60) * frameRate)

  let bestLag = minLag
  let bestCorr = -Infinity

  for (let lag = minLag; lag <= maxLag && lag < onsets.length; lag++) {
    let corr = 0
    let count = 0
    for (let i = 0; i < onsets.length - lag; i++) {
      corr += onsets[i] * onsets[i + lag]
      count++
    }
    if (count > 0) {
      corr /= count
      if (corr > bestCorr) {
        bestCorr = corr
        bestLag = lag
      }
    }
  }

  let bpm = Math.round((60 * frameRate) / bestLag)
  if (bpm < 70) bpm *= 2
  if (bpm > 170) bpm = Math.round(bpm / 2)

  return bpm || null
}

// ── Grade helpers ────────────────────────────────────────────────────────────

function scoreToGrade(score: number): string {
  if (score >= 9.5) return 'A+'
  if (score >= 9) return 'A'
  if (score >= 8.5) return 'A-'
  if (score >= 8) return 'B+'
  if (score >= 7) return 'B'
  if (score >= 6) return 'B-'
  if (score >= 5) return 'C+'
  if (score >= 4) return 'C'
  if (score >= 3) return 'D'
  return 'F'
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'var(--gold-bright)'
  if (grade.startsWith('B')) return 'var(--green)'
  if (grade.startsWith('C')) return 'var(--amber)'
  return 'var(--accent-red)'
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MixScannerPage() {
  const [file, setFile] = useState<File | null>(null)
  const [tracklist, setTracklist] = useState('')
  const [context, setContext] = useState<SetContext>('')
  const [phase, setPhase] = useState<'idle' | 'decoding' | 'analysing' | 'scanning' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<MixScanResult | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped && /\.(mp3|wav|flac|aac|m4a|ogg|aiff?)$/i.test(dropped.name)) {
      setFile(dropped)
      setResult(null)
      setError('')
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setResult(null)
      setError('')
    }
  }, [])

  const runScan = async () => {
    if (!file) return

    setPhase('decoding')
    setProgress('Decoding audio file...')
    setResult(null)
    setError('')

    try {
      // Step 1: Decode audio
      const arrayBuffer = await file.arrayBuffer()
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      setPhase('analysing')
      setProgress('Analysing energy curve and transitions...')

      // Step 2: Client-side analysis
      // Use setTimeout to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 50))

      const energyCurve = computeRMSEnergyCurve(audioBuffer, 1)
      const transitions = detectTransitions(energyCurve, 1)

      setProgress('Estimating BPM...')
      await new Promise(resolve => setTimeout(resolve, 50))

      const bpm = estimateBPM(audioBuffer)

      const avgEnergy = energyCurve.length > 0
        ? energyCurve.reduce((a, b) => a + b, 0) / energyCurve.length
        : 0
      const peakEnergy = energyCurve.length > 0
        ? Math.max(...energyCurve)
        : 0

      // Normalize energy values
      const maxPossible = peakEnergy || 1
      const normalizedAvg = avgEnergy / maxPossible
      const normalizedPeak = 1

      audioContext.close()

      // Step 3: Send to Claude API
      setPhase('scanning')
      setProgress('Claude is reviewing your mix...')

      const contextStr = context
        ? `${context} set`
        : undefined

      const res = await fetch('/api/mix-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          duration_seconds: audioBuffer.duration,
          avg_energy: normalizedAvg,
          peak_energy: normalizedPeak,
          transition_points: transitions,
          bpm_estimate: bpm,
          tracklist: tracklist.trim() || undefined,
          context: contextStr,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `API error ${res.status}`)
      }

      const data = await res.json()
      setResult(data.result)
      setPhase('done')
      setProgress('')

    } catch (err: any) {
      setPhase('error')
      setError(err.message || 'Analysis failed')
      setProgress('')
    }
  }

  const contextOptions: { value: SetContext; label: string }[] = [
    { value: '', label: 'Not specified' },
    { value: 'club', label: 'Club set' },
    { value: 'festival', label: 'Festival set' },
    { value: 'warm-up', label: 'Warm-up' },
    { value: 'peak-time', label: 'Peak-time' },
    { value: 'closing', label: 'Closing set' },
  ]

  const isProcessing = phase === 'decoding' || phase === 'analysing' || phase === 'scanning'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PageHeader
        breadcrumb={[
          { label: 'Set Lab', href: '/setlab' },
          { label: 'Mix Scanner' },
        ]}
        section="SET LAB"
        sectionColor="var(--red-brown)"
        title="Mix Scanner"
        subtitle="Upload a recorded DJ mix for AI-powered analysis. Get scored on structure, transitions, energy arc, and track selection."
      />

      <div style={{ padding: '48px', maxWidth: '960px' }}>

        {/* ── Upload Zone ─────────────────────────────────────────── */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `1px dashed ${file ? 'var(--gold-dim)' : 'var(--border)'}`,
            borderRadius: '2px',
            padding: '48px',
            textAlign: 'center',
            cursor: 'pointer',
            background: file ? 'rgba(176, 141, 87, 0.03)' : 'transparent',
            transition: 'all 0.2s',
            marginBottom: '32px',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.flac,.aac,.m4a,.ogg,.aiff"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          {file ? (
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                color: 'var(--gold)',
                marginBottom: '8px',
              }}>
                {file.name}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-dimmer)',
                letterSpacing: '0.1em',
              }}>
                {(file.size / (1024 * 1024)).toFixed(1)} MB — click to change
              </div>
            </div>
          ) : (
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                color: 'var(--text-dim)',
                marginBottom: '8px',
              }}>
                Drop an audio file here or click to browse
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-dimmest)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
              }}>
                MP3, WAV, FLAC, AAC, M4A, OGG, AIFF
              </div>
            </div>
          )}
        </div>

        {/* ── Context + Tracklist ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>

          {/* Context */}
          <div>
            <label style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'var(--text-dimmer)',
              display: 'block',
              marginBottom: '8px',
            }}>
              Set context
            </label>
            <select
              value={context}
              onChange={e => setContext(e.target.value as SetContext)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border-dim)',
                padding: '12px 16px',
                width: '100%',
                cursor: 'pointer',
                appearance: 'none',
              }}
            >
              {contextOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Spacer for alignment */}
          <div />
        </div>

        {/* Tracklist */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'var(--text-dimmer)',
            display: 'block',
            marginBottom: '8px',
          }}>
            Tracklist (optional — one track per line)
          </label>
          <textarea
            value={tracklist}
            onChange={e => setTracklist(e.target.value)}
            placeholder={'1. Artist - Track Name\n2. Artist - Track Name\n3. Artist - Track Name'}
            rows={6}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              background: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--border-dim)',
              padding: '16px',
              width: '100%',
              resize: 'vertical',
              lineHeight: 1.8,
            }}
          />
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-dimmest)',
            marginTop: '6px',
          }}>
            Adding a tracklist enables deeper analysis — track curation, key compatibility, narrative arc
          </div>
        </div>

        {/* ── Scan Button ─────────────────────────────────────────── */}
        <button
          onClick={runScan}
          disabled={!file || isProcessing}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            background: (!file || isProcessing) ? 'var(--border-dim)' : 'var(--gold-dim)',
            color: (!file || isProcessing) ? 'var(--text-dimmest)' : 'var(--text)',
            border: 'none',
            padding: '16px 48px',
            cursor: (!file || isProcessing) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            width: '100%',
            marginBottom: '48px',
          }}
          onMouseEnter={e => {
            if (file && !isProcessing) {
              e.currentTarget.style.background = 'var(--gold)'
              e.currentTarget.style.color = 'var(--bg)'
            }
          }}
          onMouseLeave={e => {
            if (file && !isProcessing) {
              e.currentTarget.style.background = 'var(--gold-dim)'
              e.currentTarget.style.color = 'var(--text)'
            }
          }}
        >
          {isProcessing ? 'Scanning...' : 'Scan Mix'}
        </button>

        {/* ── Loading State ───────────────────────────────────────── */}
        {isProcessing && (
          <div style={{
            textAlign: 'center',
            padding: '48px 0',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '2px solid var(--border-dim)',
              borderTop: '2px solid var(--gold)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 24px',
            }} />
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-dim)',
              letterSpacing: '0.1em',
            }}>
              {progress}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-dimmest)',
              marginTop: '8px',
            }}>
              {phase === 'decoding' && 'Decoding audio waveform...'}
              {phase === 'analysing' && 'Extracting energy curve, transitions, BPM...'}
              {phase === 'scanning' && 'This usually takes 10-20 seconds'}
            </div>
          </div>
        )}

        {/* ── Error State ─────────────────────────────────────────── */}
        {phase === 'error' && (
          <div style={{
            background: 'rgba(138, 74, 58, 0.1)',
            border: '1px solid var(--accent-red)',
            padding: '24px',
            marginBottom: '32px',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--accent-red)',
              marginBottom: '8px',
            }}>
              Scan failed
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--text-dim)',
            }}>
              {error}
            </div>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────── */}
        {result && phase === 'done' && (
          <div style={{ animation: 'fadeIn 0.4s ease' }}>

            {/* Score Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '48px',
              alignItems: 'center',
              padding: '48px',
              background: 'var(--panel)',
              border: '1px solid var(--border-dim)',
              marginBottom: '32px',
            }}>
              {/* Big Score */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '72px',
                  fontWeight: 300,
                  color: gradeColor(result.grade || scoreToGrade(result.overall_score)),
                  lineHeight: 1,
                }}>
                  {result.overall_score.toFixed(1)}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '24px',
                  fontWeight: 500,
                  color: gradeColor(result.grade || scoreToGrade(result.overall_score)),
                  marginTop: '8px',
                  letterSpacing: '0.1em',
                }}>
                  {result.grade || scoreToGrade(result.overall_score)}
                </div>
              </div>

              {/* Headline + Summary */}
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '16px',
                  color: 'var(--text)',
                  marginBottom: '12px',
                  lineHeight: 1.5,
                }}>
                  {result.headline}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--text-dim)',
                  lineHeight: 1.7,
                }}>
                  {result.summary}
                </div>
              </div>
            </div>

            {/* Analysis Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              marginBottom: '32px',
            }}>
              {/* Structure */}
              <AnalysisCard title="Structure Analysis" content={result.structure_analysis} />

              {/* Technical */}
              <AnalysisCard title="Technical Assessment" content={result.technical_assessment} />

              {/* Transitions */}
              <AnalysisCard
                title="Transition Quality"
                content={result.transition_notes}
                badge={result.transition_quality}
                badgeColor={
                  result.transition_quality === 'excellent' ? 'var(--gold-bright)' :
                  result.transition_quality === 'good' ? 'var(--green)' :
                  result.transition_quality === 'average' ? 'var(--amber)' : 'var(--accent-red)'
                }
              />

              {/* Energy Arc */}
              <AnalysisCard title="Energy Arc" content={result.energy_arc} />
            </div>

            {/* Strengths + Improvements */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              marginBottom: '32px',
            }}>
              {/* Strengths */}
              <div style={{
                background: 'var(--panel)',
                border: '1px solid var(--border-dim)',
                padding: '32px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  color: 'var(--green)',
                  marginBottom: '20px',
                }}>
                  Strengths
                </div>
                {(result.strengths || []).map((s, i) => (
                  <div key={i} style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--text-dim)',
                    lineHeight: 1.7,
                    paddingLeft: '16px',
                    position: 'relative',
                    marginBottom: '10px',
                  }}>
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      color: 'var(--green)',
                    }}>+</span>
                    {s}
                  </div>
                ))}
              </div>

              {/* Improvements */}
              <div style={{
                background: 'var(--panel)',
                border: '1px solid var(--border-dim)',
                padding: '32px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  color: 'var(--amber)',
                  marginBottom: '20px',
                }}>
                  Improvements
                </div>
                {(result.improvements || []).map((s, i) => (
                  <div key={i} style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--text-dim)',
                    lineHeight: 1.7,
                    paddingLeft: '16px',
                    position: 'relative',
                    marginBottom: '10px',
                  }}>
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      color: 'var(--amber)',
                    }}>-</span>
                    {s}
                  </div>
                ))}
              </div>
            </div>

            {/* Key Moments */}
            {result.key_moments && result.key_moments.length > 0 && (
              <div style={{
                background: 'var(--panel)',
                border: '1px solid var(--border-dim)',
                padding: '32px',
                marginBottom: '32px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  color: 'var(--gold)',
                  marginBottom: '20px',
                }}>
                  Key Moments
                </div>
                {result.key_moments.map((m, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    gap: '16px',
                    marginBottom: '12px',
                    alignItems: 'baseline',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--gold)',
                      minWidth: '60px',
                      flexShrink: 0,
                    }}>
                      {m.time || `T${i + 1}`}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      color: 'var(--text-dim)',
                      lineHeight: 1.6,
                    }}>
                      {m.description}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Track Breakdown (if tracklist provided) */}
            {result.tracks && result.tracks.length > 0 && (
              <div style={{
                background: 'var(--panel)',
                border: '1px solid var(--border-dim)',
                padding: '32px',
                marginBottom: '32px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  color: 'var(--gold)',
                  marginBottom: '24px',
                }}>
                  Track Breakdown
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {result.tracks.map((track, i) => (
                    <div key={i} style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr auto',
                      gap: '16px',
                      padding: '14px 16px',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      alignItems: 'start',
                    }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--text-dimmest)',
                      }}>
                        {String(track.position || i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          color: 'var(--text)',
                        }}>
                          {track.artist && <span style={{ color: 'var(--text-dim)' }}>{track.artist} — </span>}
                          {track.title}
                        </div>
                        {track.issue && (
                          <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            color: 'var(--accent-red)',
                            marginTop: '4px',
                          }}>
                            {track.issue}
                          </div>
                        )}
                        {track.fix && (
                          <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            color: 'var(--green)',
                            marginTop: '2px',
                          }}>
                            Fix: {track.fix}
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color:
                          track.mix_quality === 'smooth' ? 'var(--green)' :
                          track.mix_quality === 'rough' ? 'var(--accent-red)' : 'var(--text-dimmest)',
                        padding: '2px 8px',
                        border: `1px solid ${
                          track.mix_quality === 'smooth' ? 'var(--green)' :
                          track.mix_quality === 'rough' ? 'var(--accent-red)' : 'var(--border-dim)'
                        }`,
                      }}>
                        {track.mix_quality || 'n/a'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overall Verdict */}
            {result.overall_verdict && (
              <div style={{
                borderTop: '1px solid var(--border-dim)',
                paddingTop: '32px',
                marginBottom: '64px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  color: 'var(--text-dimmer)',
                  marginBottom: '16px',
                }}>
                  Verdict
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--text-dim)',
                  lineHeight: 1.8,
                  maxWidth: '720px',
                }}>
                  {result.overall_verdict}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function AnalysisCard({
  title,
  content,
  badge,
  badgeColor,
}: {
  title: string
  content: string
  badge?: string
  badgeColor?: string
}) {
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border-dim)',
      padding: '32px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--text-dimmer)',
        }}>
          {title}
        </div>
        {badge && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: badgeColor || 'var(--text-dim)',
            padding: '3px 10px',
            border: `1px solid ${badgeColor || 'var(--border)'}`,
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: 'var(--text-dim)',
        lineHeight: 1.8,
      }}>
        {content}
      </div>
    </div>
  )
}
