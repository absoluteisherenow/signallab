'use client'

import { useState } from 'react'

export default function ConnectVST() {
  const [token, setToken] = useState<string | null>(null)
  const [artist, setArtist] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth-token')
      const data = await res.json()
      if (res.status === 401) {
        // Not logged in — redirect to login page
        window.location.href = `/login?next=${encodeURIComponent('/connect-vst')}`
        return
      }
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`)
      setToken(data.token)
      setArtist(data.artist)
    } catch (err: any) {
      setError(err.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!token) return
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      setCopyFailed(true)
      setTimeout(() => setCopyFailed(false), 3000)
    })
  }

  return (
    <div
      style={{
        background: '#050505',
        color: '#e8e4dc',
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '520px' }}>

        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <div
            style={{
              fontSize: '10px',
              letterSpacing: '0.3em',
              color: '#ff2a1a',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '20px',
            }}
          >
            <span style={{ display: 'block', width: '28px', height: '1px', background: '#ff2a1a' }} />
            Sonix Lab — VST Authentication
          </div>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 400,
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
              margin: 0,
              marginBottom: '12px',
            }}
          >
            Connect your VST plugin.
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: '#7a7570',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Generate a permanent connection token and paste it into Sonix Lab once. It refreshes automatically — you never need to reconnect.
          </p>
        </div>

        {/* Generate button */}
        {!token && (
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px 24px',
              background: loading
                ? 'transparent'
                : 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
              border: '1px solid #ff2a1a',
              color: '#ff2a1a',
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: '10px',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Generating…' : 'Generate Token'}
          </button>
        )}

        {/* Error */}
        {error && (
          <p
            style={{
              marginTop: '16px',
              fontSize: '12px',
              color: '#8a4a3a',
              letterSpacing: '0.05em',
            }}
          >
            Error: {error}
          </p>
        )}

        {/* Token display */}
        {token && (
          <div style={{ marginTop: '0' }}>
            {artist && (
              <div
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.22em',
                  color: '#ff2a1a',
                  textTransform: 'uppercase',
                  marginBottom: '16px',
                }}
              >
                Token for {artist}
              </div>
            )}

            {/* Token box */}
            <div
              style={{
                background: '#0e0e0e',
                border: '1px solid #2a2520',
                padding: '20px 24px',
                marginBottom: '12px',
                wordBreak: 'break-all',
                fontSize: '14px',
                letterSpacing: '0.06em',
                color: '#e8e4dc',
                lineHeight: 1.5,
              }}
            >
              {token}
            </div>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: copied
                  ? 'rgba(61, 107, 74, 0.15)'
                  : copyFailed
                  ? 'rgba(100, 50, 40, 0.15)'
                  : 'transparent',
                border: `1px solid ${
                  copied
                    ? 'rgba(61, 107, 74, 0.6)'
                    : copyFailed
                    ? 'rgba(138, 74, 58, 0.6)'
                    : '#2a2520'
                }`,
                color: copied ? '#5a9a68' : copyFailed ? '#8a4a3a' : '#7a7570',
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                fontSize: '10px',
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {copied ? 'Copied ✓' : copyFailed ? 'Copy failed — select manually' : 'Copy Token'}
            </button>

            {/* Regenerate */}
            <button
              onClick={() => { setToken(null); setArtist(null) }}
              style={{
                width: '100%',
                marginTop: '8px',
                padding: '12px 24px',
                background: 'transparent',
                border: 'none',
                color: '#4a4540',
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                fontSize: '10px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              ← Generate a new token
            </button>
          </div>
        )}

        {/* Instructions */}
        <div
          style={{
            marginTop: '48px',
            paddingTop: '32px',
            borderTop: '1px solid #1a1916',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              letterSpacing: '0.22em',
              color: '#ff2a1a',
              textTransform: 'uppercase',
              marginBottom: '20px',
            }}
          >
            How to connect
          </div>
          {[
            { step: '01', text: 'Install the VST and load Sonix Lab Suite in Ableton.' },
            { step: '02', text: 'Click Generate Token and copy it. This is a one-time setup — the token refreshes itself automatically.' },
            {
              step: '03',
              text: 'In Ableton, open the Sonix Lab plugin. Click the Settings tab, paste the token into the field at the bottom, and click SAVE.',
            },
            { step: '04', text: 'Click SYNC TO SONIX LAB in the plugin to connect your library.' },
          ].map(({ step, text }) => (
            <div
              key={step}
              style={{
                display: 'flex',
                gap: '20px',
                marginBottom: '16px',
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  color: '#ff2a1a',
                  minWidth: '24px',
                  marginTop: '1px',
                }}
              >
                {step}
              </span>
              <span style={{ fontSize: '13px', color: '#7a7570', lineHeight: 1.6 }}>
                {text}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
