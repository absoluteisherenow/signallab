'use client'

/**
 * MobileDesktopRedirect — shown when a denylist route is opened on a mobile viewport.
 * Denylist: Finances, Ads Manager, SONIX, Broadcast Lab, Content Calendar, Media Library,
 * Campaigns Analytics, Contact list management, Set Lab full.
 *
 * Drop this in at the top of any desktop-only route's page, gated on `useMobile()`.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BRT } from '@/lib/design/brt'

const C = BRT

export function MobileDesktopRedirect({
  feature = 'This feature',
}: {
  feature?: string
}) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  function copyLink() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (url) {
      navigator.clipboard.writeText(url).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      color: C.ink,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      padding: '40px 20px 96px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56,
        border: `1px solid ${C.red}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        fontSize: 22,
        color: C.red,
      }}>
        ▭
      </div>
      <div style={{
        fontSize: 10,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: C.inkDim,
        fontWeight: 700,
        marginBottom: 10,
      }}>
        Desktop only
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
        marginBottom: 10,
        maxWidth: 320,
      }}>
        {feature} lives on desktop.
      </div>
      <div style={{
        fontSize: 14,
        color: C.inkDim,
        lineHeight: 1.55,
        maxWidth: 300,
        marginBottom: 28,
      }}>
        Open Signal Lab on your laptop to continue.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
        <button
          onClick={copyLink}
          style={{
            width: '100%',
            minHeight: 48,
            background: C.red,
            border: 'none',
            color: C.bg,
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          onClick={() => router.back()}
          style={{
            width: '100%',
            minHeight: 48,
            background: 'transparent',
            border: `1px solid ${C.divide}`,
            color: C.ink,
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <Link
          href="/dashboard"
          style={{
            width: '100%',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            color: C.inkDim,
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Go to Home
        </Link>
      </div>
    </div>
  )
}
