'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ArtistContext {
  gigs: any[]
  invoices: any[]
  posts: any[]
  profile: any
  quarterStats: { gigs: number; posts: number; revenue: number }
}

/** Stream Claude response — yields text chunks as they arrive */
async function streamClaude(
  system: string,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
): Promise<string> {
  const res = await fetch('/api/claude/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: 1200,
      messages,
    }),
  })
  if (!res.ok || !res.body) throw new Error('Failed')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Parse SSE events
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data)
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullText += event.delta.text
          onChunk(fullText)
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return fullText || 'Sorry, I couldn\'t process that.'
}

export function SignalGenius() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState<ArtistContext | null>(null)
  const [contextLoaded, setContextLoaded] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [recording, setRecording] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Voice output — speak response via OpenAI TTS
  async function speakResponse(text: string) {
    if (!voiceEnabled) return
    setSpeaking(true)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) { setSpeaking(false); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src) }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url) }
      audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url) }
      audio.play()
    } catch { setSpeaking(false) }
  }

  function stopSpeaking() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    setSpeaking(false)
  }

  // Voice input — record from mic, send to Whisper
  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', blob, 'recording.webm')
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.text) {
            handleSend(data.text)
          }
        } catch { /* silent */ }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch { /* mic permission denied */ }
  }

  // Load full artist context when chat opens
  useEffect(() => {
    if (!open || contextLoaded) return
    Promise.allSettled([
      fetch('/api/gigs').then(r => r.json()),
      fetch('/api/invoices').then(r => r.json()),
      fetch('/api/schedule').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(results => {
      const gigs = results[0].status === 'fulfilled' ? results[0].value.gigs || [] : []
      const invoices = results[1].status === 'fulfilled' ? results[1].value.invoices || [] : []
      const posts = results[2].status === 'fulfilled' ? results[2].value.posts || [] : []
      const settings = results[3].status === 'fulfilled' ? results[3].value.settings || {} : {}

      const today = new Date()
      const yr = today.getFullYear()
      const q = Math.floor(today.getMonth() / 3)
      const qStart = new Date(yr, q * 3, 1).toISOString().slice(0, 10)
      const qEnd = new Date(yr, q * 3 + 3, 0).toISOString().slice(0, 10)
      const qGigs = gigs.filter((g: any) => g.date >= qStart && g.date <= qEnd && g.status !== 'cancelled')

      setContext({
        gigs,
        invoices,
        posts,
        profile: settings.profile || {},
        quarterStats: {
          gigs: qGigs.length,
          posts: posts.filter((p: any) => p.status === 'posted').length,
          revenue: qGigs.reduce((s: number, g: any) => s + (g.fee || 0), 0),
        },
      })
      setContextLoaded(true)
    })
  }, [open, contextLoaded])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  function buildSystemPrompt(): string {
    const today = new Date().toISOString().slice(0, 10)
    const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const c = context

    let contextBlock = `Today is ${todayStr}.`

    if (c) {
      const upcoming = c.gigs.filter((g: any) => g.date >= today && g.status !== 'cancelled').slice(0, 8)
      const overdue = c.invoices.filter((i: any) => i.status !== 'paid' && i.due_date && i.due_date < today)
      const weekPosts = c.posts.filter((p: any) => {
        const d = (p.scheduled_at || '').slice(0, 10)
        const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
        return d >= today && d <= in7 && p.status === 'scheduled'
      })

      contextBlock += `\n\nArtist: ${c.profile.name || 'Unknown'} · ${c.profile.genre || 'Electronic'} · ${c.profile.country || ''}`
      contextBlock += `\nThis quarter: ${c.quarterStats.gigs} gigs, ${c.quarterStats.posts} posts published, ${c.quarterStats.revenue > 0 ? '£' + c.quarterStats.revenue.toLocaleString() + ' revenue' : 'no revenue logged'}.`

      if (upcoming.length > 0) {
        contextBlock += `\n\nUpcoming gigs:\n${upcoming.map((g: any) => `- ${g.title} at ${g.venue || '?'} · ${g.date} · ${g.time || 'TBC'} · Fee: ${g.currency || ''}${g.fee || '?'} · Status: ${g.status}`).join('\n')}`
      }

      if (overdue.length > 0) {
        contextBlock += `\n\nOverdue invoices (${overdue.length}):\n${overdue.map((i: any) => `- ${i.gig_title}: ${i.currency || ''}${i.amount} · Due: ${i.due_date}`).join('\n')}`
      }

      if (weekPosts.length > 0) {
        contextBlock += `\n\nScheduled posts this week: ${weekPosts.length}`
      }
    }

    return `You are Signal — a genius embedded inside Signal Lab OS, a creative business platform for electronic music artists.

You know everything about music production (synthesis, mixing, mastering, Ableton, Max for Live, sound design), DJ culture (set building, reading crowds, key mixing, energy arcs), social media marketing (Instagram, TikTok, content strategy, growth), music business (invoicing, contracts, royalties, advances, booking), and touring (logistics, travel, rider management).

You speak like a knowledgeable friend who happens to be brilliant at all of these things. Concise. Direct. No fluff. Use specifics — name exact plugins, techniques, strategies. When giving advice, make it actionable in the next 24 hours.

Never say you're an AI or assistant. You're Signal. You have the artist's full business context below.

${contextBlock}

Rules:
- Be concise. Short paragraphs. No lists longer than 5 items.
- Use the artist's actual data when relevant (upcoming gigs, overdue invoices, etc.)
- If asked about something outside your data, answer from your deep knowledge of the music industry.
- Format with line breaks for readability, not markdown headers.
- Currency: use the same currency as the artist's invoices/gigs.`
  }

  async function handleSend(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: msg }
    const assistantId = crypto.randomUUID()
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Add empty assistant message that will be filled by streaming
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const conversationHistory = newMessages.map(m => ({ role: m.role, content: m.content }))
      const fullResponse = await streamClaude(
        buildSystemPrompt(),
        conversationHistory,
        (partialText) => {
          // Update the assistant message in-place as text streams in
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: partialText } : m))
        },
      )
      // Final update with complete text
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullResponse } : m))
      speakResponse(fullResponse)
    } catch {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Something went wrong. Try again.' } : m))
    } finally {
      setLoading(false)
    }
  }

  const suggestedPrompts = [
    'What should I focus on this week?',
    'Help me chase my overdue invoices',
    'Content ideas for my next gig',
    'How do I get more bookings?',
    'Review my set building strategy',
    'What\'s my financial position?',
  ]

  // Floating button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 28, right: 28,
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(14,13,11,0.95)',
          border: '1px solid rgba(176,141,87,0.35)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 1000, transition: 'all 0.2s ease',
          backdropFilter: 'blur(12px)',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.borderColor = 'rgba(176,141,87,0.7)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(176,141,87,0.15)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(176,141,87,0.35)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)' }}
        title="Signal"
      >
        <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
          <polyline points="8,32 18,32 24,18 30,46 36,14 42,42 48,26 54,32 62,32" stroke="var(--gold)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
    )
  }

  // Chat panel
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28,
      width: 440, maxHeight: 'calc(100vh - 100px)',
      background: 'var(--bg)', border: '1px solid var(--border-dim)',
      display: 'flex', flexDirection: 'column',
      zIndex: 1000, boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
      fontFamily: 'var(--font-mono)',
    }}>

      {/* Header */}
      <div style={{
        padding: '18px 22px', borderBottom: '1px solid var(--border-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="18" height="18" viewBox="0 0 64 64" fill="none">
            <polyline points="8,32 18,32 24,18 30,46 36,14 42,42 48,26 54,32 62,32" stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Signal
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {speaking && (
            <button onClick={stopSpeaking} style={{
              background: 'none', border: '1px solid rgba(176,141,87,0.3)', color: 'var(--gold)',
              fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '3px 8px', cursor: 'pointer',
            }}>Stop</button>
          )}
          <button onClick={() => setVoiceEnabled(!voiceEnabled)} title={voiceEnabled ? 'Voice on' : 'Voice off'} style={{
            background: 'none', border: 'none', color: voiceEnabled ? 'var(--gold)' : 'var(--text-dimmer)',
            cursor: 'pointer', fontSize: '14px', padding: '2px', transition: 'color 0.15s',
          }}>{voiceEnabled ? '🔊' : '🔇'}</button>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: 'var(--text-dimmer)',
            cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: 1,
          }}>×</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '18px 22px',
        display: 'flex', flexDirection: 'column', gap: '14px',
        minHeight: 240, maxHeight: 420, scrollbarWidth: 'thin',
      }}>
        {messages.length === 0 && !loading && (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '6px' }}>
              Music. Marketing. Money. Gigs.
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', lineHeight: 1.6 }}>
              I have your full context. Ask me anything.
            </div>
          </div>
        )}

        {messages.filter(m => m.content !== '').map(msg => (
          <div key={msg.id} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
            <div style={{
              padding: '11px 15px',
              background: msg.role === 'user' ? 'rgba(176,141,87,0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(176,141,87,0.25)' : 'var(--border-dim)'}`,
              fontSize: '12px', lineHeight: 1.7, color: 'var(--text)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && messages.length > 0 && messages[messages.length - 1].content === '' && (
          <div style={{
            alignSelf: 'flex-start', padding: '11px 15px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim)',
            display: 'flex', gap: '6px', alignItems: 'center',
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length === 0 && !loading && (
        <div style={{ padding: '0 22px 14px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {suggestedPrompts.map(prompt => (
            <button key={prompt} onClick={() => handleSend(prompt)} disabled={loading}
              style={{
                background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.18)',
                color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px',
                padding: '6px 12px', cursor: 'pointer', transition: 'all 0.12s', letterSpacing: '0.03em',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(176,141,87,0.12)'; e.currentTarget.style.borderColor = 'rgba(176,141,87,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(176,141,87,0.06)'; e.currentTarget.style.borderColor = 'rgba(176,141,87,0.18)' }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '14px 22px 18px', borderTop: '1px solid var(--border-dim)', display: 'flex', gap: '8px' }}>
        <button onClick={toggleRecording} disabled={loading} title={recording ? 'Stop recording' : 'Voice input'} style={{
          background: recording ? 'rgba(200,60,60,0.15)' : 'transparent',
          border: `1px solid ${recording ? 'rgba(200,60,60,0.5)' : 'var(--border-dim)'}`,
          color: recording ? '#c83c3c' : 'var(--text-dimmer)',
          width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
        }}
          onMouseEnter={e => { if (!recording) { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(176,141,87,0.4)' } }}
          onMouseLeave={e => { if (!recording) { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' } }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
        </button>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={recording ? 'Listening...' : 'Ask Signal anything...'}
          disabled={loading || recording}
          style={{
            flex: 1, background: 'var(--bg)', border: '1px solid var(--border-dim)',
            color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '12px',
            padding: '11px 14px', outline: 'none', transition: 'border-color 0.15s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(176,141,87,0.4)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border-dim)'}
        />
        <button onClick={() => handleSend()} disabled={!input.trim() || loading}
          style={{
            background: 'var(--gold)', border: 'none', color: '#070706',
            fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.16em',
            textTransform: 'uppercase', padding: '11px 18px',
            cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
            opacity: !input.trim() || loading ? 0.5 : 1,
          }}>→</button>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )
}
