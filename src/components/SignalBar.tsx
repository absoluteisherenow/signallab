'use client'

import { useState, useRef, useEffect } from 'react'

export default function SignalBar({ onAction }: { onAction?: () => void }) {
  const [input, setInput] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function submit() {
    if (!input.trim() || loading) return
    setLoading(true)
    setReply('')
    try {
      const res = await fetch('/api/signal-bar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      })
      const data = await res.json()
      setReply(data.reply || '')
      if (data.action) onAction?.()
    } catch {
      setReply('Something went wrong.')
    } finally {
      setLoading(false)
      setInput('')
    }
  }

  return (
    <div style={{ marginBottom: '0' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        border: '1px solid rgba(176, 141, 87, 0.3)',
        background: 'var(--panel)',
        transition: 'border-color 0.15s',
      }}>
        <div style={{
          padding: '0 16px',
          fontSize: '11px',
          letterSpacing: '0.18em',
          color: 'rgba(176,141,87,0.5)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          borderRight: '1px solid rgba(176, 141, 87, 0.15)',
          height: '46px',
          display: 'flex',
          alignItems: 'center',
        }}>
          Signal
        </div>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder={loading ? 'Working...' : '"mark southwave paid" · "add invoice Fabric £1500" · "hoopla due 10 april"'}
          disabled={loading}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            padding: '0 16px',
            height: '46px',
            opacity: loading ? 0.5 : 1,
          }}
        />
        <div style={{
          padding: '0 14px',
          fontSize: '10px',
          color: 'rgba(176,141,87,0.3)',
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
        }}>
          ↵
        </div>
      </div>
      {reply && (
        <div style={{
          padding: '10px 16px',
          fontSize: '12px',
          color: 'var(--gold)',
          letterSpacing: '0.05em',
          borderLeft: '2px solid rgba(176,141,87,0.4)',
          marginTop: '8px',
          background: 'rgba(176,141,87,0.04)',
        }}>
          {reply}
        </div>
      )}
    </div>
  )
}
