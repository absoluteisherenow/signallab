'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const MODULES = [
  {
    id: 'broadcast',
    title: 'Signal Lab',
    subtitle: 'Broadcast Intelligence',
    desc: 'AI-powered tone profiles, reference artist analysis, caption generation. Three variants (Safe, Loose, Raw) tuned to your exact voice.',
    href: '/broadcast',
    icon: '📡',
  },
  {
    id: 'logistics',
    title: 'Tour Lab',
    subtitle: 'Gig Management',
    desc: 'All your shows in one place. Invoicing, contracts, advance requests, logistics briefs. Replaces Advancers + spreadsheets.',
    href: '/logistics',
    icon: '🎪',
  },
  {
    id: 'sonix',
    title: 'Sonix Lab',
    subtitle: 'Music Production',
    desc: 'Chord engine, arrangement AI, 18 mixdown chains. Connects to Ableton Live via Max for Live devices.',
    href: '/sonix',
    icon: '🎛️',
  },
  {
    id: 'setlab',
    title: 'Set Lab',
    subtitle: 'DJ Intelligence',
    desc: 'Camelot-aware set builder, energy arc visualizer, AI narrative analysis. Rekordbox sync. Better than Mixed In Key.',
    href: '/setlab',
    icon: '🎵',
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
        // Quick check for auth state via API
        const res = await fetch('/api/settings')
        if (res.ok) {
          // User is authenticated, redirect to dashboard
          router.push('/dashboard')
        }
      } catch (err) {
        // Not authenticated, show landing page
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
        setTimeout(() => setSubmitted(false), 3000)
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
          background:
            scrollY > 50 ? `rgba(7,7,6,0.92)` : 'transparent',
          borderBottom:
            scrollY > 50 ? `1px solid ${COLORS.border}` : 'none',
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
              fontSize: '12px',
              fontWeight: 300,
              letterSpacing: '0.25em',
              color: COLORS.gold,
            }}
          >
            NIGHT MANOEUVRES
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
            Get started →
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
          The Creative Business OS
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
          The Modular Suite for Electronic Artists
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
          Touring. Content. Production. All connected.
        </p>

        <p
          style={{
            fontSize: '13px',
            color: COLORS.textDim,
            lineHeight: '1.8',
            maxWidth: '620px',
            letterSpacing: '0.04em',
            marginBottom: '48px',
          }}
        >
          Four integrated modules. One subscription. Everything an independent electronic music artist needs to run a serious career — without context switching.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '40px' }}>
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
            Get Started →
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
            See Demo →
          </Link>
        </div>

        <div
          style={{
            fontSize: '10px',
            color: COLORS.textDimmer,
            letterSpacing: '0.08em',
          }}
        >
          No credit card required · Private beta
        </div>
      </section>

      {/* FEATURES GRID */}
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
            The suite
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
            Four modules. <br />
            Infinite possibilities.
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
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
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#141310'
                  e.currentTarget.style.borderColor = COLORS.gold + '40'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = COLORS.panel
                  e.currentTarget.style.borderColor = COLORS.border
                }}
              >
                <div
                  style={{
                    fontSize: '32px',
                    marginBottom: '16px',
                    lineHeight: 1,
                  }}
                >
                  {module.icon}
                </div>

                <h3
                  style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: COLORS.gold,
                    marginBottom: '4px',
                    letterSpacing: '0.08em',
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
                    color: COLORS.gold,
                    textTransform: 'uppercase',
                  }}
                >
                  Explore →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* WAITLIST */}
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
            Join the waitlist.
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
            Early access to all four modules. Current users get priority beta access plus dedicated onboarding.
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
              ✓ You're on the list — we'll be in touch
            </div>
          )}

          <div
            style={{
              fontSize: '10px',
              color: COLORS.textDimmer,
              letterSpacing: '0.1em',
            }}
          >
            No spam, ever.
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
          NIGHT MANOEUVRES
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
            href="#pricing"
            style={{
              color: COLORS.textDim,
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.gold)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
          >
            Pricing
          </a>
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
          © 2026 Night Manoeuvres · Private Beta
        </div>
      </footer>
    </div>
  )
}
