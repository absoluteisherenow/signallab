'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('Enter your email and password'); return }
    setLoading(true)
    setError('')
    try {
      const { createBrowserClient } = await import('@supabase/auth-helpers-nextjs')
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const inputBase: React.CSSProperties = {
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #2a2825',
    color: '#f2f2f2',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontSize: 13,
    padding: '10px 0',
    outline: 'none',
    boxSizing: 'border-box',
    letterSpacing: '0.04em',
    transition: 'border-color 0.2s',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050505',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      padding: 40,
    }}>

      {/* Wordmark */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 22,
          fontWeight: 300,
          letterSpacing: '0.28em',
          color: '#f2f2f2',
          lineHeight: 1.2,
          marginBottom: 10,
        }}>
          NIGHT MANOEUVRES
        </div>
        {/* Gold rule */}
        <div style={{ width: 32, height: 1, background: '#ff2a1a', margin: '0 auto 10px' }} />
        <div style={{
          fontSize: 9,
          letterSpacing: '0.32em',
          color: '#909090',
          textTransform: 'uppercase',
        }}>
          Artist OS · Private Beta
        </div>
      </div>

      {/* Form */}
      <div style={{ width: '100%', maxWidth: 360 }}>

        <div style={{
          fontSize: 9,
          letterSpacing: '0.28em',
          color: '#ff2a1a',
          textTransform: 'uppercase',
          marginBottom: 32,
        }}>
          Sign in
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          <div>
            <div style={{ fontSize: 8, letterSpacing: '0.22em', color: '#3a3830', textTransform: 'uppercase', marginBottom: 6 }}>Email</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              style={inputBase}
              onFocus={e => (e.target.style.borderBottomColor = '#ff2a1a')}
              onBlur={e => (e.target.style.borderBottomColor = '#2a2825')}
            />
          </div>

          <div>
            <div style={{ fontSize: 8, letterSpacing: '0.22em', color: '#3a3830', textTransform: 'uppercase', marginBottom: 6 }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={inputBase}
              onFocus={e => (e.target.style.borderBottomColor = '#ff2a1a')}
              onBlur={e => (e.target.style.borderBottomColor = '#2a2825')}
            />
          </div>

          {error && (
            <div style={{ fontSize: 10, color: '#8a4a3a', letterSpacing: '0.06em', paddingTop: 2 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'transparent',
              border: '1px solid #ff2a1a',
              color: loading ? '#909090' : '#ff2a1a',
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 9,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              padding: '14px 24px',
              cursor: loading ? 'default' : 'pointer',
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = '#ff2a1a'; e.currentTarget.style.color = '#050505' } }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = loading ? '#909090' : '#ff2a1a' }}
          >
            {loading && (
              <div style={{ width: 8, height: 8, border: '1px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            )}
            {loading ? 'Please wait' : 'Sign in →'}
          </button>
        </form>

        {/* Waitlist link */}
        <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid #131210', textAlign: 'center' }}>
          <a
            href="/waitlist"
            style={{
              color: '#3a3830',
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 10,
              letterSpacing: '0.08em',
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#909090')}
            onMouseLeave={e => (e.currentTarget.style.color = '#3a3830')}
          >
            Request access →
          </a>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
