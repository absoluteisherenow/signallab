'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  font: 'var(--font-mono)',
}

type Phase = 'idle' | 'listening' | 'processing' | 'speaking'

type Turn = { role: 'user' | 'assistant'; content: string }

function SignalInner() {
  const searchParams = useSearchParams()
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  // Multi-turn history so Signal has conversational memory within a session.
  // The brain already injects artist/gig/invoice/narrative context on every
  // call — we only need to carry back and forth user↔assistant turns here.
  const [history, setHistory] = useState<Turn[]>([])
  const [openerLoaded, setOpenerLoaded] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Proactive opener — fetched once on mount. Brain decides the single most
  // useful thing to say given today's priority, gigs, invoices, narrative
  // threads, performance signal. Auto-speaks via TTS when it lands.
  useEffect(() => {
    let cancelled = false
    fetch('/api/signal/opener', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.opener) { setOpenerLoaded(true); return }
        const text: string = data.opener
        setResponse(text)
        setOpenerLoaded(true)
        // Auto-speak only if the browser allows it. iOS Safari requires a
        // user gesture for audio.play() — the .catch below handles that
        // silently, the text is still visible.
        void speakText(text)
      })
      .catch(() => setOpenerLoaded(true))
    return () => { cancelled = true }
  }, [])

  const statusText: Record<Phase, string> = {
    idle: 'Tap to speak',
    listening: 'Listening...',
    processing: 'Thinking...',
    speaking: 'Speaking...',
  }

  // Speak via OpenAI TTS
  async function speakText(text: string) {
    setPhase('speaking')
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) { setPhase('idle'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src) }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPhase('idle'); URL.revokeObjectURL(url) }
      audio.onerror = () => { setPhase('idle'); URL.revokeObjectURL(url) }
      audio.play().catch(() => setPhase('idle'))
    } catch {
      setPhase('idle')
    }
  }

  function stopSpeaking() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    setPhase('idle')
  }

  async function ask(text: string) {
    if (!text.trim()) return
    setTranscript(text)
    setPhase('processing')
    setResponse('')

    try {
      // /api/signal/ask routes through callClaudeWithBrain — every reply
      // gets artist identity, Voice DNA, casing rules, banned patterns,
      // active rules, strategy primer, trends, narrative threads, priority,
      // recent performance. No more bolted-on DB preloads; no more
      // fabrication. Non-streaming: max_tokens is 400, TTS can't start
      // until we have the full text anyway.
      const res = await fetch('/api/signal/ask', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })

      if (!res.ok) throw new Error(`ask failed: ${res.status}`)
      const data = await res.json()
      const reply: string = data.text || ''
      if (!reply) {
        setResponse('Nothing came back — try again.')
        setPhase('idle')
        return
      }

      setResponse(reply)
      setHistory(prev => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: reply },
      ])
      void speakText(reply)
    } catch {
      setResponse('Something went wrong — try again.')
      setPhase('idle')
    }
  }

  // Simple flow: tap → record, tap → stop & send. No greeting ceremony.
  async function handleMicTap() {
    // If speaking, stop
    if (phase === 'speaking') {
      stopSpeaking()
      return
    }

    // If already listening, stop recording and send
    if (phase === 'listening') {
      mediaRecorderRef.current?.stop()
      setPhase('processing')
      return
    }

    // Start recording immediately
    setResponse('')
    setTranscript('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Pick a supported mime type — iOS doesn't support webm
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg'
        : ''
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm'
      const chunks: Blob[] = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (chunks.length === 0) {
          setResponse('No audio captured — try again.')
          setPhase('idle')
          return
        }
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', blob, `voice.${ext}`)
        setPhase('processing')
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.text) {
            ask(data.text)
          } else {
            setResponse('Didn\'t catch that — try again.')
            setPhase('idle')
          }
        } catch {
          setResponse('Connection error — try again.')
          setPhase('idle')
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setPhase('listening')
    } catch {
      setResponse('Mic access needed — check your browser settings.')
      setPhase('idle')
    }
  }

  const micColor = phase === 'listening' ? '#c83c3c' : phase === 'speaking' ? s.gold : s.dimmer
  const ringColor = phase === 'listening' ? 'rgba(200,60,60,0.4)' : phase === 'speaking' ? 'rgba(255,42,26,0.4)' : 'rgba(255,42,26,0.2)'
  const pulseRing = phase === 'listening' || phase === 'speaking'

  return (
    <div style={{
      background: s.bg, height: '100vh', fontFamily: s.font, color: s.text,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '0 24px 72px',
      overflow: 'hidden',
    }}>

      {/* Debug: context state — keep up until no-fabrication pass is confirmed */}
      <div style={{
        position: 'fixed', top: 'calc(env(safe-area-inset-top) + 8px)',
        left: 8, right: 8,
        padding: '8px 12px',
        background: '#ff2a1a', color: '#000',
        fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
        textAlign: 'center', zIndex: 9999,
        fontFamily: 'var(--font-mono)',
        borderRadius: 4,
      }}>
        {openerLoaded ? 'SIGNAL · BRAIN WIRED' : 'SIGNAL · LOADING…'}
      </div>

      {/* Response text */}
      <div style={{
        minHeight: '80px', maxHeight: '50vh', overflowY: 'auto',
        display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center', marginBottom: '40px', width: '100%',
        scrollbarWidth: 'thin',
      }}>
        {response ? (
          <div style={{
            fontSize: response.length > 300 ? '13px' : '17px',
            color: s.text, lineHeight: 1.8, textAlign: response.length > 300 ? 'left' : 'center',
            maxWidth: '360px', whiteSpace: 'pre-wrap',
          }}>
            {response}
          </div>
        ) : transcript ? (
          <div style={{
            fontSize: '14px', color: s.dim, textAlign: 'center',
            maxWidth: '300px', fontStyle: 'italic',
          }}>
            &ldquo;{transcript}&rdquo;
          </div>
        ) : null}
      </div>

      {/* Mic button */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        {pulseRing && (
          <div style={{
            position: 'absolute', top: -10, left: -10, right: -10, bottom: -10,
            borderRadius: '50%', border: `2px solid ${ringColor}`,
            animation: 'signalPulse 1.5s ease-in-out infinite',
          }} />
        )}
        <div
          role="button"
          tabIndex={0}
          onClick={handleMicTap}
          onKeyDown={e => { if (e.key === 'Enter') handleMicTap() }}
          style={{
            width: 120, height: 120, borderRadius: '50%',
            background: phase === 'listening' ? 'rgba(200,60,60,0.1)' : 'rgba(255,42,26,0.06)',
            border: `2px solid ${ringColor}`,
            color: micColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: phase === 'processing' ? 'wait' : 'pointer',
            transition: 'all 0.2s',
            position: 'relative', zIndex: 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {phase === 'speaking' ? (
            <div style={{ width: 24, height: 24, background: s.gold, borderRadius: '3px' }} />
          ) : (
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          )}
        </div>
      </div>

      {/* Status */}
      <div style={{
        fontSize: '11px', letterSpacing: '0.14em', color: phase === 'listening' ? '#c83c3c' : s.dimmer,
        textTransform: 'uppercase', marginBottom: '20px',
      }}>
        {statusText[phase]}
      </div>

<style>{`
        @keyframes signalPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}

export default function SignalPage() {
  return (
    <Suspense>
      <SignalInner />
    </Suspense>
  )
}
