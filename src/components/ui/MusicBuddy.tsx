'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  role: 'user' | 'buddy'
  text: string
}

const CHIPS = [
  'What key works with 8A?',
  'Make my kick hit harder',
  'More width on my pads',
  'How do I build tension?',
]

export function MusicBuddy() {
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<Record<string, any> | null>(null)
  const inputRef      = useRef<HTMLInputElement>(null)
  const bottomRef     = useRef<HTMLDivElement>(null)

  // Load sound profile once
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (d.settings?.profile) setProfile(d.settings.profile)
    }).catch(() => {})
  }, [])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  // Scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || loading) return
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setInput('')
    setLoading(true)

    try {
      const soundCtx = profile
        ? [
            profile.soundsLike?.length ? `Sounds like: ${profile.soundsLike.join(', ')}.` : '',
            profile.keyCenter ? `Working key: ${profile.keyCenter}.` : '',
            profile.bpmRange  ? `BPM range: ${profile.bpmRange}.` : '',
            profile.making    ? `Currently making: ${profile.making}.` : '',
          ].filter(Boolean).join(' ')
        : ''

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 180,
          system: `You are a concise music production buddy for Night Manoeuvres, an electronic music artist based in Dublin. ${soundCtx} Answer in 1–3 short conversational sentences. Be specific and practical — name plugins, frequencies, techniques. No markdown, no bullet points, no headers. Just talk.`,
          messages: [{ role: 'user', content: q }],
        }),
      })

      const data = await res.json()
      const answer = data.content?.[0]?.text?.trim() || 'Not sure on that one — try rephrasing?'
      setMessages(prev => [...prev, { role: 'buddy', text: answer }])
    } catch {
      setMessages(prev => [...prev, { role: 'buddy', text: 'Dropped out — try again?' }])
    } finally {
      setLoading(false)
    }
  }

  const btnBase: React.CSSProperties = {
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    transition: 'all 0.15s',
  }

  return (
    <>
      {/* ── Closed button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            ...btnBase,
            position: 'fixed',
            bottom: '76px',
            right: '24px',
            height: '34px',
            padding: '0 14px',
            background: '#0a0908',
            border: '1px solid #2e2c29',
            color: '#b08d57',
            fontSize: '10px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            zIndex: 9990,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#b08d57'
            e.currentTarget.style.background  = '#141310'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#2e2c29'
            e.currentTarget.style.background  = '#0a0908'
          }}
        >
          <span style={{ fontSize: '14px', lineHeight: 1 }}>≋</span> Music Buddy
        </button>
      )}

      {/* ── Open panel ── */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: '72px',
          right: '24px',
          width: '310px',
          height: '400px',
          background: '#0a0908',
          border: '1px solid #2a2826',
          zIndex: 9990,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'DM Mono', monospace",
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}>

          {/* Header */}
          <div style={{ padding: '13px 16px 11px', borderBottom: '1px solid #1a1917', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontSize: '10px', letterSpacing: '0.22em', color: '#b08d57', textTransform: 'uppercase' }}>Sonix</span>
              <span style={{ fontSize: '9px', color: '#2e2c29', letterSpacing: '0.1em' }}>music buddy</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ ...btnBase, background: 'none', border: 'none', color: '#2e2c29', fontSize: '18px', lineHeight: 1, padding: '2px 4px' }}
              onMouseEnter={e => e.currentTarget.style.color = '#8a8780'}
              onMouseLeave={e => e.currentTarget.style.color = '#2e2c29'}
            >×</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.length === 0 && (
              <div style={{ fontSize: '11px', color: '#2e2c29', lineHeight: 1.7, marginBottom: '4px' }}>
                Mixing, sound design, theory — ask anything.
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  fontSize: '12px',
                  lineHeight: 1.65,
                  maxWidth: '88%',
                  color: m.role === 'user' ? '#52504c' : '#d8d3ca',
                  background: m.role === 'buddy' ? '#141310' : 'transparent',
                  border: m.role === 'buddy' ? '1px solid #1a1917' : 'none',
                  padding: m.role === 'buddy' ? '10px 13px' : '0',
                }}>
                  {m.text}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 13px', background: '#141310', border: '1px solid #1a1917', width: 'fit-content' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#b08d57', animation: `mb-pulse 1.2s ease-in-out ${i * 0.18}s infinite` }} />
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick chips — first open only */}
          {messages.length === 0 && (
            <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: '5px', flexShrink: 0 }}>
              {CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => ask(chip)}
                  style={{
                    ...btnBase,
                    fontSize: '9px',
                    letterSpacing: '0.07em',
                    color: '#52504c',
                    background: 'none',
                    border: '1px solid #1a1917',
                    padding: '5px 9px',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#b08d57'; e.currentTarget.style.color = '#b08d57' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1917'; e.currentTarget.style.color = '#52504c' }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ padding: '10px 14px 12px', borderTop: '1px solid #1a1917', display: 'flex', gap: '7px', flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') ask(input) }}
              placeholder="Ask anything…"
              style={{
                flex: 1,
                background: '#141310',
                border: '1px solid #1a1917',
                color: '#f0ebe2',
                fontFamily: "'DM Mono', monospace",
                fontSize: '11px',
                padding: '8px 11px',
                outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#3a3830'}
              onBlur={e => e.target.style.borderColor = '#1a1917'}
            />
            <button
              onClick={() => ask(input)}
              disabled={!input.trim() || loading}
              style={{
                ...btnBase,
                background: input.trim() && !loading ? '#b08d57' : '#1a1917',
                border: 'none',
                color: input.trim() && !loading ? '#070706' : '#3a3830',
                fontSize: '13px',
                padding: '0 14px',
                fontWeight: 500,
              }}
            >
              →
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes mb-pulse {
          0%, 100% { opacity: 0.25; transform: scale(0.75); }
          50%       { opacity: 1;    transform: scale(1);    }
        }
      `}</style>
    </>
  )
}
