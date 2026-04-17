'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type Mode = 'signin' | 'signup' | 'reset'

export default function Login() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/today'

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!email) { setError('Enter your email'); return }

    if (mode === 'reset') {
      setLoading(true)
      try {
        const { createBrowserClient } = await import('@supabase/auth-helpers-nextjs')
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        })
        if (error) throw error
        setSuccess('Check your email for a password reset link')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to send reset email')
      } finally {
        setLoading(false)
      }
      return
    }

    if (!password) { setError('Enter your password'); return }

    if (mode === 'signup') {
      if (password.length < 8) { setError('Password must be at least 8 characters'); return }
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
    }

    setLoading(true)
    try {
      const { createBrowserClient } = await import('@supabase/auth-helpers-nextjs')
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push(next)
        router.refresh()
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
          },
        })
        if (error) throw error
        setSuccess('Check your email to confirm your account, then sign in')
        setMode('signin')
        setPassword('')
        setConfirmPassword('')
      }
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
    fontSize: 13,
    padding: '10px 0',
    outline: 'none',
    boxSizing: 'border-box',
    letterSpacing: '0.04em',
    transition: 'border-color 0.2s',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 8,
    letterSpacing: '0.22em',
    color: '#3a3830',
    textTransform: 'uppercase',
    fontWeight: 700,
    marginBottom: 6,
  }

  const linkStyle: React.CSSProperties = {
    color: '#3a3830',
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    transition: 'color 0.15s',
  }

  const modeLabel = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'
  const buttonLabel = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050505',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    }}>

      {/* Wordmark */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.035em',
          textTransform: 'uppercase',
          color: '#f2f2f2',
          lineHeight: 0.9,
          marginBottom: 10,
        }}>
          Signal Lab
        </div>
        <div style={{ width: 32, height: 1, background: '#ff2a1a', margin: '0 auto 10px' }} />
        <div style={{
          fontSize: 9,
          letterSpacing: '0.22em',
          color: '#909090',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}>
          Artist OS
        </div>
      </div>

      {/* Form */}
      <div style={{ width: '100%', maxWidth: 360 }}>

        <div style={{
          fontSize: 9,
          letterSpacing: '0.22em',
          color: '#ff2a1a',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 32,
        }}>
          {modeLabel}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          <div>
            <div style={labelStyle}>Email</div>
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

          {mode !== 'reset' && (
            <div>
              <div style={labelStyle}>Password</div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                style={inputBase}
                onFocus={e => (e.target.style.borderBottomColor = '#ff2a1a')}
                onBlur={e => (e.target.style.borderBottomColor = '#2a2825')}
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <div style={labelStyle}>Confirm password</div>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                style={inputBase}
                onFocus={e => (e.target.style.borderBottomColor = '#ff2a1a')}
                onBlur={e => (e.target.style.borderBottomColor = '#2a2825')}
              />
            </div>
          )}

          {error && (
            <div style={{ fontSize: 10, color: '#8a4a3a', letterSpacing: '0.06em', paddingTop: 2 }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ fontSize: 10, color: '#4a8a5a', letterSpacing: '0.06em', paddingTop: 2 }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'transparent',
              border: '1px solid #ff2a1a',
              color: loading ? '#909090' : '#ff2a1a',
              fontSize: 9,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              fontWeight: 700,
              borderRadius: 0,
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
            {loading ? 'Please wait' : `${buttonLabel} \u2192`}
          </button>
        </form>

        {/* Mode switchers */}
        <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid #131210', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>

          {mode === 'signin' && (
            <>
              <button
                onClick={() => { setMode('signup'); setError(''); setSuccess('') }}
                style={linkStyle}
                onMouseEnter={e => (e.currentTarget.style.color = '#909090')}
                onMouseLeave={e => (e.currentTarget.style.color = '#3a3830')}
              >
                Create an account
              </button>
              <button
                onClick={() => { setMode('reset'); setError(''); setSuccess('') }}
                style={linkStyle}
                onMouseEnter={e => (e.currentTarget.style.color = '#909090')}
                onMouseLeave={e => (e.currentTarget.style.color = '#3a3830')}
              >
                Forgot password?
              </button>
            </>
          )}

          {mode === 'signup' && (
            <button
              onClick={() => { setMode('signin'); setError(''); setSuccess('') }}
              style={linkStyle}
              onMouseEnter={e => (e.currentTarget.style.color = '#909090')}
              onMouseLeave={e => (e.currentTarget.style.color = '#3a3830')}
            >
              Already have an account? Sign in
            </button>
          )}

          {mode === 'reset' && (
            <button
              onClick={() => { setMode('signin'); setError(''); setSuccess('') }}
              style={linkStyle}
              onMouseEnter={e => (e.currentTarget.style.color = '#909090')}
              onMouseLeave={e => (e.currentTarget.style.color = '#3a3830')}
            >
              Back to sign in
            </button>
          )}

          {mode !== 'reset' && (
            <a
              href="/waitlist"
              style={linkStyle}
              onMouseEnter={e => (e.currentTarget.style.color = '#909090')}
              onMouseLeave={e => (e.currentTarget.style.color = '#3a3830')}
            >
              Request access
            </a>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
