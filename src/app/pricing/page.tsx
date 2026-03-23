'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const COLORS = {
  bg: '#070706',
  panel: '#0e0d0b',
  border: '#1a1917',
  gold: '#b08d57',
  text: '#f0ebe2',
  textDim: '#8a8780',
  textDimmer: '#52504c',
  green: '#3d6b4a',
}

const TIERS = [
  {
    name: 'Creator',
    price: '£29',
    period: '/month',
    desc: 'You\'re making music. No context switching.',
    color: '#8a7a6a',
    features: [
      'Signal Lab — unlimited gigs',
      'Broadcast Lab — 30 captions/month',
      'Set Lab — unlimited',
      'Sonix Lab — all 18 chains',
      'Advance request forms',
      'Buffer publishing',
      'Email support',
    ],
  },
  {
    name: 'Artist',
    price: '£59',
    period: '/month',
    desc: 'You\'re on the road. Your crew needs access.',
    color: COLORS.gold,
    highlight: true,
    features: [
      'Everything in Creator',
      'Sonix Lab — Max for Live',
      'Broadcast Lab — unlimited captions',
      'Multi-user team access',
      'Gmail & API integration',
      'PDF invoicing & advance sheets',
      'Priority support (1-hour)',
    ],
  },
  {
    name: 'Pro',
    price: '£99',
    period: '/month',
    desc: 'You\'re managing artists. One command center.',
    color: '#6a8a7a',
    features: [
      'Everything in Artist',
      'Multi-artist profiles (up to 10)',
      'Roster analytics dashboard',
      'Label-branded advance forms',
      'Sonix stems analysis',
      'Advanced content scanning',
      'Artist onboarding portal',
      'Cross-artist revenue tracking',
      'API access & webhooks',
      'Dedicated support',
    ],
  },
  {
    name: 'Agency',
    price: '£249',
    period: '/month',
    desc: 'You\'re running the operation. Advanced tools, full control.',
    color: '#7a8a6a',
    features: [
      'Everything in Pro',
      'Advanced team permissions',
      'Custom integrations',
      'White-label options',
      'Bulk operations & automation',
      'Dedicated account manager',
    ],
  },
]

const TESTIMONIALS = [
  {
    quote: 'Finally a tool built for artists, not just for spreadsheet jockeys.',
    author: 'DJ in the scene',
  },
  {
    quote: 'Replaced Advancers, Buffer, and three Google Sheets. Worth every penny.',
    author: 'Touring electronic artist',
  },
  {
    quote: 'The caption generator alone has 3x'd my content output.',
    author: 'Festival & club promoter',
  },
]

export default function PricingPage() {
  const router = useRouter()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Mono', monospace", minHeight: '100vh' }}>
      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: `rgba(7,7,6,0.92)`, borderBottom: `1px solid ${COLORS.border}`, padding: '20px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(8px)' }}>
        <Link href="/"><div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '11px', fontWeight: 300, letterSpacing: '0.2em', color: COLORS.gold, cursor: 'pointer' }}>THE MODULAR SUITE</div></Link>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <Link href="/" style={{ fontSize: '10px', letterSpacing: '0.15em', color: COLORS.textDim, textDecoration: 'none' }}>Back to demo</Link>
          <Link href="/login" style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', background: COLORS.gold, color: COLORS.bg, padding: '10px 20px', textDecoration: 'none', border: `1px solid ${COLORS.gold}` }}>Get Access →</Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px 48px 80px', textAlign: 'center', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: COLORS.gold, textTransform: 'uppercase', marginBottom: '32px' }}>Creator to Agency</div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(32px, 5vw, 60px)', fontWeight: 200, letterSpacing: '0.04em', lineHeight: 1.1, marginBottom: '20px', maxWidth: '900px' }}>One system for every stage of your career.</h1>
        <p style={{ fontSize: '13px', color: COLORS.textDim, lineHeight: '1.8', maxWidth: '640px', letterSpacing: '0.04em', marginBottom: '40px' }}>From Creator to Agency. All tiers include music production, content, DJ tools, and tour management. No hidden fees. No feature gates.</p>
      </section>

      {/* PRICING TIERS */}
      <section style={{ padding: '80px 48px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '80px' }}>
            {TIERS.map((tier) => (
              <div key={tier.name} style={{ background: tier.highlight ? `linear-gradient(135deg, ${COLORS.panel} 0%, #1a1310 100%)` : COLORS.panel, border: `2px solid ${tier.highlight ? tier.color : COLORS.border}`, padding: '40px 28px', position: 'relative', transform: tier.highlight ? 'scale(1.04)' : 'scale(1)' }}>
                {tier.highlight && <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: tier.color, color: COLORS.bg, padding: '5px 14px', fontSize: '8px', letterSpacing: '0.1em', fontWeight: 'bold' }}>MOST POPULAR</div>}
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: tier.color, marginBottom: '6px', letterSpacing: '0.08em' }}>{tier.name}</h3>
                <p style={{ fontSize: '11px', color: COLORS.textDim, marginBottom: '20px', lineHeight: '1.5', minHeight: '40px' }}>{tier.desc}</p>
                <div style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: tier.color, letterSpacing: '0.02em' }}>{tier.price}<span style={{ fontSize: '11px', color: COLORS.textDim, fontWeight: 'normal', marginLeft: '6px' }}>{tier.period}</span></div>
                  <div style={{ fontSize: '8px', color: COLORS.textDimmer, letterSpacing: '0.08em', marginTop: '6px' }}>Cancel anytime</div>
                </div>
                <button onClick={() => router.push('/login')} style={{ width: '100%', background: tier.highlight ? tier.color : 'transparent', color: tier.highlight ? COLORS.bg : tier.color, border: `1px solid ${tier.color}`, padding: '12px 24px', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 'bold', cursor: 'pointer', marginBottom: '24px' }}>Get Access →</button>
                <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: '24px' }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {tier.features.map((feature) => <li key={feature} style={{ fontSize: '11px', color: COLORS.textDim, lineHeight: '1.5', paddingLeft: '18px', position: 'relative' }}><span style={{ position: 'absolute', left: 0, color: tier.color }}>✓</span>{feature}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* ROI MATH */}
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: '48px', textAlign: 'center', marginBottom: '80px' }}>
            <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '18px', fontWeight: 200, marginBottom: '24px', letterSpacing: '0.04em' }}>The Math</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '28px', marginBottom: '28px' }}>
              <div><div style={{ fontSize: '28px', fontWeight: 'bold', color: COLORS.gold, marginBottom: '6px' }}>£150</div><div style={{ fontSize: '11px', color: COLORS.textDim }}>Advancers per show</div></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: COLORS.textDimmer }}>vs</div>
              <div><div style={{ fontSize: '28px', fontWeight: 'bold', color: COLORS.green, marginBottom: '6px' }}>£59</div><div style={{ fontSize: '11px', color: COLORS.textDim }}>Pro tier/month</div></div>
            </div>
            <p style={{ fontSize: '12px', color: COLORS.textDim, lineHeight: '1.7', maxWidth: '550px', margin: '0 auto' }}>At 20 shows/year on Artist: <strong style={{ color: COLORS.text }}>£3,000 vs £708.</strong> Break even at 4 shows. Everything else is profit. All tiers include Sonix, content, and DJ tools.</p>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: '80px 48px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 200, letterSpacing: '0.04em', marginBottom: '60px', textAlign: 'center' }}>What users say</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px' }}>
            {TESTIMONIALS.map((item, idx) => (
              <div key={idx} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: '32px', position: 'relative' }}>
                <div style={{ fontSize: '20px', marginBottom: '16px', color: COLORS.gold }}>«</div>
                <p style={{ fontSize: '12px', color: COLORS.textDim, lineHeight: '1.7', marginBottom: '20px', fontStyle: 'italic' }}>{item.quote}</p>
                <div style={{ fontSize: '10px', color: COLORS.textDimmer, letterSpacing: '0.08em' }}>— {item.author}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES COMPARISON */}
      <section style={{ padding: '80px 48px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 200, letterSpacing: '0.04em', marginBottom: '60px', textAlign: 'center' }}>How we compare</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', color: COLORS.textDim }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={{ textAlign: 'left', padding: '16px 0', fontWeight: 'bold', color: COLORS.text }}>Feature</th>
                  <th style={{ textAlign: 'center', padding: '16px 0', fontWeight: 'bold', color: COLORS.gold }}>Modular Suite</th>
                  <th style={{ textAlign: 'center', padding: '16px 0', fontWeight: 'bold', color: COLORS.textDimmer }}>Advancers</th>
                  <th style={{ textAlign: 'center', padding: '16px 0', fontWeight: 'bold', color: COLORS.textDimmer }}>Sheets</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Advance requests', '✓', '✓', '✗'],
                  ['Gig management', '✓', '✓', '✗'],
                  ['Invoicing', '✓', '✗', '✗'],
                  ['Content scheduling', '✓', '✗', '✗'],
                  ['AI captions', '✓', '✗', '✗'],
                  ['Music production (Sonix)', '✓', '✗', '✗'],
                  ['DJ tools', '✓', '✗', '✗'],
                  ['Multi-artist mgmt', '✓ (Label+)', '✗', '✗'],
                  ['Cost per show*', '£2.95', '£150', '—'],
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '12px 0', color: COLORS.text }}>{row[0]}</td>
                    <td style={{ textAlign: 'center', padding: '12px 0', color: row[1] === '✓' || row[1].includes('✓') ? COLORS.green : COLORS.textDimmer }}>{row[1]}</td>
                    <td style={{ textAlign: 'center', padding: '12px 0' }}>{row[2]}</td>
                    <td style={{ textAlign: 'center', padding: '12px 0' }}>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '9px', color: COLORS.textDimmer, marginTop: '16px', textAlign: 'center' }}>*at 20 shows/year on Artist tier (£59/mo)</div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 48px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 200, letterSpacing: '0.04em', marginBottom: '20px' }}>Ready?</h2>
          <p style={{ fontSize: '12px', color: COLORS.textDim, lineHeight: '1.7', marginBottom: '40px' }}>Early access is limited. We're onboarding artists & managers personally. Join the waitlist and we'll get you in.</p>
          <button onClick={() => router.push('/login')} style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', background: COLORS.gold, color: COLORS.bg, padding: '14px 36px', border: `1px solid ${COLORS.gold}`, cursor: 'pointer', fontWeight: 'bold', fontFamily: "'DM Mono', monospace", marginBottom: '12px' }}>Get Access →</button>
          <div style={{ fontSize: '9px', color: COLORS.textDimmer, letterSpacing: '0.08em' }}>No credit card required</div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '40px 48px', borderTop: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '28px', fontSize: '9px', color: COLORS.textDimmer, letterSpacing: '0.08em' }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '10px', fontWeight: 300, letterSpacing: '0.12em' }}>THE MODULAR SUITE</div>
        <div style={{ display: 'flex', gap: '28px' }}>
          <Link href="/" style={{ color: COLORS.textDim, textDecoration: 'none' }}>Demo</Link>
          <a href="https://github.com/absoluteisherenow" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.textDim, textDecoration: 'none' }}>GitHub</a>
        </div>
        <div>© 2026 · Private Beta</div>
      </footer>
    </div>
  )
}
