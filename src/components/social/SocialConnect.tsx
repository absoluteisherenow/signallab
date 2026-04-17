'use client'
import { useState, useEffect, useCallback } from 'react'

interface SocialAccount {
  id: string
  platform: 'instagram' | 'twitter' | 'tiktok'
  handle: string
  token_expiry: number | null
  expiring_soon: boolean
  updated_at: string
}

const PLATFORMS = [
  {
    id: 'instagram' as const,
    label: 'Instagram',
    description: 'Post photos and reels',
    icon: '◈',
    color: '#ff2a1a',
    authPath: '/api/social/instagram/auth',
  },
  {
    id: 'twitter' as const,
    label: 'X / Twitter',
    description: 'Post threads and updates',
    icon: '✕',
    color: '#909090',
    authPath: '/api/social/twitter/auth',
  },
  {
    id: 'tiktok' as const,
    label: 'TikTok',
    description: 'Post short video content',
    icon: '▶',
    color: '#909090',
    authPath: '/api/social/tiktok/auth',
  },
]

export default function SocialConnect() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const loadAccounts = useCallback(async () => {
    const res = await fetch('/api/social/connected')
    const data = await res.json()
    setAccounts(data.accounts || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  // Listen for OAuth popup results
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data?.platform) return
      if (e.data.status === 'connected') {
        loadAccounts()
        setConnecting(null)
        // Auto-trigger deep dive when Instagram connects
        if (e.data.platform === 'instagram') {
          fetch('/api/instagram/deep-dive', { method: 'POST' }).catch(() => {})
        }
      } else if (e.data.status === 'error') {
        console.error('OAuth error:', e.data.reason)
        setConnecting(null)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [loadAccounts])

  function connectPlatform(platform: typeof PLATFORMS[number]) {
    setConnecting(platform.id)
    // Open OAuth as popup — stays inside Signal Lab OS
    window.open(
      platform.authPath,
      `connect_${platform.id}`,
      'width=600,height=700,left=200,top=100'
    )
  }

  async function disconnectAccount(platform: string, handle: string) {
    setDisconnecting(`${platform}:${handle}`)
    await fetch('/api/social/connected', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, handle }),
    })
    await loadAccounts()
    setDisconnecting(null)
  }

  const connectedPlatformIds = new Set(accounts.map(a => a.platform))

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div className="label" style={{ marginBottom: 12 }}>Connected Accounts</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          Connect your social accounts once — Signal Lab OS handles posting automatically.
          Your credentials are encrypted and stored securely.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dimmer)', fontSize: 12, padding: '20px 0' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border-dim)' }}>
          {PLATFORMS.map(platform => {
            const connected = accounts.filter(a => a.platform === platform.id)
            const isConnected = connectedPlatformIds.has(platform.id)
            const isConnecting = connecting === platform.id

            return (
              <div
                key={platform.id}
                style={{
                  background: 'var(--panel)',
                  padding: '24px 28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 24,
                }}
              >
                {/* Platform info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                  <div style={{
                    width: 36, height: 36,
                    border: `1px solid ${isConnected ? 'rgba(255,42,26,0.3)' : 'var(--border-dim)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14,
                    color: isConnected ? 'var(--gold)' : 'var(--text-dimmer)',
                    flexShrink: 0,
                  }}>
                    {platform.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, letterSpacing: '0.1em', color: isConnected ? 'var(--text)' : 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>
                      {platform.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>
                      {connected.length > 0
                        ? connected.map(a => (
                            <span key={a.handle} style={{ marginRight: 8 }}>
                              {a.handle}
                              {a.expiring_soon && (
                                <span style={{ color: '#c06060', marginLeft: 4, fontSize: 9 }}>· reconnect soon</span>
                              )}
                            </span>
                          ))
                        : platform.description
                      }
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isConnected && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f2f2f2' }} />
                      <span style={{ fontSize: 9, letterSpacing: '0.15em', color: '#f2f2f2', textTransform: 'uppercase' }}>Connected</span>
                    </div>
                  )}

                  <button
                    className="btn-secondary"
                    style={{ fontSize: 9, height: 30, padding: '0 14px' }}
                    onClick={() => connectPlatform(platform)}
                    disabled={isConnecting}
                  >
                    {isConnecting ? 'Opening...' : isConnected ? 'Reconnect' : 'Connect →'}
                  </button>

                  {connected.map(a => (
                    <button
                      key={a.handle}
                      onClick={() => disconnectAccount(a.platform, a.handle)}
                      disabled={disconnecting === `${a.platform}:${a.handle}`}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-dim)',
                        color: 'var(--text-dimmer)',
                        fontSize: 9,
                        height: 30,
                        padding: '0 10px',
                        cursor: 'pointer',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        fontFamily: 'var(--font-mono)',
                        borderRadius: 2,
                      }}
                    >
                      {disconnecting === `${a.platform}:${a.handle}` ? '...' : 'Remove'}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 10, color: 'var(--text-dimmer)', lineHeight: 1.8 }}>
        Connecting opens a small popup window over Signal Lab OS — you stay in the app.
        Signal Lab OS posts on your behalf using your connected accounts.
      </div>
    </div>
  )
}
