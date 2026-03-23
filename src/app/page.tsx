'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const MODULES = [
  {
    id: 'signal',
    title: 'Signal Lab',
    subtitle: 'Content Intelligence',
    desc: 'AI-powered tone profiles and reference artist analysis. Three caption variants (Safe, Loose, Raw) tuned to your exact voice. Direct publishing to Instagram, TikTok, Threads.',
    href: '/broadcast',
    color: '#3d6b4a',
  },
  {
    id: 'tour',
    title: 'Tour Lab',
    subtitle: 'Tour Operations',
    desc: 'All your shows in one place. Gig management, invoicing, contract tracking, advance requests, and logistics briefs. Replaces spreadsheets + Advancers.',
    href: '/logistics',
    color: '#b08d57',
  },
  {
    id: 'sonix',
    title: 'Sonix Lab',
    subtitle: 'Music Production AI',
    desc: 'Chord suggestions, arrangement mapping, 18 professional mixdown chains. Native Max for Live integration with Ableton Live. Track analysis and recommendations.',
    href: '/sonix',
    color: '#6a7a9a',
  },
  {
    id: 'set',
    title: 'Set Lab',
    subtitle: 'DJ Tools',
    desc: 'Camelot-aware set builder with energy arc visualization. Rekordbox sync, BPM detection, harmonic flow analysis. Better than Mixed In Key.',
    href: '/setlab',
    color: '#9a6a5a',
  },
]

const COLORS = {
  bg: '#070706',
  panel: '#0e0d0b',
  border: '#1a1917',
  borderMid: '#2e2c29',
  gold: '#b08d57',
  text: '#f0ebe2',
  textDim: '#8a8780',
  textDimmer: '#52504c',
  dimmest: '#2e2c29',
  green: '#3d6b4a',
  blue: '#6a7a9a',
  redBrown: '#9a6a5a',
}

export default function HomePage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [isChecking, setIsChecking] = useState(true)

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          router.push('/dashboard')
        }
      } catch (err) {
        // Not authenticated
      } finally {
        setIsChecking(false)
      }
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.success) {
        setSubmitted(true)
        setEmail('')
        setTimeout(() => setSubmitted(false), 3500)
      }
    } catch (err) {
      console.error('Waitlist error:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isChecking) {
    return (
      <div style={{ background: COLORS.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: COLORS.textDim, fontFamily: "'DM Mono', monospace", fontSize: '13px' }}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Mono', monospace", minHeight: '100vh' }}>
      {/* NAV */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: scrollY > 50 ? `rgba(7,7,6,0.92)` : 'transparent',
          borderBottom: scrollY > 50 ? `1px solid ${COLORS.border}` : 'none',
          padding: '20px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.2s ease',
          backdropFilter: scrollY > 50 ? 'blur(8px)' : 'none',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: '11px',
              fontWeight: 300,
              letterSpacing: '0.2em',
              color: COLORS.gold,
            }}
          >
            THE MODULAR SUITE
          </div>
        </div>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <Link
            href="/login"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: COLORS.textDim,
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.gold)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
          >
            Sign in
          </Link>
          <Link
            href="/login"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              background: COLORS.gold,
              color: COLORS.bg,
              padding: '10px 20px',
              textDecoration: 'none',
              border: `1px solid ${COLORS.gold}`,
              transition: 'all 0.15s',
            }}
          >
            Get Access →
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '120px 48px 80px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '9px',
            letterSpacing: '0.3em',
            color: COLORS.gold,
            textTransform: 'uppercase',
            marginBottom: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          <span
            style={{
              display: 'block',
              width: '32px',
              height: '1px',
              background: COLORS.gold,
            }}
          />
          Professional tools for artists
          <span
            style={{
              display: 'block',
              width: '32px',
              height: '1px',
              background: COLORS.gold,
            }}
          />
        </div>

        <h1
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: 'clamp(32px, 5vw, 72px)',
            fontWeight: 200,
            letterSpacing: '0.04em',
            lineHeight: 1.1,
            marginBottom: '20px',
            maxWidth: '900px',
          }}
        >
          The Operating System for Electronic Music Artists
        </h1>

        <p
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: 'clamp(14px, 2vw, 20px)',
            fontWeight: 200,
            color: COLORS.gold,
            marginBottom: '40px',
            letterSpacing: '0.05em',
            fontStyle: 'italic',
          }}
        >
          Tour, create, and grow — all in one modular system
        </p>

        <p
          style={{
            fontSize: '13px',
            color: COLORS.textDim,
            lineHeight: '1.8',
            maxWidth: '640px',
            letterSpacing: '0.04em',
            marginBottom: '48px',
          }}
        >
          Four professional-grade modules: content intelligence, tour operations, production AI, and DJ tools. Built for electronic artists. Designed for professionals.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            href="/login"
            style={{
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              background: COLORS.gold,
              color: COLORS.bg,
              padding: '16px 40px',
              textDecoration: 'none',
              border: `1px solid ${COLORS.gold}`,
              transition: 'all 0.15s',
              cursor: 'pointer',
            }}
          >
            Get Access →
          </Link>
          <Link
            href="/dashboard"
            style={{
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              background: 'transparent',
              color: COLORS.textDim,
              padding: '16px 40px',
              textDecoration: 'none',
              border: `1px solid ${COLORS.border}`,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = COLORS.gold
              e.currentTarget.style.borderColor = COLORS.gold
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = COLORS.textDim
              e.currentTarget.style.borderColor = COLORS.border
            }}
          >
            Explore Features →
          </Link>
        </div>

        <div
          style={{
            fontSize: '10px',
            color: COLORS.textDimmer,
            letterSpacing: '0.08em',
          }}
        >
          Private beta · Limited availability
        </div>
      </section>

      {/* MODULES GRID */}
      <section
        style={{
          padding: '80px 48px',
          borderTop: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div
            style={{
              fontSize: '9px',
              letterSpacing: '0.3em',
              color: COLORS.gold,
              textTransform: 'uppercase',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                display: 'block',
                width: '24px',
                height: '1px',
                background: COLORS.gold,
              }}
            />
            Four modules
          </div>

          <h2
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: 'clamp(24px, 3vw, 40px)',
              fontWeight: 200,
              letterSpacing: '0.04em',
              marginBottom: '60px',
              lineHeight: 1.2,
            }}
          >
            Everything you need <br />
            in one professional suite
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '2px',
            }}
          >
            {MODULES.map((module) => (
              <Link
                key={module.id}
                href={module.href}
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  padding: '40px 32px',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#141310'
                  e.currentTarget.style.borderColor = module.color + '40'
                  const top = e.currentTarget.querySelector('[data-accent]') as HTMLElement
                  if (top) top.style.opacity = '1'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = COLORS.panel
                  e.currentTarget.style.borderColor = COLORS.border
                  const top = e.currentTarget.querySelector('[data-accent]') as HTMLElement
                  if (top) top.style.opacity = '0.3'
                }}
              >
                <div
                  data-accent
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: module.color,
                    opacity: 0.3,
                    transition: 'opacity 0.2s',
                  }}
                />

                <h3
                  style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: module.color,
                    marginBottom: '4px',
                    letterSpacing: '0.08em',
                    marginTop: '8px',
                  }}
                >
                  {module.title}
                </h3>

                <div
                  style={{
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    color: COLORS.textDimmer,
                    textTransform: 'uppercase',
                    marginBottom: '16px',
                  }}
                >
                  {module.subtitle}
                </div>

                <p
                  style={{
                    fontSize: '12px',
                    color: COLORS.textDim,
                    lineHeight: '1.7',
                    marginBottom: '24px',
                    flex: 1,
                    letterSpacing: '0.02em',
                  }}
                >
                  {module.desc}
                </p>

                <div
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.12em',
                    color: module.color,
                    textTransform: 'uppercase',
                  }}
                >
                  Learn more →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* EARLY ACCESS */}
      <section style={{ padding: '80px 48px' }}>
        <div
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: 'clamp(24px, 3vw, 40px)',
              fontWeight: 200,
              letterSpacing: '0.04em',
              marginBottom: '20px',
              lineHeight: 1.2,
            }}
          >
            Join Early Access
          </h2>

          <p
            style={{
              fontSize: '13px',
              color: COLORS.textDim,
              lineHeight: '1.8',
              marginBottom: '40px',
              letterSpacing: '0.03em',
            }}
          >
            Limited spots available. Early access includes full feature access, dedicated onboarding, and priority support for the next 6 months.
          </p>

          {!submitted ? (
            <form
              onSubmit={handleWaitlist}
              style={{
                display: 'flex',
                gap: '0',
                marginBottom: '16px',
              }}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{
                  flex: 1,
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRight: 'none',
                  color: COLORS.text,
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '13px',
                  padding: '14px 20px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  background: isSubmitting ? COLORS.textDimmer : COLORS.gold,
                  color: isSubmitting ? COLORS.textDimmer : COLORS.bg,
                  border: 'none',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '14px 32px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  opacity: isSubmitting ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {isSubmitting ? 'Joining...' : 'Join →'}
              </button>
            </form>
          ) : (
            <div
              style={{
                fontSize: '13px',
                color: COLORS.gold,
                letterSpacing: '0.08em',
                padding: '16px 32px',
                border: `1px solid ${COLORS.gold}30`,
                background: COLORS.gold + '08',
                marginBottom: '16px',
              }}
            >
              ✓ Confirmed — you're on the list
            </div>
          )}

          <div
            style={{
              fontSize: '10px',
              color: COLORS.textDimmer,
              letterSpacing: '0.1em',
            }}
          >
            No spam. We'll notify you when access is available.
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          padding: '40px 48px',
          borderTop: `1px solid ${COLORS.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '32px',
        }}
      >
        <div
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: '11px',
            fontWeight: 300,
            letterSpacing: '0.15em',
            color: COLORS.textDimmer,
          }}
        >
          THE MODULAR SUITE
        </div>

        <div
          style={{
            display: 'flex',
            gap: '32px',
            fontSize: '10px',
            letterSpacing: '0.1em',
          }}
        >
          <a
            href="https://github.com/absoluteisherenow/signallab"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: COLORS.textDim,
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.gold)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
          >
            GitHub
          </a>
        </div>

        <div
          style={{
            fontSize: '10px',
            color: COLORS.textDimmer,
            letterSpacing: '0.08em',
          }}
        >
          © 2026 · Private Beta
        </div>
      </footer>
    </div>
  )
}
