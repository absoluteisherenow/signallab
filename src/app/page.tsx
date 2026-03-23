'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const MODULES = [
  {
    id: 'signal',
    name: 'Signal Lab',
    tag: 'Touring OS',
    desc: 'Gig management, contracts, invoicing, advance requests, and logistics — all connected to a single show record.',
    color: '#b08d57',
    features: ['Automated advance requests', 'Contract + invoice generation', 'Gig logistics briefs', 'Expense tracking'],
  },
  {
    id: 'broadcast',
    name: 'Broadcast Lab',
    tag: 'Content Intelligence',
    desc: 'AI caption generation tuned to your exact tone. Reference artist analysis, trend detection, Buffer publishing.',
    color: '#3d6b4a',
    features: ['Tone profile from reference artists', 'Safe / Loose / Raw variants', 'Post to Instagram, TikTok, Threads', 'Intelligent media scanner'],
  },
  {
    id: 'sonix',
    name: 'Sonix Lab',
    tag: 'Creative Co-pilot',
    desc: 'Chord engine, arrangement AI, 18 mixdown chains. Connects to Ableton via Max for Live devices.',
    color: '#6a7a9a',
    features: ['Chord + melody assist', 'Arrangement mapping', '18 mixdown chains', 'Max for Live integration'],
  },
  {
    id: 'setlab',
    name: 'SetLab',
    tag: 'DJ Intelligence',
    desc: 'Camelot-aware set builder, energy arc visualiser, AI narrative analysis. Better than Mixed In Key.',
    color: '#9a6a5a',
    features: ['Camelot compatibility scoring', 'Energy arc visualiser', 'AI set narrative', 'Rekordbox export'],
  },
]

const PRICING = [
  {
    name: 'Artist',
    price: '£29',
    period: '/month',
    desc: 'For independent artists managing their own career',
    features: [
      'Signal Lab — unlimited gigs',
      'Broadcast Lab — 30 captions/month',
      'SetLab — unlimited tracks',
      'Advance request forms',
      'Buffer publishing',
      'Supabase persistence',
    ],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '£59',
    period: '/month',
    desc: 'For serious artists and their teams',
    features: [
      'Everything in Artist',
      'Sonix Lab — unlimited',
      'Max for Live devices',
      'Broadcast Lab — unlimited',
      'Intelligent media scanner',
      'Gmail integration',
      'PDF advance sheets',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Agency',
    price: '£99',
    period: '/month',
    desc: 'For management companies and booking agents',
    features: [
      'Everything in Pro',
      'Up to 10 artist profiles',
      'Roster dashboard',
      'Agency-branded advance forms',
      'Cross-artist analytics',
      'Dedicated onboarding',
      'Custom integrations',
    ],
    cta: 'Talk to us',
    highlight: false,
  },
  {
    name: 'Management',
    price: '£249',
    period: '/mo',
    desc: 'For agencies and management companies',
    features: ['Everything in Agency', 'Up to 10 artist profiles', 'Roster analytics dashboard', 'Branded advance forms', 'Dedicated onboarding call'],
    cta: 'Talk to us',
    highlight: false,
  },
]

const STATS = [
  { value: '4', label: 'modules in one subscription' },
  { value: '£59', label: 'per month all-in' },
  { value: '3×', label: 'more content posted by Pro users' },
  { value: '18', label: 'mixdown chains in Sonix Lab' },
]

export default function LandingPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [activeModule, setActiveModule] = useState(0)
  const [scrollY, setScrollY] = useState(0)
  const heroRef = useRef<HTMLDivElement>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          // Redirect to dashboard if authenticated
          router.push('/dashboard')
        }
      } catch (err) {
        console.error('Auth check failed:', err)
      } finally {
        setIsCheckingAuth(false)
      }
    }
    checkAuth()
  }, [router, supabase])

  useEffect(() => {
    const handle = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handle)
    return () => window.removeEventListener('scroll', handle)
  }, [])

  // Rotate modules
  useEffect(() => {
    const t = setInterval(() => setActiveModule(m => (m + 1) % MODULES.length), 3000)
    return () => clearInterval(t)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  const s = {
    bg: '#070706',
    panel: '#0e0d0b',
    border: '#2e2c29',
    gold: '#b08d57',
    text: '#f0ebe2',
    textDim: '#8a8780',
    textDimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  if (isCheckingAuth) {
    return (
      <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '13px', color: s.textDim }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrollY > 50 ? 'rgba(7,7,6,0.95)' : 'transparent',
        borderBottom: scrollY > 50 ? `1px solid ${s.border}` : '1px solid transparent',
        padding: '20px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'all 0.3s ease',
        backdropFilter: scrollY > 50 ? 'blur(12px)' : 'none',
      }}>
        <div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '14px', fontWeight: 300, letterSpacing: '0.2em', color: s.gold }}>
            THE MODULAR SUITE
          </div>
          <div style={{ fontSize: '8px', letterSpacing: '0.25em', color: s.textDimmer, marginTop: '2px' }}>BY NIGHT MANOEUVRES</div>
        </div>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          {['Signal Lab', 'Broadcast Lab', 'Sonix Lab', 'SetLab', 'Pricing'].map(item => (
            <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} style={{ fontSize: '10px', letterSpacing: '0.12em', color: s.textDim, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = s.text)}
              onMouseLeave={e => (e.currentTarget.style.color = s.textDim)}>
              {item}
            </a>
          ))}
          <a href="/gigs" style={{
            fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
            background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
            border: `1px solid ${s.gold}`,
            color: s.gold, padding: '10px 20px', textDecoration: 'none',
            transition: 'all 0.2s',
          }}>
            Enter app →
          </a>
        </div>
      </nav>

      {/* HERO */}
      <div ref={heroRef} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px 48px 80px', textAlign: 'center', position: 'relative' }}>

        {/* Grain overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.03\'/%3E%3C/svg%3E")', pointerEvents: 'none' }} />

        <div style={{ fontSize: '10px', letterSpacing: '0.4em', color: s.gold, textTransform: 'uppercase', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
          The creative business OS for electronic music artists
          <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
        </div>

        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(36px, 6vw, 80px)', fontWeight: 200, letterSpacing: '0.05em', lineHeight: 1.1, marginBottom: '24px', maxWidth: '900px' }}>
          The Modular Suite
        </h1>

        <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 'clamp(16px, 2vw, 22px)', color: s.gold, marginBottom: '24px', letterSpacing: '0.04em' }}>
          Signal Lab · Broadcast Lab · Sonix Lab · SetLab
        </div>

        <p style={{ fontSize: '14px', color: s.textDim, lineHeight: '1.9', maxWidth: '580px', letterSpacing: '0.05em', marginBottom: '48px' }}>
          Four integrated modules. One subscription. Everything an independent electronic music artist needs to run a serious touring career, create content, make music, and build a DJ practice — without switching apps.
        </p>

        {/* CTA */}
        {!submitted ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0', marginBottom: '16px', width: '100%', maxWidth: '440px' }}>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="your@email.com"
              style={{ flex: 1, background: s.panel, border: `1px solid ${s.border}`, borderRight: 'none', color: s.text, fontFamily: s.font, fontSize: '13px', padding: '14px 20px', outline: 'none' }} />
            <button type="submit" style={{
              background: s.gold, color: s.bg, border: 'none',
              fontFamily: s.font, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase',
              padding: '14px 24px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              Join waitlist →
            </button>
          </form>
        ) : (
          <div style={{ fontSize: '13px', color: s.gold, letterSpacing: '0.1em', marginBottom: '16px', padding: '16px 32px', border: `1px solid ${s.gold}30` }}>
            You're on the list — we'll be in touch.
          </div>
        )}
        <div style={{ fontSize: '10px', color: s.textDimmer, letterSpacing: '0.1em' }}>Currently in private beta · No credit card required</div>

        {/* Scroll hint */}
        <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: s.textDimmer, textTransform: 'uppercase' }}>Scroll</div>
          <div style={{ width: '1px', height: '40px', background: `linear-gradient(180deg, ${s.textDimmer}, transparent)` }} />
        </div>
      </div>

      {/* STATS */}
      <div style={{ padding: '80px 48px', borderTop: `1px solid ${s.border}`, borderBottom: `1px solid ${s.border}` }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0' }}>
          {STATS.map((stat, i) => (
            <div key={stat.label} style={{ padding: '0 40px', borderRight: i < 3 ? `1px solid ${s.border}` : 'none', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '40px', fontWeight: 200, color: s.gold, letterSpacing: '0.05em', marginBottom: '8px' }}>{stat.value}</div>
              <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: s.textDim, textTransform: 'uppercase' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MODULES */}
      <div id="signal-lab" style={{ padding: '120px 48px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
            The suite
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 200, letterSpacing: '0.05em', marginBottom: '64px', lineHeight: 1.2 }}>
            Four modules.<br />One product.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px' }}>
            {MODULES.map((mod, i) => (
              <div key={mod.id} style={{
                background: activeModule === i ? '#1a1917' : s.panel,
                border: `1px solid ${activeModule === i ? mod.color + '60' : s.border}`,
                padding: '40px 44px',
                transition: 'all 0.4s ease',
                cursor: 'default',
              }}
                onMouseEnter={() => setActiveModule(i)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '20px', fontWeight: 200, letterSpacing: '0.1em', color: activeModule === i ? mod.color : s.textDim }}>{mod.name}</div>
                  <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: mod.color, textTransform: 'uppercase', padding: '4px 10px', border: `1px solid ${mod.color}40` }}>{mod.tag}</div>
                </div>
                <p style={{ fontSize: '13px', color: s.textDim, lineHeight: '1.8', letterSpacing: '0.04em', marginBottom: '24px' }}>{mod.desc}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {mod.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11px', color: s.textDimmer, letterSpacing: '0.06em' }}>
                      <span style={{ color: mod.color, opacity: 0.6 }}>→</span>{f}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ADVANCERS REPLACEMENT */}
      <div style={{ padding: '80px 48px', background: '#0a0906', borderTop: `1px solid ${s.border}`, borderBottom: `1px solid ${s.border}` }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>The commercial case</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(20px, 2.5vw, 32px)', fontWeight: 200, letterSpacing: '0.05em', marginBottom: '24px', lineHeight: 1.3 }}>
            Advancers charges £150 per show.<br />The Modular Suite costs £59 per month.
          </div>
          <p style={{ fontSize: '13px', color: s.textDim, lineHeight: '1.9', letterSpacing: '0.04em', marginBottom: '32px' }}>
            At 20 shows a year, that's £3,000 vs £708. The Modular Suite does everything Advancers does — advance requests, logistics sheets, promoter forms — plus content, invoicing, music production, and DJ intelligence.
          </p>
          <div style={{ display: 'inline-block', fontSize: '10px', letterSpacing: '0.15em', color: s.gold, textTransform: 'uppercase', padding: '14px 32px', border: `1px solid ${s.gold}40`, background: `${s.gold}08` }}>
            The maths is obvious
          </div>
        </div>
      </div>

      {/* PRICING */}
      <div id="pricing" style={{ padding: '120px 48px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
            Pricing
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 200, letterSpacing: '0.05em', marginBottom: '64px' }}>
            Simple, honest pricing.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
            {PRICING.map(tier => (
              <div key={tier.name} style={{
                background: tier.highlight ? '#1a1410' : s.panel,
                border: `1px solid ${tier.highlight ? s.gold : s.border}`,
                padding: '40px 40px',
                position: 'relative',
                boxShadow: tier.highlight ? `0 0 40px ${s.gold}15` : 'none',
              }}>
                {tier.highlight && (
                  <div style={{ position: 'absolute', top: '-1px', left: '40px', right: '40px', height: '2px', background: s.gold }} />
                )}
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: tier.highlight ? s.gold : s.textDimmer, textTransform: 'uppercase', marginBottom: '16px' }}>{tier.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '36px', fontWeight: 200, color: s.text }}>{tier.price}</div>
                  <div style={{ fontSize: '12px', color: s.textDim }}>{tier.period}</div>
                </div>
                <div style={{ fontSize: '11px', color: s.textDim, marginBottom: '32px', lineHeight: '1.6' }}>{tier.desc}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '36px' }}>
                  {tier.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: '10px', fontSize: '11px', color: s.textDim, letterSpacing: '0.05em' }}>
                      <span style={{ color: s.gold, opacity: 0.6, flexShrink: 0 }}>→</span>{f}
                    </div>
                  ))}
                </div>
                <button style={{
                  width: '100%',
                  background: tier.highlight ? s.gold : 'transparent',
                  color: tier.highlight ? s.bg : s.gold,
                  border: `1px solid ${s.gold}`,
                  fontFamily: s.font,
                  fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase',
                  padding: '14px', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}>
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER CTA */}
      <div style={{ padding: '120px 48px', borderTop: `1px solid ${s.border}`, textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 200, letterSpacing: '0.05em', marginBottom: '24px', lineHeight: 1.2 }}>
            Your career.<br />One system.
          </div>
          <p style={{ fontSize: '13px', color: s.textDim, lineHeight: '1.9', marginBottom: '48px', letterSpacing: '0.04em' }}>
            Join the waitlist for early access. Currently in private beta with a small group of artists and management companies.
          </p>
          {!submitted ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0', maxWidth: '400px', margin: '0 auto' }}>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="your@email.com"
                style={{ flex: 1, background: s.panel, border: `1px solid ${s.border}`, borderRight: 'none', color: s.text, fontFamily: s.font, fontSize: '13px', padding: '14px 20px', outline: 'none' }} />
              <button type="submit" style={{ background: s.gold, color: s.bg, border: 'none', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '14px 24px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Join →
              </button>
            </form>
          ) : (
            <div style={{ fontSize: '13px', color: s.gold, letterSpacing: '0.1em', padding: '16px 32px', border: `1px solid ${s.gold}30`, display: 'inline-block' }}>
              You're on the list.
            </div>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ padding: '32px 48px', borderTop: `1px solid ${s.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '11px', fontWeight: 300, letterSpacing: '0.15em', color: s.textDimmer }}>
          THE MODULAR SUITE
        </div>
        <div style={{ fontSize: '10px', color: s.textDimmer, letterSpacing: '0.1em' }}>
          © 2026 Night Manoeuvres · Private beta
        </div>
      </div>
    </div>
  )
}
