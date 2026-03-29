'use client'

import { useState, useEffect, useCallback } from 'react'
import { useVoiceInput } from '@/hooks/useVoiceInput'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssistantBlueprint {
  bpm: number
  bpm_range?: string
  key: string
  camelot: string
  energy_level: number
  genre_tags: string[]
  sound_palette: string[]
  reference_tracks: string[]
  structure_hints: string
  mix_notes: string
}

interface AssistantResult {
  intent: string
  answer: string
  set_reference?: string
  blueprint?: AssistantBlueprint
  gigs?: Record<string, unknown>[]
  total?: number
  currency?: string
  breakdown?: { label: string; amount: number; status: string }[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VoiceCommandBar() {
  const [isOpen,  setIsOpen]  = useState(false)
  const [query,   setQuery]   = useState('')
  const [result,  setResult]  = useState<AssistantResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // ── Voice input ─────────────────────────────────────────────────────────
  const { voiceState, isListening, toggle: toggleMic, isSupported: voiceSupported } =
    useVoiceInput({
      onPartial: (text) => setQuery(text),
      onFinal: (text) => {
        setQuery(text)
        submitQuery(text)
      },
    })

  // ── Keyboard shortcut ─── Cmd + . ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        setIsOpen(o => !o)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Submit ───────────────────────────────────────────────────────────────
  const submitQuery = useCallback(async (text?: string) => {
    const q = (text ?? query).trim()
    if (!q) return

    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          context_date: new Date().toISOString().split('T')[0],
        }),
      })
      const data: AssistantResult = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [query])

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        title="Ask Artist OS  (⌘.)"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: '#1a1410',
          border: `1px solid ${isListening ? '#c04040' : '#4a3e2c'}`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isListening
            ? '0 0 16px rgba(192,64,64,0.4)'
            : '0 2px 12px rgba(0,0,0,0.6)',
          transition: 'all 0.2s',
        }}
      >
        <MicIcon active={isListening} />
      </button>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setIsOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Command bar panel */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
        width: 'min(720px, 90vw)',
        background: '#0e0a06',
        border: '1px solid #4a3e2c',
        borderRadius: '8px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
        fontFamily: "'DM Mono', monospace",
        overflow: 'hidden',
      }}>
        {/* Amber top rule */}
        <div style={{ height: '2px', background: '#c9a46e' }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '14px 18px 10px',
          borderBottom: '1px solid #2a2218',
        }}>
          <span style={{ fontSize: '9px', color: '#6a5030', letterSpacing: '0.12em' }}>
            ARTIST OS
          </span>
          <span style={{ color: '#2a2218', fontSize: '11px' }}>|</span>

          {/* Text input */}
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitQuery()
              if (e.key === 'Escape') setIsOpen(false)
            }}
            placeholder={isListening ? 'Listening…' : "ask anything — 'make a track from last night's set'"}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: isListening ? '#e8c98a' : '#e8dcc8',
              fontSize: '13px',
              fontFamily: 'inherit',
            }}
          />

          {/* Mic button */}
          {voiceSupported && (
            <button
              onClick={toggleMic}
              title={isListening ? 'Stop listening' : 'Start voice input'}
              style={{
                background: isListening ? 'rgba(192,64,64,0.15)' : 'transparent',
                border: `1px solid ${isListening ? '#c04040' : '#4a3e2c'}`,
                borderRadius: '4px',
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: isListening ? '#c04040' : '#6a5030',
                fontSize: '9px',
                letterSpacing: '0.1em',
                transition: 'all 0.15s',
              }}
            >
              <MicIcon active={isListening} size={12} />
              {isListening ? 'STOP' : 'MIC'}
            </button>
          )}

          {/* ASK button */}
          <button
            onClick={() => submitQuery()}
            disabled={loading || !query.trim()}
            style={{
              background: '#3a2e1a',
              border: '1px solid #c9a46e',
              borderRadius: '4px',
              padding: '4px 14px',
              cursor: 'pointer',
              color: '#c9a46e',
              fontSize: '9px',
              letterSpacing: '0.12em',
              fontFamily: 'inherit',
              opacity: (!query.trim() || loading) ? 0.4 : 1,
            }}
          >
            {loading ? '…' : 'ASK →'}
          </button>
        </div>

        {/* Voice state hint */}
        {isListening && (
          <div style={{
            padding: '8px 18px',
            background: 'rgba(192,64,64,0.08)',
            borderBottom: '1px solid rgba(192,64,64,0.2)',
            fontSize: '9px',
            color: '#c04040',
            letterSpacing: '0.1em',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ animation: 'pulse 1s infinite' }}>●</span>
            LISTENING — speak your query, it will auto-submit when you stop
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ padding: '32px 18px', textAlign: 'center' }}>
            <div style={{ color: '#6a5030', fontSize: '9px', letterSpacing: '0.15em' }}>
              QUERYING ARTIST OS
            </div>
            <ThinkingDots />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ padding: '16px 18px', color: '#c04040', fontSize: '11px' }}>
            {error}
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{ padding: '16px 18px', maxHeight: '60vh', overflowY: 'auto' }}>
            {result.intent === 'production_blueprint' && result.blueprint
              ? <BlueprintResult result={result} />
              : <TextResult result={result} />
            }
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '8px 18px',
          borderTop: '1px solid #1a1410',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '8px',
          color: '#3a2e1a',
          letterSpacing: '0.1em',
        }}>
          <span>⌘. TO CLOSE</span>
          <span>ENTER TO ASK · ESC TO DISMISS</span>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
      `}</style>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MicIcon({ active, size = 16 }: { active: boolean; size?: number }) {
  const color = active ? '#c04040' : '#6a5030'
  const s = size
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <rect x="5" y="1" width="6" height="8" rx="3" fill={color} opacity={active ? 0.9 : 0.6} />
      <path d="M3 8.5A5 5 0 0013 8.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <line x1="8" y1="13.5" x2="8" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="15" x2="11" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px' }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: '#c9a46e',
          animation: `dotpulse 1.4s ${i * 0.2}s infinite`,
          opacity: 0.3,
        }} />
      ))}
      <style>{`
        @keyframes dotpulse {
          0%,80%,100% { transform:scale(0.6); opacity:0.3 }
          40%          { transform:scale(1);   opacity:1 }
        }
      `}</style>
    </div>
  )
}

function BlueprintResult({ result }: { result: AssistantResult }) {
  const bp = result.blueprint!
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Answer */}
      <div style={{ fontSize: '11px', color: '#e8dcc8', lineHeight: 1.5 }}>
        {result.set_reference && (
          <span style={{ color: '#6a5030', fontSize: '9px', marginRight: '8px', letterSpacing: '0.1em' }}>
            SET: {result.set_reference.toUpperCase()}
          </span>
        )}
        {result.answer}
      </div>

      {/* 4 badges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
        {[
          { label: 'BPM',     value: bp.bpm_range || String(bp.bpm) },
          { label: 'KEY',     value: bp.key },
          { label: 'ENERGY',  value: `${bp.energy_level} / 10` },
          { label: 'CAMELOT', value: bp.camelot },
        ].map(b => (
          <div key={b.label} style={{
            background: '#2a2218',
            border: '1px solid #4a3e2c',
            borderTop: '2px solid #c9a46e',
            borderRadius: '4px',
            padding: '8px 6px 6px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '8px', color: '#5a4a38', letterSpacing: '0.12em', marginBottom: '4px' }}>
              {b.label}
            </div>
            <div style={{ fontSize: '15px', color: '#e8c98a', fontWeight: 'bold' }}>
              {b.value}
            </div>
          </div>
        ))}
      </div>

      {/* Genre */}
      {bp.genre_tags?.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '8px', color: '#5a4a38', letterSpacing: '0.1em', marginRight: '4px' }}>GENRE</span>
          {bp.genre_tags.map(t => (
            <span key={t} style={{
              fontSize: '9px', color: '#c9a46e', padding: '2px 8px',
              background: '#3a2e1a', border: '1px solid #4a3e2c', borderRadius: '3px',
            }}>{t}</span>
          ))}
        </div>
      )}

      {/* Sound palette */}
      {bp.sound_palette?.length > 0 && (
        <div>
          <div style={{ fontSize: '8px', color: '#5a4a38', letterSpacing: '0.1em', marginBottom: '6px' }}>PALETTE</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {bp.sound_palette.map(p => (
              <span key={p} style={{
                fontSize: '10px', color: '#e8dcc8', padding: '3px 10px',
                background: '#2a2218', border: '1px solid #4a3e2c',
                borderLeft: '2px solid rgba(201,164,110,0.4)',
                borderRadius: '3px',
              }}>{p}</span>
            ))}
          </div>
        </div>
      )}

      {/* Reference tracks */}
      {bp.reference_tracks?.length > 0 && (
        <div style={{ fontSize: '10px', color: '#e8c98a' }}>
          <span style={{ fontSize: '8px', color: '#5a4a38', letterSpacing: '0.1em', marginRight: '8px' }}>REF</span>
          {bp.reference_tracks.join('   ·   ')}
        </div>
      )}

      {/* Structure + mix notes */}
      {bp.structure_hints && (
        <div style={{ fontSize: '10px', color: '#8a7658' }}>
          <span style={{ fontSize: '8px', color: '#5a4a38', letterSpacing: '0.1em', marginRight: '8px' }}>STRUCTURE</span>
          {bp.structure_hints}
        </div>
      )}
      {bp.mix_notes && (
        <div style={{ fontSize: '10px', color: '#8a7658' }}>
          <span style={{ fontSize: '8px', color: '#5a4a38', letterSpacing: '0.1em', marginRight: '8px' }}>MIX NOTES</span>
          {bp.mix_notes}
        </div>
      )}
    </div>
  )
}

function TextResult({ result }: { result: AssistantResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{
        fontSize: '8px', color: '#6a5030', letterSpacing: '0.12em',
      }}>
        {result.intent === 'gig_info' ? 'GIG INFO' :
         result.intent === 'payment_info' ? 'PAYMENT' : 'ARTIST OS'}
      </div>
      <div style={{ fontSize: '12px', color: '#e8dcc8', lineHeight: 1.6 }}>
        {result.answer}
      </div>

      {/* Payment breakdown */}
      {result.breakdown && result.breakdown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {result.breakdown.map((item, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 10px',
              background: item.status === 'paid' ? 'rgba(78,203,113,0.06)' : '#1a1410',
              border: `1px solid ${item.status === 'paid' ? 'rgba(78,203,113,0.2)' : '#2a2218'}`,
              borderRadius: '3px',
              fontSize: '10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: item.status === 'paid' ? '#4ecb71' : '#c09030',
                  display: 'inline-block',
                }} />
                <span style={{ color: '#e8dcc8' }}>{item.label}</span>
              </div>
              <span style={{ color: item.status === 'paid' ? '#4ecb71' : '#c9a46e' }}>
                {result.currency} {item.amount.toLocaleString()}
              </span>
            </div>
          ))}

          {result.total !== undefined && (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '8px 10px 0',
              borderTop: '1px solid #2a2218',
              marginTop: '4px',
              fontSize: '13px',
            }}>
              <span style={{ color: '#5a4a38', fontSize: '9px', letterSpacing: '0.1em' }}>TOTAL</span>
              <span style={{ color: '#e8c98a', fontWeight: 'bold' }}>
                {result.currency} {result.total?.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
