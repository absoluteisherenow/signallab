'use client'

import { useRef, useState } from 'react'
import { ScanPulse } from './ScanPulse'

interface ScreenshotUploadProps {
  onExtracted: (fields: Record<string, string>) => void
  extractionPrompt: string
}

export function ScreenshotUpload({ onExtracted, extractionPrompt }: ScreenshotUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    if (!file) return
    setLoading(true)
    setError('')

    try {
      // Convert to base64
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      const mediaType = (file.type || 'image/jpeg') as
        | 'image/jpeg'
        | 'image/png'
        | 'image/gif'
        | 'image/webp'

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          nocache: true,
          system:
            'You extract structured data from images. Return ONLY valid JSON — no markdown fences, no explanation, no extra text. If a field cannot be confidently determined, omit it entirely.',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data: base64 },
                },
                {
                  type: 'text',
                  text: extractionPrompt,
                },
              ],
            },
          ],
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `API error ${res.status}`)
      }

      const data = await res.json()
      const rawText: string = data.content?.[0]?.text || '{}'
      // Strip possible markdown fences just in case
      const cleaned = rawText.replace(/```json|```/g, '').trim()
      const extracted: Record<string, string> = JSON.parse(cleaned)
      onExtracted(extracted)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse image'
      setError(msg)
    } finally {
      setLoading(false)
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          background: 'transparent',
          border: '1px solid var(--border-dim)',
          color: loading ? 'var(--text-dimmer)' : 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          padding: '9px 16px',
          cursor: loading ? 'default' : 'pointer',
          transition: 'border-color 0.15s, color 0.15s',
          opacity: loading ? 0.6 : 1,
        }}
        onMouseEnter={e => {
          if (!loading) {
            const el = e.currentTarget as HTMLButtonElement
            el.style.borderColor = 'rgba(176,141,87,0.5)'
            el.style.color = 'var(--gold)'
          }
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.borderColor = 'var(--border-dim)'
          el.style.color = loading ? 'var(--text-dimmer)' : 'var(--text-dim)'
        }}
      >
        {loading ? (
          <>
            <ScanPulse size="sm" />
            Scanning...
          </>
        ) : (
          <>
            <span style={{ fontSize: '13px', lineHeight: 1 }}>📷</span>
            Upload screenshot
          </>
        )}
      </button>

      {error && (
        <span style={{
          fontSize: '10px',
          color: '#c06060',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.05em',
        }}>
          {error}
        </span>
      )}

      <style>{`@keyframes screenshot-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
