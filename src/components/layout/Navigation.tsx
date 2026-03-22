'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LABS = [
  {
    label: 'Broadcast Lab',
    href: '/broadcast',
    color: '#3d6b4a',
    sub: [
      { label: 'Calendar', href: '/broadcast/calendar' },
      { label: 'Media library', href: '/broadcast/media' },
    ],
  },
  {
    label: 'Sonix Lab',
    href: '/sonix',
    color: '#6a7a9a',
    sub: [],
  },
  {
    label: 'SetLab',
    href: '/setlab',
    color: '#9a6a5a',
    sub: [
      { label: 'Rekordbox import', href: '/setlab/rekordbox' },
    ],
  },
  {
    label: 'Max for Live',
    href: '/maxforlive',
    color: '#7a6a9a',
    sub: [],
  },
]

const SIGNAL = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Gigs', href: '/gigs' },
  { label: 'Finances', href: '/business/finances' },
  { label: 'Settings', href: '/business/settings' },
]

export function Navigation() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav style={{
      width: '196px',
      background: '#070706',
      borderRight: '1px solid #1a1917',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Mono', monospace",
      flexShrink: 0,
      overflowY: 'auto',
    }}>

      {/* LOGO */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid #1a1917' }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '12px', fontWeight: 200, letterSpacing: '0.22em', color: '#b08d57', lineHeight: 1.3 }}>NIGHT</div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '12px', fontWeight: 200, letterSpacing: '0.22em', color: '#b08d57', lineHeight: 1.3 }}>MANOEUVRES</div>
        <div style={{ fontSize: '8px', letterSpacing: '0.22em', color: '#2e2c29', marginTop: '5px', textTransform: 'uppercase' }}>The Modular Suite</div>
      </div>

      {/* LABS — top, prominent */}
      <div style={{ padding: '14px 0 8px' }}>
        <div style={{ fontSize: '8px', letterSpacing: '0.22em', color: '#2e2c29', textTransform: 'uppercase', padding: '0 18px', marginBottom: '6px' }}>Labs</div>
        {LABS.map(lab => {
          const active = isActive(lab.href)
          return (
            <div key={lab.href}>
              <Link href={lab.href} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 18px',
                fontSize: '12px',
                letterSpacing: '0.07em',
                textDecoration: 'none',
                color: active ? lab.color : '#52504c',
                background: active ? '#0e0d0b' : 'transparent',
                borderLeft: active ? `2px solid ${lab.color}` : '2px solid transparent',
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = '#8a8780'; e.currentTarget.style.borderLeftColor = '#2e2c29' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = '#52504c'; e.currentTarget.style.borderLeftColor = 'transparent' } }}
              >
                <span>{lab.label}</span>
                {active && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: lab.color, flexShrink: 0 }} />}
              </Link>
              {lab.sub.map(s => (
                <Link key={s.href} href={s.href} style={{
                  display: 'block',
                  padding: '6px 18px 6px 30px',
                  fontSize: '10px',
                  letterSpacing: '0.06em',
                  textDecoration: 'none',
                  color: pathname === s.href ? lab.color : '#3a3835',
                  background: pathname === s.href ? '#0e0d0b' : 'transparent',
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { if (pathname !== s.href) e.currentTarget.style.color = '#52504c' }}
                  onMouseLeave={e => { if (pathname !== s.href) e.currentTarget.style.color = '#3a3835' }}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          )
        })}
      </div>

      {/* DIVIDER */}
      <div style={{ height: '1px', background: '#1a1917', margin: '4px 18px' }} />

      {/* SIGNAL LAB */}
      <div style={{ padding: '10px 0 16px' }}>
        <div style={{ fontSize: '8px', letterSpacing: '0.22em', color: '#2e2c29', textTransform: 'uppercase', padding: '0 18px', marginBottom: '6px' }}>Signal Lab</div>
        {SIGNAL.map(item => {
          const active = isActive(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'block',
              padding: '8px 18px',
              fontSize: '11px',
              letterSpacing: '0.07em',
              textDecoration: 'none',
              color: active ? '#f0ebe2' : '#52504c',
              background: active ? '#0e0d0b' : 'transparent',
              borderLeft: active ? '2px solid #b08d57' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.color = '#8a8780'; e.currentTarget.style.borderLeftColor = '#2e2c29' } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.color = '#52504c'; e.currentTarget.style.borderLeftColor = 'transparent' } }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* VERSION */}
      <div style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid #1a1917' }}>
        <div style={{ fontSize: '8px', letterSpacing: '0.12em', color: '#1a1917' }}>Private beta · v0.1</div>
      </div>
    </nav>
  )
}
