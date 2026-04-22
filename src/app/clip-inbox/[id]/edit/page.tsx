'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'

type Overlay = { text: string; start: number; end: number; y_pct: number }

interface Clip {
  id: string
  source_url: string
  title: string | null
  duration_seconds: number | null
}

interface Analysis {
  duration_seconds: number | null
  rms_peaks: { t: number; db: number }[]
  shot_changes: number[]
  speech_segments: { t_start: number; t_end: number; text: string }[]
  suggested_cuts: { in: number; out: number; reason: string }[]
}

interface Job {
  id: string
  kind: 'analyse' | 'render'
  status: 'queued' | 'running' | 'done' | 'failed'
  output_url: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export default function EditorPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id as string
  const videoRef = useRef<HTMLVideoElement>(null)
  const [clip, setClip] = useState<Clip | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [trimIn, setTrimIn] = useState(0)
  const [trimOut, setTrimOut] = useState(0)
  const [overlays, setOverlays] = useState<Overlay[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const r = await fetch(`/api/clip-inbox/${id}/analysis`)
    const d = await r.json()
    if (d.clip) setClip(d.clip)
    if (d.analysis) setAnalysis(d.analysis)
    if (d.jobs) setJobs(d.jobs)
  }, [id])

  useEffect(() => { load() }, [load])

  // Poll jobs every 5s if any are queued/running.
  useEffect(() => {
    const active = jobs.some(j => j.status === 'queued' || j.status === 'running')
    if (!active) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [jobs, load])

  function onLoadedMetadata() {
    const d = videoRef.current?.duration || 0
    setDuration(d)
    if (trimOut === 0) setTrimOut(d)
  }

  function onTimeUpdate() {
    setCurrentTime(videoRef.current?.currentTime || 0)
  }

  function seek(t: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, t))
    }
  }

  function setInAtCurrent() { setTrimIn(currentTime) }
  function setOutAtCurrent() { setTrimOut(currentTime) }

  function applySuggestion(s: { in: number; out: number }) {
    setTrimIn(s.in)
    setTrimOut(s.out)
    seek(s.in)
  }

  function addOverlay() {
    setOverlays(prev => [
      ...prev,
      { text: '', start: 0, end: Math.max(0.1, trimOut - trimIn), y_pct: 0.8 },
    ])
  }

  function updateOverlay(idx: number, patch: Partial<Overlay>) {
    setOverlays(prev => prev.map((o, i) => i === idx ? { ...o, ...patch } : o))
  }

  function removeOverlay(idx: number) {
    setOverlays(prev => prev.filter((_, i) => i !== idx))
  }

  async function enqueueAnalyse() {
    setBusy('analyse')
    const r = await fetch(`/api/clip-inbox/${id}/analyse`, { method: 'POST' })
    const d = await r.json()
    setBanner(d.reused ? 'Analysis already in queue.' : 'Analysis queued.')
    setBusy(null)
    load()
    setTimeout(() => setBanner(null), 3000)
  }

  async function enqueueRender() {
    if (!(trimOut > trimIn)) { setBanner('Set trim in < out first.'); return }
    setBusy('render')
    const r = await fetch(`/api/clip-inbox/${id}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trim_in: trimIn, trim_out: trimOut, text_overlays: overlays }),
    })
    const d = await r.json()
    setBanner(d.error ? `Error: ${d.error}` : 'Render queued.')
    setBusy(null)
    load()
    setTimeout(() => setBanner(null), 3000)
  }

  if (!clip) {
    return <div style={{ padding: 48, color: 'var(--text-dimmer)' }}>Loading…</div>
  }

  const latestRender = jobs.find(j => j.kind === 'render' && j.status === 'done' && j.output_url)
  const activeJob = jobs.find(j => j.status === 'queued' || j.status === 'running')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PageHeader
        breadcrumb={[{ label: 'Clip Inbox', href: '/clip-inbox' }, { label: 'Edit' }]}
        section="CONTENT"
        title={clip.title || 'Untitled clip'}
        subtitle="Trim, add text, render. Mac Mini does the heavy lift."
      />

      <div style={{ padding: '24px 48px 64px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>
        {/* Left: player + timeline + overlays */}
        <div>
          <video
            ref={videoRef}
            src={clip.source_url}
            controls
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            style={{ width: '100%', background: '#000', display: 'block' }}
          />
          <Timeline
            duration={duration}
            currentTime={currentTime}
            trimIn={trimIn}
            trimOut={trimOut}
            analysis={analysis}
            onSeek={seek}
            onSetIn={setTrimIn}
            onSetOut={setTrimOut}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Btn onClick={setInAtCurrent}>Set IN @ {fmt(currentTime)}</Btn>
            <Btn onClick={setOutAtCurrent}>Set OUT @ {fmt(currentTime)}</Btn>
            <span style={{ fontSize: 11, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>
              IN {fmt(trimIn)} / OUT {fmt(trimOut)} / LEN {fmt(Math.max(0, trimOut - trimIn))}
            </span>
          </div>

          {/* Overlays */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Label>Text overlays</Label>
              <Btn onClick={addOverlay} disabled={overlays.length >= 4}>Add</Btn>
            </div>
            {overlays.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-dimmest)' }}>None. Optional.</div>
            ) : overlays.map((o, i) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 70px 70px 60px 60px',
                gap: 6,
                marginBottom: 6,
              }}>
                <input value={o.text} onChange={e => updateOverlay(i, { text: e.target.value })} placeholder="Text" style={inputStyle} />
                <input type="number" step="0.1" value={o.start} onChange={e => updateOverlay(i, { start: Number(e.target.value) })} placeholder="start" style={inputStyle} />
                <input type="number" step="0.1" value={o.end} onChange={e => updateOverlay(i, { end: Number(e.target.value) })} placeholder="end" style={inputStyle} />
                <input type="number" step="0.05" min="0.05" max="0.95" value={o.y_pct} onChange={e => updateOverlay(i, { y_pct: Number(e.target.value) })} placeholder="y" style={inputStyle} />
                <Btn onClick={() => removeOverlay(i)} danger>Del</Btn>
              </div>
            ))}
          </div>
        </div>

        {/* Right: actions + analysis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel title="Render">
            <Btn onClick={enqueueRender} disabled={busy !== null || !(trimOut > trimIn)} primary>
              {busy === 'render' ? 'Queuing…' : 'Queue render'}
            </Btn>
            {activeJob && (
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                {activeJob.kind} · {activeJob.status}
              </div>
            )}
            {latestRender && (
              <div style={{ marginTop: 12 }}>
                <Label>Latest output</Label>
                <a href={latestRender.output_url!} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontSize: 12 }}>Open MP4</a>
              </div>
            )}
            {banner && <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 8 }}>{banner}</div>}
          </Panel>

          <Panel title="Auto-suggest markers">
            {analysis ? (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                  {analysis.rms_peaks.length} peaks · {analysis.shot_changes.length} cuts · {analysis.speech_segments.length} speech
                </div>
                {analysis.suggested_cuts.length > 0 ? (
                  analysis.suggested_cuts.map((s, i) => (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <Btn onClick={() => applySuggestion(s)}>
                        {fmt(s.in)} → {fmt(s.out)}
                      </Btn>
                      <div style={{ fontSize: 10, color: 'var(--text-dimmest)', marginTop: 2 }}>{s.reason}</div>
                    </div>
                  ))
                ) : <div style={{ fontSize: 11, color: 'var(--text-dimmest)' }}>No suggestions yet.</div>}
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 8 }}>
                  Run audio + shot analysis on Mac Mini to get suggested cuts.
                </div>
                <Btn onClick={enqueueAnalyse} disabled={busy !== null}>
                  {busy === 'analyse' ? 'Queuing…' : 'Analyse clip'}
                </Btn>
              </>
            )}
          </Panel>

          <Panel title="Jobs">
            {jobs.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-dimmest)' }}>None.</div>
            ) : jobs.slice(0, 5).map(j => (
              <div key={j.id} style={{ fontSize: 11, color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                {j.kind} · {j.status}{j.error ? ` · ${j.error.slice(0, 60)}` : ''}
              </div>
            ))}
          </Panel>

          <Link href="/clip-inbox" style={{ fontSize: 11, color: 'var(--text-dimmer)', textDecoration: 'none' }}>← Back to inbox</Link>
        </div>
      </div>
    </div>
  )
}

function Timeline({
  duration, currentTime, trimIn, trimOut, analysis, onSeek,
}: {
  duration: number
  currentTime: number
  trimIn: number
  trimOut: number
  analysis: Analysis | null
  onSeek: (t: number) => void
  onSetIn: (t: number) => void
  onSetOut: (t: number) => void
}) {
  if (!duration) return <div style={{ height: 60, marginTop: 12, border: '1px solid var(--border-dim)' }} />

  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`

  function onBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    onSeek((x / rect.width) * duration)
  }

  return (
    <div style={{ marginTop: 12, position: 'relative' }}>
      <div
        onClick={onBarClick}
        style={{
          height: 60,
          background: 'var(--bg-raised)',
          border: '1px solid var(--border-dim)',
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        {/* Trim range */}
        <div style={{
          position: 'absolute',
          left: pct(trimIn),
          width: `${((trimOut - trimIn) / duration) * 100}%`,
          top: 0, bottom: 0,
          background: 'rgba(212,175,55,0.15)',
          borderLeft: '2px solid var(--gold)',
          borderRight: '2px solid var(--gold)',
        }} />
        {/* Shot-change markers */}
        {analysis?.shot_changes.map((t, i) => (
          <div key={`c${i}`} style={{ position: 'absolute', left: pct(t), top: 0, bottom: 0, width: 1, background: '#7aa' }} title={`cut @ ${fmt(t)}`} />
        ))}
        {/* RMS peaks */}
        {analysis?.rms_peaks.map((p, i) => (
          <div key={`p${i}`} style={{ position: 'absolute', left: pct(p.t), bottom: 0, width: 2, height: Math.min(40, Math.max(4, (p.db + 60) * 0.8)), background: '#e85' }} title={`peak ${p.db.toFixed(1)}dB @ ${fmt(p.t)}`} />
        ))}
        {/* Speech segments */}
        {analysis?.speech_segments.map((s, i) => (
          <div key={`s${i}`} style={{
            position: 'absolute',
            left: pct(s.t_start),
            width: `${((s.t_end - s.t_start) / duration) * 100}%`,
            top: 46, height: 4,
            background: '#5a8',
          }} title={s.text} />
        ))}
        {/* Playhead */}
        <div style={{ position: 'absolute', left: pct(currentTime), top: 0, bottom: 0, width: 2, background: 'white' }} />
      </div>
    </div>
  )
}

function fmt(s: number): string {
  if (!Number.isFinite(s)) return '0:00.0'
  const m = Math.floor(s / 60)
  const rem = s - m * 60
  return `${m}:${rem.toFixed(1).padStart(4, '0')}`
}

function Btn({ children, onClick, disabled, danger, primary }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; danger?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary ? 'var(--gold)' : 'transparent',
      color: primary ? 'var(--bg)' : danger ? '#d44' : 'var(--text-dimmer)',
      border: '1px solid ' + (primary ? 'var(--gold)' : 'var(--border-dim)'),
      padding: '6px 12px',
      fontSize: 11,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      fontFamily: 'var(--font-mono)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border-dim)', background: 'var(--bg-raised)', padding: 12 }}>
      <Label>{title}</Label>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text-dimmest)', fontFamily: 'var(--font-mono)' }}>{children}</div>
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border-dim)',
  padding: '4px 8px',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  width: '100%',
  boxSizing: 'border-box',
}
