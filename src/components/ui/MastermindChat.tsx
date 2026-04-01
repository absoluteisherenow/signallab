'use client'

import { useState, useRef, useEffect } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface MastermindChatProps {
  title: string
  suggestedPrompts: string[]
  onSend: (message: string) => Promise<string>
  placeholder?: string
  /** If true, show URL/file input area */
  showMediaInput?: boolean
  onMediaSubmit?: (url: string) => Promise<string>
}

export function MastermindChat({
  title,
  suggestedPrompts,
  onSend,
  placeholder = 'Ask anything...',
  showMediaInput = false,
  onMediaSubmit,
}: MastermindChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  async function handleSend(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msg,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const response = await onSend(msg)
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Something went wrong. Try again.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  async function handleMediaSubmit() {
    if (!mediaUrl.trim() || !onMediaSubmit || loading) return
    const url = mediaUrl.trim()
    setMediaUrl('')
    setLoading(true)

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `[URL] ${url}`,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const response = await onMediaSubmit(url)
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Could not process that URL. Try again.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  // Floating button when collapsed
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--gold)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          zIndex: 1000,
          transition: 'transform 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title={title}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#070706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    )
  }

  // Expanded panel
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      width: 420,
      maxHeight: 'calc(100vh - 120px)',
      background: 'var(--bg)',
      border: '1px solid var(--border-dim)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      fontFamily: 'var(--font-mono)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-dim)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{
          fontSize: '10px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
        }}>
          {title}
        </div>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dimmer)',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minHeight: 200,
        maxHeight: 400,
        scrollbarWidth: 'thin',
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '32px 0',
            color: 'var(--text-dimmer)',
            fontSize: '11px',
            lineHeight: '1.7',
          }}>
            Ask me anything. I have full context on your data.
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
            }}
          >
            <div style={{
              padding: '10px 14px',
              background: msg.role === 'user' ? 'rgba(176,141,87,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(176,141,87,0.3)' : 'var(--border-dim)'}`,
              fontSize: '12px',
              lineHeight: '1.6',
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
            <div style={{
              fontSize: '9px',
              color: 'var(--text-dimmest)',
              marginTop: '4px',
              textAlign: msg.role === 'user' ? 'right' : 'left',
            }}>
              {msg.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-dim)',
            fontSize: '12px',
            color: 'var(--text-dimmer)',
          }}>
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length === 0 && (
        <div style={{
          padding: '0 20px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
        }}>
          {suggestedPrompts.map(prompt => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              disabled={loading}
              style={{
                background: 'rgba(176,141,87,0.08)',
                border: '1px solid rgba(176,141,87,0.2)',
                color: 'var(--gold)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                padding: '6px 12px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.12s',
                letterSpacing: '0.04em',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(176,141,87,0.15)'
                e.currentTarget.style.borderColor = 'rgba(176,141,87,0.4)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(176,141,87,0.08)'
                e.currentTarget.style.borderColor = 'rgba(176,141,87,0.2)'
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Media URL input */}
      {showMediaInput && (
        <div style={{
          padding: '0 20px 8px',
          display: 'flex',
          gap: '6px',
        }}>
          <input
            value={mediaUrl}
            onChange={e => setMediaUrl(e.target.value)}
            placeholder="Paste a URL or Google Sheets link..."
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--border-dim)',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              padding: '8px 12px',
              outline: 'none',
            }}
            onKeyDown={e => e.key === 'Enter' && handleMediaSubmit()}
          />
          <button
            onClick={handleMediaSubmit}
            disabled={!mediaUrl.trim() || loading}
            style={{
              background: 'rgba(176,141,87,0.15)',
              border: '1px solid rgba(176,141,87,0.3)',
              color: 'var(--gold)',
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              padding: '8px 14px',
              cursor: !mediaUrl.trim() || loading ? 'not-allowed' : 'pointer',
              opacity: !mediaUrl.trim() || loading ? 0.5 : 1,
            }}
          >
            Parse
          </button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '12px 20px 16px',
        borderTop: '1px solid var(--border-dim)',
        display: 'flex',
        gap: '8px',
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={placeholder}
          disabled={loading}
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border-dim)',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            padding: '10px 14px',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(176,141,87,0.4)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border-dim)'}
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          style={{
            background: 'var(--gold)',
            border: 'none',
            color: '#070706',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            padding: '10px 18px',
            cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
            opacity: !input.trim() || loading ? 0.5 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
