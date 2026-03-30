'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NotificationBell } from '@/components/ui/NotificationBell'

const NAV_GROUPS = [
  {
    label: 'Tour Lab',
    items: [
      { label: 'Dashboard', href: '/dashboard', sub: [] },
      { label: 'Gigs', href: '/gigs', sub: [] },
      { label: 'Logistics', href: '/logistics', sub: [] },
    ],
  },
  {
    label: '',
    items: [
      {
        label: 'Broadcast Lab', href: '/broadcast',
        sub: [
          { label: 'Tone Intelligence', href: '/broadcast' },
          { label: 'Calendar', href: '/broadcast/calendar' },
          { label: 'Content Intel', href: '/broadcast/scanner' },
          { label: 'Media Library', href: '/broadcast/media' },
        ],
      },
      {
        label: 'Set Lab', href: '/setlab',
        sub: [
          { label: 'Library', href: '/setlab' },
          { label: 'Builder', href: '/setlab/builder' },
          { label: 'Mix Scanner', href: '/setlab/scanner' },
          { label: 'Rekordbox', href: '/setlab/rekordbox' },
        ],
      },
      {
        label: 'Sonix Lab', href: '/sonix',
        sub: [
          { label: 'Studio', href: '/sonix' },
          { label: 'Arrange', href: '/sonix/arrange' },
          { label: 'Compose', href: '/sonix/compose' },
        ],
      },
    ],
  },
  {
    label: '',
    items: [
      { label: 'Finances', href: '/business/finances', sub: [] },
      { label: 'Contracts', href: '/contracts', sub: [] },
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

  if (pathname === '/' || pathname === '/pricing' || pathname === '/login' || pathname === '/onboarding') {
    return null
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  function isParentActive(item: typeof NAV_GROUPS[0]['items'][0]) {
    return isActive(item.href) || item.sub.some(s => isActive(s.href))
  }

  return (
    <nav style={{
      width: 220,
      background: '#070706',
      borderRight: '1px solid #131210',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Mono', monospace",
      flexShrink: 0,
      overflowY: 'auto',
    }}>

      {/* Artist identity */}
      <div style={{ padding: '28px 24px 22px' }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: 11,
            fontWeight: 300,
            letterSpacing: '0.2em',
            color: '#f0ebe2',
            textTransform: 'uppercase',
            lineHeight: 1.4,
            marginBottom: 5,
          }}>
            Night Manoeuvres
          </div>
          <div style={{
            fontSize: 8,
            letterSpacing: '0.26em',
            color: '#b08d57',
            textTransform: 'uppercase',
          }}>
            Signal OS
          </div>
        </Link>
      </div>

      {/* Nav body */}
      <div style={{ flex: 1, padding: '8px 0 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label || gi} style={{ marginTop: gi > 0 ? 8 : 0 }}>
            {group.label ? (
              <div style={{
                fontSize: 8,
                letterSpacing: '0.28em',
                color: '#3a3830',
                textTransform: 'uppercase',
                padding: '16px 24px 8px',
              }}>
                {group.label}
              </div>
            ) : (
              <div style={{ height: 1, background: '#131210', margin: '8px 0' }} />
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {group.items.map(item => {
                const parentActive = isParentActive(item)
                const exactActive = isActive(item.href)
                const hasSub = item.sub.length > 0

                return (
                  <div key={item.href}>
                    {/* Parent item */}
                    <Link
                      href={item.href}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '6px 24px',
                        textDecoration: 'none',
                        color: parentActive ? '#f0ebe2' : '#52504c',
                        fontSize: 11,
                        letterSpacing: '0.06em',
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => { if (!parentActive) e.currentTarget.style.color = '#8a8780' }}
                      onMouseLeave={e => { if (!parentActive) e.currentTarget.style.color = '#52504c' }}
                    >
                      <div style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: parentActive ? '#b08d57' : '#252320',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }} />
                      {item.label}
                    </Link>

                    {/* Sub-items — visible when parent is active */}
                    {hasSub && parentActive && (
                      <div style={{ paddingBottom: 4 }}>
                        {item.sub.map(s => {
                          const subActive = pathname === s.href
                          return (
                            <Link
                              key={s.href}
                              href={s.href}
                              style={{
                                display: 'block',
                                padding: '4px 24px 4px 39px',
                                fontSize: 10,
                                letterSpacing: '0.06em',
                                textDecoration: 'none',
                                color: subActive ? '#b08d57' : '#3a3830',
                                transition: 'color 0.15s',
                              }}
                              onMouseEnter={e => { if (!subActive) e.currentTarget.style.color = '#8a8780' }}
                              onMouseLeave={e => { if (!subActive) e.currentTarget.style.color = subActive ? '#b08d57' : '#3a3830' }}
                            >
                              {s.label}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* API usage */}
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

      {/* Footer: artist name, settings, bell */}
      <div style={{
        borderTop: '1px solid #131210',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
      }}>
        <span style={{ fontSize: 9, letterSpacing: '0.14em', color: '#2e2c29', textTransform: 'uppercase' }}>
          Night Manoeuvres
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/business/settings" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26,
            border: '1px solid #131210',
            borderRadius: 4,
            color: '#2e2c29',
            fontSize: 13,
            textDecoration: 'none',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#b08d57'; e.currentTarget.style.borderColor = '#3a3020' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#2e2c29'; e.currentTarget.style.borderColor = '#131210' }}
          >
            ⚙
          </Link>
          <NotificationBell />
        </div>
      </div>
    </nav>
  )
}
