'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NotificationBell } from '@/components/ui/NotificationBell'

const NAV_GROUPS = [
  {
    label: '',
    items: [
      {
        label: 'Signal Lab', href: '/broadcast',
        sub: [
          { label: 'Tone Intelligence', href: '/broadcast' },
          { label: 'Calendar', href: '/broadcast/calendar' },
          { label: 'Content Intelligence', href: '/broadcast/scanner' },
          { label: 'Media Library', href: '/broadcast/media' },
        ],
      },
      {
        label: 'Tour Lab', href: '/dashboard',
        sub: [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Gigs', href: '/gigs' },
          { label: 'Logistics', href: '/logistics' },
        ],
      },
      {
        label: 'SONIX Lab', href: '/sonix',
        sub: [
          { label: 'Studio', href: '/sonix' },
          { label: 'Arrange', href: '/sonix/arrange' },
          { label: 'Compose', href: '/sonix/compose' },
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
      width: 200,
      minWidth: 200,
      background: '#080808',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Mono', monospace",
      flexShrink: 0,
      overflowY: 'auto',
      scrollbarWidth: 'none',
    }}>

      {/* Brand */}
      <div style={{ padding: '32px 28px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.16em',
            color: '#eae5dc',
            textTransform: 'uppercase',
            marginBottom: 5,
          }}>
            Night Manoeuvres
          </div>
          <div style={{
            fontSize: 8.5,
            letterSpacing: '0.22em',
            color: '#c9a96e',
            textTransform: 'uppercase',
          }}>
            Signal OS
          </div>
        </Link>
      </div>

      {/* Nav body */}
      <div style={{ flex: 1, padding: '12px 0' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label || gi}>
            {group.label ? (
              <div style={{
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: '0.2em',
                color: 'rgba(234,229,220,0.2)',
                textTransform: 'uppercase',
                padding: '20px 28px 8px',
              }}>
                {group.label}
              </div>
            ) : gi > 0 ? (
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 28px' }} />
            ) : null}

            <div>
              {group.items.map(item => {
                const parentActive = isParentActive(item)
                const hasSub = item.sub.length > 0

                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      style={{
                        display: 'block',
                        padding: '10px 28px',
                        textDecoration: 'none',
                        fontSize: 12.5,
                        fontWeight: parentActive ? 500 : 400,
                        color: parentActive ? '#c9a96e' : 'rgba(234,229,220,0.45)',
                        borderLeft: parentActive ? '2px solid #c9a96e' : '2px solid transparent',
                        background: parentActive ? 'rgba(201,169,110,0.08)' : 'transparent',
                        transition: 'color 0.12s',
                      }}
                      onMouseEnter={e => { if (!parentActive) e.currentTarget.style.color = '#eae5dc' }}
                      onMouseLeave={e => { if (!parentActive) e.currentTarget.style.color = 'rgba(234,229,220,0.45)' }}
                    >
                      {item.label}
                    </Link>

                    {hasSub && parentActive && (
                      <div>
                        {item.sub.map(s => {
                          const subActive = pathname === s.href
                          return (
                            <Link
                              key={s.href}
                              href={s.href}
                              style={{
                                display: 'block',
                                padding: '8px 28px 8px 44px',
                                fontSize: 12,
                                textDecoration: 'none',
                                color: subActive ? '#c9a96e' : 'rgba(234,229,220,0.2)',
                                transition: 'color 0.12s',
                              }}
                              onMouseEnter={e => { if (!subActive) e.currentTarget.style.color = 'rgba(234,229,220,0.45)' }}
                              onMouseLeave={e => { if (!subActive) e.currentTarget.style.color = 'rgba(234,229,220,0.2)' }}
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
        <div style={{ padding: '10px 28px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 8, letterSpacing: '0.18em', color: apiUsage.critical ? '#b05555' : apiUsage.warning ? '#c9a96e' : 'rgba(234,229,220,0.14)', textTransform: 'uppercase' }}>
              {apiUsage.critical ? '⚠ Critical' : apiUsage.warning ? '⚠ Warning' : 'API'}
            </span>
            <span style={{ fontSize: 8, color: apiUsage.critical ? '#b05555' : apiUsage.warning ? '#c9a96e' : 'rgba(234,229,220,0.14)' }}>
              {apiUsage.percentUsed}%
            </span>
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{
              height: 2, borderRadius: 2,
              width: `${Math.min(apiUsage.percentUsed, 100)}%`,
              background: apiUsage.critical ? '#b05555' : apiUsage.warning ? '#c9a96e' : '#4d9970',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 28px',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(234,229,220,0.14)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Night Manoeuvres
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/business/settings" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26,
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 4,
            color: 'rgba(234,229,220,0.2)',
            fontSize: 13,
            textDecoration: 'none',
            transition: 'color 0.12s, border-color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#c9a96e'; e.currentTarget.style.borderColor = 'rgba(201,169,110,0.4)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(234,229,220,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
          >
            ⚙
          </Link>
          <NotificationBell />
        </div>
      </div>
    </nav>
  )
}
