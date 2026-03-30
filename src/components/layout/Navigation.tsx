'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NotificationBell } from '@/components/ui/NotificationBell'

const NAV_GROUPS = [
  {
    label: 'TOUR',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Gigs', href: '/gigs' },
      { label: 'Logistics', href: '/logistics' },
    ],
  },
  {
    label: 'CREATE',
    items: [
      { label: 'Broadcast', href: '/broadcast' },
      { label: 'Set Lab', href: '/setlab' },
      { label: 'Sonix', href: '/sonix' },
    ],
  },
  {
    label: 'BUSINESS',
    items: [
      { label: 'Finances', href: '/business/finances' },
      { label: 'Contracts', href: '/contracts' },
      { label: 'Settings', href: '/business/settings' },
    ],
  },
]

export function Navigation() {
  const pathname = usePathname()
  const [apiUsage, setApiUsage] = useState<{ percentUsed: number; totalCostUsd: number; warning: boolean; critical: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/usage').then(r => r.json()).then(d => {
      if (!d.error) setApiUsage(d)
    }).catch(() => {})
    const t = setInterval(() => {
      fetch('/api/usage').then(r => r.json()).then(d => { if (!d.error) setApiUsage(d) }).catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // Hide nav on landing page, pricing, login, onboarding
  if (pathname === '/' || pathname === '/pricing' || pathname === '/login' || pathname === '/onboarding') {
    return null
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    // Match exact or sub-paths (e.g. /gigs/123 matches /gigs)
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav style={{
      width: 220,
      background: '#070706',
      borderRight: '1px solid #1a1917',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Mono', monospace",
      flexShrink: 0,
      overflowY: 'auto',
    }}>

      {/* Logo */}
      <div style={{ padding: '28px 24px 24px' }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: 10,
            fontWeight: 300,
            letterSpacing: '0.22em',
            color: '#b08d57',
            textTransform: 'uppercase',
            lineHeight: 1.4,
          }}>
            Signal OS
          </div>
          <div style={{
            fontSize: 9,
            letterSpacing: '0.18em',
            color: '#3a3830',
            textTransform: 'uppercase',
            marginTop: 3,
          }}>
            Night Manoeuvres
          </div>
        </Link>
      </div>

      {/* Nav body */}
      <div style={{ flex: 1, padding: '8px 0 16px', display: 'flex', flexDirection: 'column', gap: 36 }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            {/* Group label */}
            <div style={{
              fontSize: 8,
              letterSpacing: '0.28em',
              color: '#2e2c29',
              textTransform: 'uppercase',
              padding: '0 24px',
              marginBottom: 10,
            }}>
              {group.label}
            </div>

            {/* Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items.map(item => {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 24px',
                      textDecoration: 'none',
                      color: active ? '#f0ebe2' : '#52504c',
                      fontSize: 11,
                      letterSpacing: '0.06em',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#8a8780' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#52504c' }}
                  >
                    {/* Bullet dot */}
                    <div style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: active ? '#b08d57' : '#2a2825',
                      flexShrink: 0,
                      transition: 'background 0.15s',
                    }} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* API usage bar */}
      {apiUsage && (
        <div style={{ padding: '10px 24px 12px', borderTop: '1px solid #131210' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 8, letterSpacing: '0.18em', color: apiUsage.critical ? '#c04040' : apiUsage.warning ? '#b08d57' : '#2e2c29', textTransform: 'uppercase' }}>
              {apiUsage.critical ? '⚠ Critical' : apiUsage.warning ? '⚠ Warning' : 'API'}
            </span>
            <span style={{ fontSize: 8, color: apiUsage.critical ? '#c04040' : apiUsage.warning ? '#b08d57' : '#2e2c29' }}>
              {apiUsage.percentUsed}%
            </span>
          </div>
          <div style={{ height: 2, background: '#1a1917', borderRadius: 2 }}>
            <div style={{
              height: 2, borderRadius: 2,
              width: `${Math.min(apiUsage.percentUsed, 100)}%`,
              background: apiUsage.critical ? '#c04040' : apiUsage.warning ? '#b08d57' : '#3d6b4a',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Bottom — artist name + bell */}
      <div style={{
        borderTop: '1px solid #131210',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
      }}>
        <span style={{ fontSize: 9, letterSpacing: '0.14em', color: '#2e2c29', textTransform: 'uppercase' }}>
          Night Manoeuvres
        </span>
        <NotificationBell />
      </div>
    </nav>
  )
}
