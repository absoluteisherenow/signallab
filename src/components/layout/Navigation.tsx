'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NotificationBell } from '@/components/ui/NotificationBell'

type NavItem = { label: string; href: string; sub: { label: string; href: string }[] }
type NavGroup = { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [
      { label: 'Dashboard', href: '/dashboard', sub: [] },
    ],
  },
  {
    label: '',
    items: [
      { label: 'Broadcast Lab', href: '/broadcast', sub: [] },
      { label: 'Set Lab', href: '/setlab', sub: [] },
      { label: 'SONIX Lab', href: '/sonix', sub: [] },
      { label: 'Tour Lab', href: '/gigs', sub: [] },
      { label: 'Drop Lab', href: '/releases', sub: [] },
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

  if (pathname === '/' || pathname === '/pricing' || pathname === '/login' || pathname === '/onboarding' || pathname === '/mobile') {
    return null
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    if (href === '/gigs') return pathname === '/gigs' || pathname.startsWith('/gigs/')
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
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
      scrollbarWidth: 'none',
    }}>

      {/* Brand */}
      <div style={{ padding: '28px 24px 26px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.06em',
            color: '#eae5dc',
            textTransform: 'uppercase',
            lineHeight: 1.25,
            marginBottom: 10,
          }}>
            Night<br />Manoeuvres
          </div>
          <div style={{
            fontSize: 9,
            letterSpacing: '0.22em',
            color: '#c9a96e',
            textTransform: 'uppercase',
            fontWeight: 400,
          }}>
            Tailored Artist OS
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
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 0', marginTop: 'auto' }}>
        <Link href="/business/settings" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 28px',
          textDecoration: 'none',
          fontSize: 12.5,
          color: pathname === '/business/settings' ? '#c9a96e' : 'rgba(234,229,220,0.45)',
          borderLeft: pathname === '/business/settings' ? '2px solid #c9a96e' : '2px solid transparent',
          background: pathname === '/business/settings' ? 'rgba(201,169,110,0.08)' : 'transparent',
          transition: 'color 0.12s',
        }}
        onMouseEnter={e => { if (pathname !== '/business/settings') e.currentTarget.style.color = '#eae5dc' }}
        onMouseLeave={e => { if (pathname !== '/business/settings') e.currentTarget.style.color = 'rgba(234,229,220,0.45)' }}
        >
          Settings
        </Link>
        <div style={{ padding: '2px 28px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/mobile" style={{
            fontSize: 9,
            color: 'rgba(234,229,220,0.14)',
            letterSpacing: '0.1em',
            textDecoration: 'none',
            transition: 'color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(234,229,220,0.35)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(234,229,220,0.14)' }}
          title="Mobile quick-actions"
          >
            Night Manoeuvres
          </Link>
          <NotificationBell />
        </div>
      </div>
    </nav>
  )
}
