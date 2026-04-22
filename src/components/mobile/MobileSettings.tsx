'use client'

/**
 * MobileSettings — minimal settings for the mobile shell.
 * Profile summary, notification toggles, open-on-desktop link, sign out.
 * Admin-grade settings (API keys, integrations, team) stay on desktop.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BRT } from '@/lib/design/brt'

const C = BRT

interface ToggleProps {
  label: string
  storageKey: string
  defaultOn?: boolean
}

function Toggle({ label, storageKey, defaultOn = true }: ToggleProps) {
  const [on, setOn] = useState(defaultOn)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw != null) setOn(raw === '1')
    } catch {}
  }, [storageKey])

  function toggle() {
    const next = !on
    setOn(next)
    try { localStorage.setItem(storageKey, next ? '1' : '0') } catch {}
  }

  return (
    <button
      onClick={toggle}
      style={{
        width: '100%',
        minHeight: 56,
        background: C.surface,
        border: `1px solid ${C.divide}`,
        color: C.ink,
        fontFamily: 'inherit',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 14 }}>{label}</span>
      <span style={{
        fontSize: 10,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        fontWeight: 800,
        color: on ? C.red : C.inkDim,
      }}>
        {on ? 'On' : 'Off'}
      </span>
    </button>
  )
}

export default function MobileSettings() {
  const router = useRouter()
  const [profileName, setProfileName] = useState('')

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (d.settings?.profile?.name) setProfileName(d.settings.profile.name)
    }).catch(() => {})
  }, [])

  async function signOut() {
    if (!window.confirm('Sign out?')) return
    try {
      const { createBrowserClient } = await import('@supabase/auth-helpers-nextjs')
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      await supabase.auth.signOut()
    } catch {}
    router.push('/login')
  }

  function copyDesktopLink() {
    try {
      const url = typeof window !== 'undefined' ? window.location.origin + '/dashboard' : ''
      if (url) navigator.clipboard.writeText(url)
    } catch {}
  }

  const label: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.22em',
    color: C.inkDim,
    textTransform: 'uppercase',
    fontWeight: 700,
    marginBottom: 10,
  }

  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      color: C.ink,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      paddingBottom: 'calc(96px + env(safe-area-inset-bottom))',
    }}>
      <div style={{ padding: '20px 16px 14px', borderBottom: `1px solid ${C.divide}` }}>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          fontWeight: 800,
        }}>
          Settings
        </div>
      </div>

      <div style={{ padding: '20px 16px' }}>
        <div style={label}>Profile</div>
        <div style={{
          background: C.surface,
          border: `1px solid ${C.divide}`,
          padding: '16px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            {profileName || 'Anthony McGinley'}
          </div>
          <div style={{ fontSize: 12, color: C.inkDim }}>
            NIGHT manoeuvres
          </div>
        </div>

        <div style={label}>Notifications</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          <Toggle label="Gig reminders" storageKey="mobile.notif.gigs" />
          <Toggle label="Approvals" storageKey="mobile.notif.approvals" />
        </div>

        <div style={label}>Advanced</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={copyDesktopLink}
            style={{
              width: '100%',
              minHeight: 56,
              background: C.surface,
              border: `1px solid ${C.divide}`,
              color: C.ink,
              fontFamily: 'inherit',
              fontSize: 14,
              padding: '14px 16px',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            Open on desktop →
          </button>
          <button
            onClick={signOut}
            style={{
              width: '100%',
              minHeight: 56,
              background: 'transparent',
              border: `1px solid ${C.red}`,
              color: C.red,
              fontFamily: 'inherit',
              fontSize: 12,
              letterSpacing: '0.22em',
              fontWeight: 800,
              textTransform: 'uppercase',
              padding: '14px 16px',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
