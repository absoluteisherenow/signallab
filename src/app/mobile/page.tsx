'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMobile } from '@/hooks/useMobile'

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  font: 'var(--font-mono)',
}

export default function MobilePage() {
  const mobile = useMobile()
  const [copied, setCopied] = useState(false)
  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : 'https://signallabos.com/dashboard'

  function copyLink() {
    navigator.clipboard.writeText(appUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // On mobile, just go to dashboard
  if (mobile) {
    if (typeof window !== 'undefined') window.location.href = '/dashboard'
    return null
  }

  return (
    <div style={{ background: s.bg, color: s.text, minHeight: '100vh', fontFamily: s.font }}>

      <div style={{ padding: '40px 48px 32px', borderBottom: `1px solid ${s.border}` }}>
        <Link href="/dashboard" style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textDecoration: 'none', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          ← Dashboard
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
          <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
            <polyline points="12,32 22,32 26,18 32,46 36,26 40,34 44,30 50,32" stroke="#ff2a1a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1 }}>
            Signal Lab Mobile
          </div>
        </div>
        <div style={{ fontSize: '12px', color: s.dim }}>
          Your backstage pass — built for the gig, not the office
        </div>
      </div>

      <div style={{ padding: '40px 48px', maxWidth: '800px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '40px' }}>
          {[
            { title: 'Voice assistant', desc: 'Tap the mic, ask Signal anything — gig prep, what to post, save an idea. Hands-free.' },
            { title: 'Gig pass', desc: 'Set time, venue contacts, travel info, advance status — all on one screen. Like a boarding pass for your set.' },
            { title: 'Mix scanner', desc: 'Screenshot your CDJ screen or Rekordbox history after a set. Instant tracklist analysis.' },
            { title: 'Quick upload', desc: 'Snap a photo or video at the gig. It lands in your media library for posting later on desktop.' },
          ].map(item => (
            <div key={item.title} style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px' }}>
              <div style={{ fontSize: '12px', color: s.gold, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>
                {item.title}
              </div>
              <div style={{ fontSize: '12px', color: s.dim, lineHeight: 1.7 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '12px' }}>
            Desktop only
          </div>
          <div style={{ fontSize: '12px', color: s.dimmer, lineHeight: 1.7 }}>
            Campaign builder, release management, broadcast scheduling, analytics, invoicing, and set building stay on desktop — those are coffee-and-laptop tasks, not club tasks.
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, rgba(255,42,26,0.08) 0%, rgba(255,42,26,0.02) 100%)', border: `1px solid ${s.gold}30`, padding: '32px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px' }}>
            Get it on your phone
          </div>
          <div style={{ fontSize: '13px', color: s.text, marginBottom: '16px' }}>
            Open this link on your phone, then add to your home screen:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <div style={{
              flex: 1, background: s.bg, border: `1px solid ${s.border}`, padding: '12px 16px',
              fontSize: '12px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {appUrl}
            </div>
            <button onClick={copyLink} style={{
              background: s.gold, color: '#050505', border: 'none',
              padding: '12px 20px', fontSize: '10px', letterSpacing: '0.14em',
              textTransform: 'uppercase', fontFamily: s.font, cursor: 'pointer', flexShrink: 0,
            }}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: s.dim, lineHeight: 1.8 }}>
            <div style={{ marginBottom: '8px' }}><strong style={{ color: s.text }}>iPhone:</strong> Open in Safari → tap Share (↑) → "Add to Home Screen"</div>
            <div><strong style={{ color: s.text }}>Android:</strong> Open in Chrome → menu → "Install app"</div>
          </div>
        </div>
      </div>
    </div>
  )
}
