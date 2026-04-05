'use client'

import { useState } from 'react'

const C = {
  bg: '#070706',
  panel: '#0e0d0b',
  border: '#1a1917',
  borderMid: '#2e2c29',
  gold: '#b08d57',
  text: '#f0ebe2',
  dim: '#8a8780',
  dimmer: '#52504c',
}

const MODULES = [
  { num: '01', name: 'TOUR LAB', desc: 'Offers, advancing, rider management, travel logistics, invoicing, settlement — the full lifecycle of every show, in one place. Less admin, more music.' },
  { num: '02', name: 'BROADCAST LAB', desc: 'A content strategist that knows your voice. Writes captions that sound like you, schedules across platforms, spots trends worth using — and ignores the ones that aren\'t in your lane.' },
  { num: '03', name: 'SONIX LAB', desc: 'Hear what the numbers say. Frequency analysis, mix diagnostics, stem-level feedback — technical insight that sharpens your ear and your output.' },
  { num: '04', name: 'SET LAB', desc: 'Desktop app and web. Import from Rekordbox, analyse your sets, track what works, and discover underground music you haven\'t found yet. A DJ library that learns how you play.' },
  { num: '05', name: 'DROP LAB', desc: 'Release campaigns that build momentum — from first tease to long tail. Promo blasts, branded listening pages, tracked opens. Know exactly who played your record.' },
]

const ROLES = ['Artist', 'Manager / Agent', 'Label', 'Promoter / Booker']

export default function JoinPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setStatus('loading')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined, role: role || undefined }),
      })
      const json = await res.json()
      if (json.success) {
        setStatus('done')
      } else {
        setErrorMsg(json.error || 'Something went wrong.')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Could not connect. Try again.')
      setStatus('error')
    }
  }

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'DM Mono', monospace", minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(7,7,6,0.94)', borderBottom: `1px solid ${C.border}`,
        padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '11px', fontWeight: 300, letterSpacing: '0.2em', color: C.gold }}>
          SIGNAL LAB OS
        </div>
        <button
          onClick={() => scrollTo('apply')}
          style={{ background: 'none', border: 'none', color: C.gold, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: "'DM Mono', monospace", padding: 0 }}
        >
          Request Access →
        </button>
      </nav>

      {/* HERO */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '120px 24px 80px', textAlign: 'center',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: C.gold, textTransform: 'uppercase', marginBottom: '8px', whiteSpace: 'nowrap' }}>
          Tailored Artist OS For Electronic Music
        </div>

        <h1 style={{
          fontFamily: "'Unbounded', sans-serif",
          fontSize: 'clamp(28px, 5vw, 58px)',
          fontWeight: 300, letterSpacing: '0.03em',
          lineHeight: 1.1, marginBottom: '28px',
          maxWidth: '820px', margin: '0 auto 28px',
        }}>
          You handle the music. This handles everything else.
        </h1>

        <p style={{
          fontSize: '13px', color: C.dim, lineHeight: '1.9',
          maxWidth: '540px', letterSpacing: '0.04em', marginBottom: '52px',
        }}>
          One platform for gig planning, invoicing, tour logistics, release management, and DJ promo — built for how electronic music artists actually work.
        </p>

        <button
          onClick={() => scrollTo('modules')}
          style={{ background: 'none', border: 'none', color: C.gold, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: "'DM Mono', monospace", padding: 0 }}
        >
          See What's Inside ↓
        </button>
      </section>

      {/* SYSTEM STATEMENT */}
      <section style={{ padding: '80px 24px', borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
        <h2 style={{
          fontFamily: "'Unbounded', sans-serif",
          fontSize: 'clamp(20px, 3vw, 36px)',
          fontWeight: 300, letterSpacing: '0.04em',
          color: C.text, marginBottom: '20px',
        }}>
          Five modules. One system. Career infrastructure.
        </h2>
        <p style={{ fontSize: '13px', color: C.dim, letterSpacing: '0.04em', lineHeight: '1.8' }}>
          Everything is connected. A confirmed gig feeds your schedule. A release syncs your campaign. A tour updates your logistics. The system handles the infrastructure so you can focus on the work.
        </p>
      </section>

      {/* MODULE LIST */}
      <section id="modules" style={{ borderBottom: `1px solid ${C.border}` }}>
        {MODULES.map((mod, i) => (
          <div key={mod.name} style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '12px 32px',
            padding: '36px 24px',
            borderBottom: i < MODULES.length - 1 ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={{ fontSize: '10px', color: C.dimmer, letterSpacing: '0.08em', flexShrink: 0 }}>
              {mod.num}
            </div>
            <div style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: '12px', fontWeight: 300,
              letterSpacing: '0.18em', color: C.text,
              textTransform: 'uppercase', flexShrink: 0,
            }}>
              {mod.name}
            </div>
            <div style={{ fontSize: '12px', color: C.dim, letterSpacing: '0.03em', lineHeight: '1.7', width: '100%', paddingLeft: '0' }}>
              {mod.desc}
            </div>
          </div>
        ))}
      </section>

      {/* INTERSTITIAL — CONNECTED SYSTEM */}
      <section style={{ padding: '72px 24px', borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
        <h2 style={{
          fontFamily: "'Unbounded', sans-serif",
          fontSize: 'clamp(18px, 2.5vw, 28px)',
          fontWeight: 300, letterSpacing: '0.04em',
          color: C.text, marginBottom: '16px',
        }}>
          Less admin. More bandwidth.
        </h2>
        <p style={{ fontSize: '13px', color: C.dim, letterSpacing: '0.04em', lineHeight: '1.8', maxWidth: '480px', margin: '0 auto' }}>
          Every module shares context. Gig planning, logistics, invoicing, scheduling — handled in one place so the creative work stays yours.
        </p>
      </section>

      {/* PROOF STATEMENT */}
      <section style={{ padding: '80px 24px', borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
        <div style={{ width: '80px', height: '1px', background: C.gold, opacity: 0.4, margin: '0 auto 40px' }} />
        <h2 style={{
          fontFamily: "'Unbounded', sans-serif",
          fontSize: 'clamp(18px, 3vw, 30px)',
          fontWeight: 300, letterSpacing: '0.03em',
          color: C.text, maxWidth: '680px', margin: '0 auto 20px',
          lineHeight: 1.3,
        }}>
          It takes care of all the friction so you can concentrate on the music.
        </h2>
        <p style={{ fontSize: '12px', color: C.dim, letterSpacing: '0.04em', lineHeight: '1.8' }}>
          The planning, the invoices, the logistics, the scheduling — handled. Everything else is yours.
        </p>
      </section>

      {/* APPLY FORM */}
      <section id="apply" style={{ background: C.panel, padding: '80px 24px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: C.gold, textTransform: 'uppercase', marginBottom: '20px' }}>
            Early Access
          </div>

          {status === 'done' ? (
            <div style={{ border: `1px solid #3d6b4a`, padding: '40px 40px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: '#3d6b4a', textTransform: 'uppercase', marginBottom: '14px' }}>
                Access Requested
              </div>
              <div style={{ fontSize: '13px', color: C.text, lineHeight: '1.8' }}>
                You're on the list. We'll be in touch when we open more spaces.
              </div>
            </div>
          ) : (
            <>
              <h2 style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: 'clamp(18px, 3vw, 26px)',
                fontWeight: 300, letterSpacing: '0.03em',
                color: C.text, marginBottom: '12px',
              }}>
                Step inside.
              </h2>
              <p style={{ fontSize: '12px', color: C.dim, lineHeight: '1.8', marginBottom: '36px' }}>
                We onboard every artist personally. Drop your email and we'll be in touch.
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  style={{
                    background: C.bg, border: `1px solid ${C.borderMid}`,
                    color: C.text, padding: '14px 16px', fontSize: '12px',
                    fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em',
                    outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                />

                {status === 'error' && (
                  <div style={{ fontSize: '11px', color: '#c97a7a', letterSpacing: '0.04em' }}>{errorMsg}</div>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading' || !email}
                  style={{
                    background: status === 'loading' ? C.dimmer : C.gold,
                    color: C.bg, border: 'none',
                    padding: '14px 24px', marginTop: '4px',
                    fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
                    fontFamily: "'DM Mono', monospace", fontWeight: 'bold',
                    cursor: status === 'loading' || !email ? 'default' : 'pointer',
                    width: '100%',
                  }}
                >
                  {status === 'loading' ? 'Submitting…' : 'Request Early Access →'}
                </button>

                <div style={{ fontSize: '10px', color: C.dimmer, letterSpacing: '0.06em', textAlign: 'center', marginTop: '4px' }}>
                  Private beta · Personal onboarding · No spam
                </div>
              </form>
            </>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        padding: '32px 24px', borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: '10px', color: C.dimmer, letterSpacing: '0.08em',
      }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '10px', fontWeight: 300, letterSpacing: '0.14em' }}>
          SIGNAL LAB OS
        </div>
        <div>signallabos.com</div>
      </footer>

    </div>
  )
}
