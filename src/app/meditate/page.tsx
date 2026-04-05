'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMobile } from '@/hooks/useMobile'

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  font: 'var(--font-mono)',
}

type ModeKey = 'travel' | 'pregig' | 'creative' | 'winddown'

interface ModeConfig {
  key: ModeKey
  name: string
  subtitle: string
  description: string
  duration: number
  breatheIn: number
  hold: number
  breatheOut: number
  gradient: string
  glow: string
  promptContext: string
}

const MODES: ModeConfig[] = [
  {
    key: 'travel',
    name: 'Liquid Sunshine',
    subtitle: 'Travel',
    description: 'Calm energy for journeys',
    duration: 300,
    breatheIn: 4, hold: 4, breatheOut: 4,
    gradient: 'radial-gradient(circle, #d4a438 0%, #b8860b 40%, #8b6914 70%, rgba(139,105,20,0.15) 90%, transparent 100%)',
    glow: '0 0 80px rgba(212, 164, 56, 0.5), 0 0 160px rgba(212, 164, 56, 0.25), 0 0 240px rgba(212, 164, 56, 0.1)',
    promptContext: 'A calm energy visualisation called Liquid Sunshine — warm light filling the body, perfect for travel days',
  },
  {
    key: 'pregig',
    name: 'Lock In',
    subtitle: 'Pre-Gig',
    description: 'Grounding focus before a show',
    duration: 300,
    breatheIn: 4, hold: 4, breatheOut: 4,
    gradient: 'radial-gradient(circle, #c0392b 0%, #922b21 40%, #641e16 70%, rgba(100,30,22,0.15) 90%, transparent 100%)',
    glow: '0 0 80px rgba(192, 57, 43, 0.55), 0 0 160px rgba(192, 57, 43, 0.25), 0 0 240px rgba(192, 57, 43, 0.1)',
    promptContext: 'A grounding focus session called Lock In — centring energy before performing, channelling confidence',
  },
  {
    key: 'creative',
    name: 'Open Channel',
    subtitle: 'Creative',
    description: 'Unlock flow for studio or stage',
    duration: 300,
    breatheIn: 4, hold: 4, breatheOut: 4,
    gradient: 'radial-gradient(circle, #fff8e7 0%, #d4a438 35%, #b8860b 65%, rgba(184,134,11,0.15) 90%, transparent 100%)',
    glow: '0 0 80px rgba(255, 248, 231, 0.4), 0 0 160px rgba(212, 164, 56, 0.25), 0 0 240px rgba(212, 164, 56, 0.1)',
    promptContext: 'A creative flow opener called Open Channel — expanding awareness, unlocking ideas for music or performance',
  },
  {
    key: 'winddown',
    name: 'Night Return',
    subtitle: 'Wind-Down',
    description: 'Decompress after the energy',
    duration: 300,
    breatheIn: 4, hold: 7, breatheOut: 8,
    gradient: 'radial-gradient(circle, #5d7b93 0%, #3d566e 40%, #2c3e50 70%, rgba(44,62,80,0.15) 90%, transparent 100%)',
    glow: '0 0 80px rgba(93, 123, 147, 0.4), 0 0 160px rgba(93, 123, 147, 0.2), 0 0 240px rgba(93, 123, 147, 0.08)',
    promptContext: 'A decompression session called Night Return — releasing the energy of a show or long day, settling into stillness',
  },
]

type BreathPhase = 'in' | 'hold' | 'out'

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function MeditatePage() {
  const mobile = useMobile()
  const [mounted, setMounted] = useState(false)
  const [activeMode, setActiveMode] = useState<ModeConfig | null>(null)
  const [screen, setScreen] = useState<'choose' | 'session' | 'complete'>('choose')
  const [paused, setPaused] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [breathPhase, setBreathPhase] = useState<BreathPhase>('in')
  const [introText, setIntroText] = useState('')
  const [introPlaying, setIntroPlaying] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const breathRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('meditation-active')
      activeRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
      if (breathRef.current) clearTimeout(breathRef.current)
      audioSourceRef.current?.stop()
      audioCtxRef.current?.close()
      audioCtxRef.current = null
      audioSourceRef.current = null
    }
  }, [])

  const runBreath = useCallback((m: ModeConfig, phase: BreathPhase) => {
    if (!activeRef.current) return
    setBreathPhase(phase)
    const dur = phase === 'in' ? m.breatheIn : phase === 'hold' ? m.hold : m.breatheOut
    const next: BreathPhase = phase === 'in' ? 'hold' : phase === 'hold' ? 'out' : 'in'
    breathRef.current = setTimeout(() => runBreath(m, next), dur * 1000)
  }, [])

  function selectMode(m: ModeConfig) {
    // Hide nav/FAB during session
    document.body.classList.add('meditation-active')
    setActiveMode(m)
    setScreen('session')
    setRemaining(m.duration)
    setPaused(false)
    setIntroText('')
    setIntroPlaying(false)
    activeRef.current = true

    // Start breathing
    runBreath(m, 'in')

    // Start timer
    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          activeRef.current = false
          if (timerRef.current) clearInterval(timerRef.current)
          if (breathRef.current) clearTimeout(breathRef.current)
          setScreen('complete')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Unlock AudioContext during user gesture so TTS can play later
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }

    // Generate intro + speak it
    generateIntro(m)
  }

  async function generateIntro(m: ModeConfig) {
    try {
      const res = await fetch('/api/claude/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          system: `You are Signal, guiding a 5-minute meditation for an electronic music artist. Context: ${m.promptContext}. Write a full guided meditation script that takes about 5 minutes to read aloud (~700 words). Include breathing cues woven naturally into the narration (e.g. "breathe in slowly... hold... and release"). Build through phases: grounding, deepening, the core visualisation, then gently returning. Speak naturally, warmly, with pauses indicated by "..." — no bullet points, no headings, just flowing spoken guidance. Never mention AI.`,
          max_tokens: 1200,
          messages: [{ role: 'user', content: `Guide me through the full ${m.subtitle.toLowerCase()} meditation.` }],
        }),
      })

      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const event = JSON.parse(data)
            if (event.type === 'content_block_delta' && event.delta?.text) {
              fullText += event.delta.text
              setIntroText(fullText)
            }
          } catch {}
        }
      }

      // TTS
      if (fullText && activeRef.current) {
        try {
          const ttsRes = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: fullText }),
          })
          if (ttsRes.ok) {
            const arrayBuffer = await ttsRes.arrayBuffer()
            const ctx = audioCtxRef.current
            if (!ctx || !activeRef.current) return
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
            const source = ctx.createBufferSource()
            source.buffer = audioBuffer
            source.connect(ctx.destination)
            audioSourceRef.current = source
            setIntroPlaying(true)
            source.onended = () => setIntroPlaying(false)
            source.start(0)
          }
        } catch {}
      }
    } catch {}
  }

  function togglePause() {
    if (!activeMode) return
    const mode = activeMode
    setPaused(prev => {
      if (!prev) {
        // Pause
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        if (breathRef.current) { clearTimeout(breathRef.current); breathRef.current = null }
        audioSourceRef.current?.stop()
        audioCtxRef.current?.suspend()
      } else {
        // Resume
        timerRef.current = setInterval(() => {
          setRemaining(p => {
            if (p <= 1) {
              activeRef.current = false
              if (timerRef.current) clearInterval(timerRef.current)
              if (breathRef.current) clearTimeout(breathRef.current)
              setScreen('complete')
              return 0
            }
            return p - 1
          })
        }, 1000)
        runBreath(mode, breathPhase)
        audioCtxRef.current?.resume()
      }
      return !prev
    })
  }

  function exitSession() {
    document.body.classList.remove('meditation-active')
    activeRef.current = false
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (breathRef.current) { clearTimeout(breathRef.current); breathRef.current = null }
    audioSourceRef.current?.stop()
    audioSourceRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    setActiveMode(null)
    setScreen('choose')
    setPaused(false)
    setIntroPlaying(false)
    setIntroText('')
  }

  const mode = activeMode
  const cycleDuration = mode ? mode.breatheIn + mode.hold + mode.breatheOut : 12
  const breatheInPct = mode ? (mode.breatheIn / cycleDuration) * 100 : 33
  const holdEndPct = mode ? ((mode.breatheIn + mode.hold) / cycleDuration) * 100 : 66

  if (!mounted) return (
    <div style={{ minHeight: '100vh', background: '#070706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: '#52504c', textTransform: 'uppercase' }}>Mind</div>
    </div>
  )

  if (!mobile) return (
    <div style={{ minHeight: '100vh', background: '#070706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', fontFamily: s.font }}>
      <div style={{ fontSize: '13px', letterSpacing: '0.12em', color: s.dim, textTransform: 'uppercase' }}>Mind</div>
      <div style={{ fontSize: '11px', color: s.dimmer, maxWidth: '280px', textAlign: 'center', lineHeight: 1.6 }}>Open this on your phone for the full guided meditation experience.</div>
    </div>
  )

  // ── CHOOSE ── mode picker
  if (screen === 'choose' || !mode) {
    return (
      <div style={{
        minHeight: '100vh', background: s.bg, fontFamily: s.font, color: s.text,
        padding: '48px 20px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{ maxWidth: 520, width: '100%' }}>
          <div style={{ fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.dim, marginBottom: '8px' }}>
            Mind
          </div>
          <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '40px', lineHeight: 1.5 }}>
            5 minutes of guided breathing with a spoken opening.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {MODES.map(m => (
              <a
                key={m.key}
                role="button"
                tabIndex={0}
                onClick={(e) => { e.preventDefault(); selectMode(m) }}
                onTouchEnd={(e) => { e.preventDefault(); selectMode(m) }}
                onKeyDown={(e) => { if (e.key === 'Enter') selectMode(m) }}
                style={{
                  background: s.panel, border: `1px solid ${s.border}`,
                  padding: '20px 24px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  textDecoration: 'none',
                  fontFamily: s.font,
                  width: '100%',
                  boxSizing: 'border-box',
                  WebkitTapHighlightColor: 'transparent',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  touchAction: 'manipulation',
                }}
              >
                <span>
                  <span style={{ fontSize: '14px', color: s.text, fontWeight: 500, marginBottom: '4px', display: 'block' }}>
                    {m.name}
                  </span>
                  <span style={{ fontSize: '11px', color: s.dimmer, letterSpacing: '0.05em', display: 'block' }}>
                    {m.subtitle} — {m.description}
                  </span>
                </span>
                <span style={{ fontSize: '11px', color: s.dimmer, flexShrink: 0, marginLeft: '16px' }}>
                  {m.duration / 60}m
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── COMPLETE ──
  if (screen === 'complete') {
    return (
      <div style={{
        minHeight: '100vh', background: s.bg, fontFamily: s.font, color: s.text,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 20px 100px',
      }}>
        <div style={{ fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.dim, marginBottom: '12px' }}>
          Session Complete
        </div>
        <div style={{ fontSize: '32px', color: s.text, fontWeight: 300, marginBottom: '8px' }}>
          {formatTime(mode.duration)}
        </div>
        <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '48px' }}>
          {mode.name}
        </div>
        <a
          role="button"
          tabIndex={0}
          onClick={(e) => { e.preventDefault(); exitSession() }}
          onTouchEnd={(e) => { e.preventDefault(); exitSession() }}
          style={{
            background: 'transparent', border: `1px solid ${s.border}`,
            padding: '10px 28px', color: s.dim, fontFamily: s.font,
            fontSize: '12px', cursor: 'pointer', letterSpacing: '0.05em',
            textDecoration: 'none',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
          }}
        >
          Back
        </a>
      </div>
    )
  }

  // ── SESSION ──
  const breathLabel = breathPhase === 'in' ? 'Breathe in...' : breathPhase === 'hold' ? 'Hold...' : 'Breathe out...'

  return (
    <>
      <style>{`
        @keyframes breathe {
          0% { transform: scale(0.5); opacity: 0.5; }
          ${breatheInPct}% { transform: scale(1); opacity: 1; }
          ${holdEndPct}% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.5); opacity: 0.5; }
        }
      `}</style>
      <div
        onClick={togglePause}
        style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: '#070706', fontFamily: s.font, color: s.text,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
          zIndex: 10000, overflow: 'hidden',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        }}
      >
        {/* Exit */}
        <div
          onClick={e => { e.stopPropagation(); exitSession() }}
          onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); exitSession() }}
          style={{
            position: 'absolute', top: 20, right: 20, color: '#8a8780',
            fontSize: '20px', cursor: 'pointer', padding: 16, lineHeight: 1, zIndex: 10,
            minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </div>

        {/* Mode label */}
        <div style={{
          position: 'absolute', top: 28, left: 0, right: 0, textAlign: 'center',
          fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8780',
        }}>
          {mode.subtitle}
        </div>

        {/* Intro text — hidden, audio only */}

        {/* Breathing circle */}
        <div style={{
          width: 'min(280px, 60vw)', height: 'min(280px, 60vw)',
          borderRadius: '50%', background: mode.gradient, boxShadow: mode.glow,
          animation: paused ? 'none' : `breathe ${cycleDuration}s ease-in-out infinite`,
          transition: 'box-shadow 0.5s ease',
          border: '1px solid rgba(255,255,255,0.06)',
        }} />

        {/* Breath label */}
        <div style={{
          marginTop: 40, fontSize: '16px', color: '#c8c0b4',
          letterSpacing: '0.06em', textAlign: 'center', minHeight: 24,
        }}>
          {paused ? 'Paused' : breathLabel}
        </div>

        {/* Timer */}
        <div style={{
          position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center',
          fontSize: '18px', fontFamily: s.font, color: '#8a8780', letterSpacing: '0.08em',
        }}>
          {formatTime(remaining)}
        </div>
      </div>
    </>
  )
}
