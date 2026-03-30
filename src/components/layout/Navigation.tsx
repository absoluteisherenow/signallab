'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NotificationBell } from '@/components/ui/NotificationBell'

const MODULES = [
  { label: 'Signal Lab', href: '/broadcast', color: '#3d6b4a', sub: [
    { label: 'Tone Intelligence', href: '/broadcast' },
    { label: 'Calendar', href: '/broadcast/calendar' },
    { label: 'Content Intelligence', href: '/broadcast/scanner' },
    { label: 'Media Library', href: '/broadcast/media' },
  ]},
  { label: 'Tour Lab', href: '/gigs', color: '#b08d57', sub: [
    { label: 'Gigs', href: '/gigs' },
    { label: 'Finances', href: '/business/finances' },
    { label: 'Contracts', href: '/contracts' },
  ]},
  { label: 'SONIX Lab', href: '/sonix', color: '#6a7a9a', sub: [] },
  { label: 'Set Lab', href: '/setlab', color: '#9a6a5a', sub: [] },
]

export function Navigation() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href
  const moduleActive = (mod: typeof MODULES[0]) => {
    if (mod.href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname === mod.href || mod.sub.some(s => pathname === s.href)
  }
  const [apiUsage, setApiUsage] = useState<{ percentUsed: number; totalCostUsd: number; warning: boolean; critical: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/usage').then(r => r.json()).then(d => {
      if (!d.error) setApiUsage(d)
    }).catch(() => {})
    // Refresh every 5 minutes
    const t = setInterval(() => {
      fetch('/api/usage').then(r => r.json()).then(d => { if (!d.error) setApiUsage(d) }).catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // Hide nav on landing page, pricing, login, onboarding
  if (pathname === '/' || pathname === '/pricing' || pathname === '/login' || pathname === '/onboarding') {
    return null
  }
  
  return (
    <nav className="sidebar-nav" style={{ width: '200px', background: '#070706', borderRight: '1px solid #1a1917', display: 'flex', flexDirection: 'column', fontFamily: "'DM Mono', monospace", flexShrink: 0, overflowY: 'auto' }}>
      <div style={{ padding: '20px 18px 18px', borderBottom: '1px solid #1a1917' }}>
        <Link href='/dashboard' style={{ textDecoration: 'none' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', fontWeight: 400, letterSpacing: '0.18em', color: '#8a8780', textTransform: 'uppercase', lineHeight: 1.3, marginBottom: '4px' }}>Night Manoeuvres</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '9px', fontWeight: 200, letterSpacing: '0.15em', color: '#3a3830', lineHeight: 1.3 }}>Artist OS</div>
        </Link>
      </div>
      <div style={{ flex: 1, padding: '16px 0' }}>
        {MODULES.map(mod => {
          const active = moduleActive(mod)
          return (
            <div key={mod.href} style={{ marginBottom: '16px', borderLeft: active ? `2px solid ${mod.color}` : '2px solid transparent', transition: 'border-color 0.2s' }}>
              <Link href={mod.href} style={{ display: 'block', padding: '6px 18px', fontSize: '24px', letterSpacing: '0.06em', fontFamily: "'Unbounded', sans-serif", fontWeight: 300, textDecoration: 'none', color: active ? mod.color : mod.color + 'a0', transition: 'color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = mod.color }}
                onMouseLeave={e => { e.currentTarget.style.color = active ? mod.color : mod.color + 'a0' }}
              >{mod.label}</Link>
              {active && mod.sub.map(s => (
                <Link key={s.href + s.label} href={s.href} style={{ display: 'block', padding: '5px 18px 5px 28px', fontSize: '11px', letterSpacing: '0.06em', textDecoration: 'none', color: isActive(s.href) ? mod.color : '#2e2c29', transition: 'color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = mod.color }}
                  onMouseLeave={e => { e.currentTarget.style.color = isActive(s.href) ? mod.color : '#2e2c29' }}
                >{s.label}</Link>
              ))}
            </div>
          )
        })}
      </div>
      {/* API usage bar */}
      {apiUsage && (
        <div style={{ padding: '10px 18px', borderTop: '1px solid #1a1917' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: apiUsage.critical ? '#c04040' : apiUsage.warning ? '#b08d57' : '#2e2c29', textTransform: 'uppercase' }}>
              {apiUsage.critical ? '⚠ API CRITICAL' : apiUsage.warning ? '⚠ API WARNING' : 'API usage'}
            </span>
            <span style={{ fontSize: '9px', color: apiUsage.critical ? '#c04040' : apiUsage.warning ? '#b08d57' : '#2e2c29' }}>
              {apiUsage.percentUsed}%
            </span>
          </div>
          <div style={{ height: '3px', background: '#1a1917', borderRadius: '2px' }}>
            <div style={{
              height: '3px', borderRadius: '2px',
              width: `${Math.min(apiUsage.percentUsed, 100)}%`,
              background: apiUsage.critical ? '#c04040' : apiUsage.warning ? '#b08d57' : '#3d6b4a',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: '9px', color: '#2e2c29', marginTop: '4px' }}>
            £{(apiUsage.totalCostUsd * 0.79).toFixed(2)} / £{(150 * 0.79).toFixed(0)} this month
          </div>
        </div>
      )}
      <div style={{ borderTop: '1px solid #1a1917', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 4px 18px' }}>
        <Link href='/business/settings' style={{ fontSize: '11px', letterSpacing: '0.08em', textDecoration: 'none', color: pathname === '/business/settings' ? '#b08d57' : '#2e2c29', transition: 'color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#8a8780' }}
          onMouseLeave={e => { e.currentTarget.style.color = pathname === '/business/settings' ? '#b08d57' : '#2e2c29' }}
        >Settings</Link>
        <NotificationBell />
      </div>
    </nav>
  )
}
