'use client'

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
      'Tour Lab — gigs, advancing, logistics',
      'Broadcast Lab — 30 captions / month',
      'Set Lab — track library + set building',
      'Drop Lab — release management',
      '15 content scans / month',
      '30 track analyses / month',
      '20 photo captures / month',
      'Email support',
    ],
  },
  {
    name: 'Artist',
    price: '£59',
    period: '/month',
    desc: 'You\'re on the road. The system runs the business.',
    color: COLORS.gold,
    highlight: true,
    features: [
      'Everything in Creator',
      'SONIX Lab — mix chain analysis + VST plugin',
      'Broadcast Lab — unlimited captions',
      'Set Lab — energy scoring + Rekordbox sync',
      'Contract parser + invoice tracking',
      'Drop Lab — campaign builder',
      '50 content scans / month',
      '100 track analyses / month',
      '15 stem exports / month',
      'Priority support',
    ],
  },
  {
    name: 'Pro',
    price: '£99',
    period: '/month',
    desc: 'Every tool. No limits.',
    color: '#6a8a7a',
    features: [
      'Everything in Artist',
      'Producer chain database',
      '150 content scans / month',
      '300 track analyses / month',
      '50 stem exports / month',
      '250 photo captures / month',
      'Priority processing on all scans',
      'Dedicated support',
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
    quote: "The caption generator alone has 3x'd my content output.",
    author: 'Festival & club promoter',
  },
]

export default function PricingPage() {
  const router = useRouter()

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Mono', monospace", minHeight: '100vh' }}>
      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: `rgba(7,7,6,0.92)`, borderBottom: `1px solid ${COLORS.border}`, padding: '20px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(8px)' }}>
        <Link href="/landing" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '11px', fontWeight: 200, letterSpacing: '0.04em', color: COLORS.text }}>Signal Lab</span>
          <span style={{ fontSize: '9px', letterSpacing: '0.08em', color: COLORS.textDimmer }}>OS</span>
        </Link>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <Link href="/landing" style={{ fontSize: '10px', letterSpacing: '0.15em', color: COLORS.textDim, textDecoration: 'none' }}>Back to home</Link>
          <Link href="/login" style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', background: COLORS.gold, color: COLORS.bg, padding: '10px 20px', textDecoration: 'none', border: `1px solid ${COLORS.gold}` }}>Get Access</Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px 48px 80px', textAlign: 'center', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: COLORS.gold, textTransform: 'uppercase', marginBottom: '32px' }}>Pricing</div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(32px, 5vw, 60px)', fontWeight: 200, letterSpacing: '0.04em', lineHeight: 1.1, marginBottom: '20px', maxWidth: '900px' }}>One system for every stage of your career.</h1>
        <p style={{ fontSize: '13px', color: COLORS.textDim, lineHeight: '1.8', maxWidth: '640px', letterSpacing: '0.04em', marginBottom: '40px' }}>All tiers include Tour Lab, Broadcast Lab, Set Lab, SONIX Lab, and Drop Lab.</p>
      </section>

      {/* PRICING TIERS */}
      <section style={{ padding: '80px 48px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2px', maxWidth: '960px', margin: '0 auto', background: COLORS.border }}>
            {TIERS.map((tier) => (
              <div key={tier.name} style={{ background: tier.highlight ? '#11100d' : COLORS.panel, padding: '40px 28px', position: 'relative' }}>
                {tier.highlight && <div style={{ position: 'absolute', top: '0', left: '0', right: '0', height: '2px', background: tier.color }} />}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <h3 style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: COLORS.textDimmer }}>{tier.name}</h3>
                  {tier.highlight && (
                    <div style={{ border: `1px solid rgba(176,141,87,0.3)`, padding: '3px 10px', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', color: COLORS.gold }}>Most popular</div>
                  )}
                </div>
                <p style={{ fontSize: '11px', color: COLORS.textDim, marginBottom: '20px', lineHeight: '1.5', minHeight: '36px' }}>{tier.desc}</p>
                <div style={{ marginBottom: '28px' }}>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '36px', fontWeight: 200, color: tier.color }}>{tier.price}<span style={{ fontSize: '11px', color: COLORS.textDimmer, fontFamily: "'DM Mono', monospace", marginLeft: '6px' }}>{tier.period}</span></div>
                </div>
                <button onClick={() => router.push('/login')} style={{ width: '100%', background: tier.highlight ? tier.color : 'transparent', color: tier.highlight ? COLORS.bg : tier.color, border: `1px solid ${tier.highlight ? tier.color : COLORS.border}`, padding: '12px 24px', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: "'DM Mono', monospace", marginBottom: '24px', transition: 'all 0.15s' }}>Get Access</button>
                <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: '24px' }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {tier.features.map((feature) => <li key={feature} style={{ fontSize: '12px', color: COLORS.textDim, lineHeight: '1.6', paddingLeft: '16px', position: 'relative' }}><span style={{ position: 'absolute', left: 0, color: tier.color }}>·</span>{feature}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* MANAGEMENT NOTE */}
          <div style={{ maxWidth: '960px', margin: '8px auto 80px', border: `1px solid ${COLORS.border}`, background: COLORS.panel, padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: COLORS.textDimmer, marginBottom: '6px' }}>Running artists?</div>
                <div style={{ fontSize: '13px', color: COLORS.textDim, lineHeight: '1.7' }}>Management tier available — multi-artist dashboard, team access, white-label advance emails. Priced on request.</div>
              </div>
              <a href="mailto:hello@signallabos.com?subject=Management%20tier" style={{ flexShrink: 0, border: `1px solid ${COLORS.border}`, padding: '10px 20px', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: COLORS.textDim, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                Get in touch →
              </a>
            </div>
          </div>

          {/* ROI MATH */}
          <div style={{ border: `1px solid ${COLORS.border}`, padding: '48px', textAlign: 'center', marginBottom: '80px' }}>
            <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '18px', fontWeight: 200, marginBottom: '24px', letterSpacing: '0.04em' }}>The Math</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '28px', marginBottom: '28px' }}>
              <div><div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '28px', fontWeight: 200, color: COLORS.textDim, marginBottom: '6px' }}>£150</div><div style={{ fontSize: '11px', color: COLORS.textDim }}>Advancers per show</div></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: COLORS.textDimmer }}>vs</div>
              <div><div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '28px', fontWeight: 200, color: COLORS.green, marginBottom: '6px' }}>£59</div><div style={{ fontSize: '11px', color: COLORS.textDim }}>Artist tier / month</div></div>
            </div>
            <p style={{ fontSize: '12px', color: COLORS.textDim, lineHeight: '1.7', maxWidth: '550px', margin: '0 auto' }}>At 20 shows/year on Artist tier: <strong style={{ color: COLORS.text }}>£3,000 vs £708.</strong> Break even at 4 shows. Everything else is savings. All tiers include all 5 labs.</p>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: '80px 48px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 200, letterSpacing: '0.04em', marginBottom: '60px', textAlign: 'center' }}>What users say</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2px', background: COLORS.border }}>
            {TESTIMONIALS.map((item, idx) => (
              <div key={idx} style={{ background: COLORS.panel, padding: '32px' }}>
                <p style={{ fontSize: '13px', color: COLORS.textDim, lineHeight: '1.7', marginBottom: '20px', fontStyle: 'italic' }}>{item.quote}</p>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: COLORS.textDim }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={{ textAlign: 'left', padding: '16px 0', fontWeight: 500, color: COLORS.text, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Feature</th>
                  <th style={{ textAlign: 'center', padding: '16px 0', fontWeight: 500, color: COLORS.gold, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Signal Lab OS</th>
                  <th style={{ textAlign: 'center', padding: '16px 0', fontWeight: 400, color: COLORS.textDimmer, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Advancers</th>
                  <th style={{ textAlign: 'center', padding: '16px 0', fontWeight: 400, color: COLORS.textDimmer, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Sheets</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Advance requests', '·', '·', ''],
                  ['Gig management', '·', '·', ''],
                  ['Invoicing', '·', '', ''],
                  ['Content scheduling', '·', '', ''],
                  ['Intelligent captions', '·', '', ''],
                  ['Production analysis (SONIX)', '·', '', ''],
                  ['DJ set tools', '·', '', ''],
                  ['Release management', '·', '', ''],
                  ['Multi-artist mgmt', '· (Agency)', '', ''],
                  ['Cost per show*', '£2.95', '£150', '—'],
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '12px 0', color: COLORS.text }}>{row[0]}</td>
                    <td style={{ textAlign: 'center', padding: '12px 0', color: row[1] ? COLORS.green : COLORS.textDimmer }}>{row[1] || '—'}</td>
                    <td style={{ textAlign: 'center', padding: '12px 0', color: row[2] ? COLORS.textDim : COLORS.textDimmer }}>{row[2] || '—'}</td>
                    <td style={{ textAlign: 'center', padding: '12px 0', color: COLORS.textDimmer }}>{row[3] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '9px', color: COLORS.textDimmer, marginTop: '16px', textAlign: 'center', letterSpacing: '0.08em' }}>*at 20 shows/year on Artist tier (£59/mo)</div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 48px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 200, letterSpacing: '0.04em', marginBottom: '20px' }}>Ready?</h2>
          <p style={{ fontSize: '12px', color: COLORS.textDim, lineHeight: '1.7', marginBottom: '40px' }}>Early access is limited. We're onboarding artists personally. Join the waitlist and we'll get you set up.</p>
          <button onClick={() => router.push('/login')} style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', background: COLORS.gold, color: COLORS.bg, padding: '14px 36px', border: `1px solid ${COLORS.gold}`, cursor: 'pointer', fontFamily: "'DM Mono', monospace", marginBottom: '12px', transition: 'opacity 0.15s' }}>Get Access</button>
          <div style={{ fontSize: '9px', color: COLORS.textDimmer, letterSpacing: '0.08em', marginTop: '12px' }}>No credit card required</div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '40px 48px', borderTop: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '28px', fontSize: '9px', color: COLORS.textDimmer, letterSpacing: '0.08em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '10px', fontWeight: 200, letterSpacing: '0.04em', color: COLORS.text }}>Signal Lab</span>
          <span style={{ fontSize: '8px', letterSpacing: '0.08em', color: COLORS.textDimmer }}>OS</span>
        </div>
        <div style={{ display: 'flex', gap: '28px' }}>
          <Link href="/landing" style={{ color: COLORS.textDim, textDecoration: 'none' }}>Home</Link>
        </div>
        <div>© 2026 · Private Beta</div>
      </footer>
    </div>
  )
}
