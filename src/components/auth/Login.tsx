'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('Please enter email and password'); return }
    setLoading(true)
    setError('')
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  // Demo bypass
  function demoLogin() {
    router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: s.font, padding: '40px' }}>

      {/* LOGO */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '18px', fontWeight: 200, letterSpacing: '0.25em', color: s.gold, lineHeight: 1.3, marginBottom: '6px' }}>
          NIGHT MANOEUVRES
        </div>
        <div style={{ fontSize: '8px', letterSpacing: '0.3em', color: s.dimmer, textTransform: 'uppercase' }}>
          The Modular Suite
        </div>
      </div>

      {/* FORM */}
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '40px' }}>

          <div style={{ fontSize: '9px', letterSpacing: '0.25em', color: s.gold, textTransform: 'uppercase', marginBottom: '28px' }}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Email</div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '12px 16px', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = s.gold + '60'}
                onBlur={e => e.target.style.borderColor = s.border}
              />
            </div>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Password</div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{ width: '100%', background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '12px 16px', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = s.gold + '60'}
                onBlur={e => e.target.style.borderColor = s.border}
              />
            </div>

            {error && (
              <div style={{ fontSize: '11px', color: '#8a4a3a', padding: '10px 14px', border: '1px solid #4a2a1a', background: '#1a0a06' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ background: s.gold, color: '#070706', border: 'none', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '15px', cursor: 'pointer', marginTop: '8px', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
            >
              {loading && <div style={{ width: '10px', height: '10px', border: `1px solid #070706`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in →' : 'Create account →'}
            </button>
          </form>

          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${s.border}`, textAlign: 'center' }}>
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
              style={{ background: 'transparent', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.08em', cursor: 'pointer' }}
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>

        {/* DEMO ACCESS */}
        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <button
            onClick={demoLogin}
            style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 28px', cursor: 'pointer', width: '100%', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = s.dim; e.currentTarget.style.borderColor = s.dimmer }}
            onMouseLeave={e => { e.currentTarget.style.color = s.dimmer; e.currentTarget.style.borderColor = s.border }}
          >
            Demo — enter without account
          </button>
          <div style={{ fontSize: '10px', color: '#1a1917', marginTop: '10px', letterSpacing: '0.08em' }}>Private beta · v0.1</div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
