'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, ListIcon, CheckSquare, DollarSign, Settings, Disc3, Music, Zap } from 'lucide-react'

const NAV = [
  {
    title: 'TOURING',
    items: [
      { label: 'Dashboard', href: '/', icon: Zap },
      { label: 'Gigs', href: '/gigs', icon: Calendar },
    ],
  },
  {
    title: 'PREP',
    items: [
      { label: 'Playlists', href: '/prep/playlists', icon: ListIcon },
      { label: 'Tasks', href: '/prep/tasks', icon: CheckSquare },
    ],
  },
  {
    title: 'BUSINESS',
    items: [
      { label: 'Finances', href: '/business/finances', icon: DollarSign },
      { label: 'Settings', href: '/business/settings', icon: Settings },
    ],
  },
]

const MODULES = [
  {
    label: 'Broadcast Lab',
    href: '/broadcast',
    icon: Disc3,
    sub: [
      { label: 'Calendar', href: '/broadcast/calendar' },
      { label: 'Media library', href: '/broadcast/media' },
    ],
  },
  { label: 'Sonix Lab', href: '/sonix', icon: Music, sub: [] },
  { label: 'SetLab', href: '/setlab', icon: ListIcon, sub: [] },
  { label: 'Max for Live', href: '/maxforlive', icon: Zap, sub: [] },
]

export function Navigation() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav style={{
      width: '200px',
      background: '#070706',
      borderRight: '1px solid #1a1917',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Mono', monospace",
      flexShrink: 0,
    }}>

      {/* LOGO */}
      <div style={{ padding: '24px 20px', borderBottom: '1px solid #1a1917' }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px', fontWeight: 300, letterSpacing: '0.2em', color: '#b08d57', lineHeight: 1.2 }}>NIGHT</div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px', fontWeight: 300, letterSpacing: '0.2em', color: '#b08d57', lineHeight: 1.2 }}>MANOEUVRES</div>
        <div style={{ fontSize: '8px', letterSpacing: '0.22em', color: '#3a3835', marginTop: '6px', textTransform: 'uppercase' }}>Signal Lab</div>
      </div>

      {/* MAIN NAV */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>
        {NAV.map(section => (
          <div key={section.title} style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '8px', letterSpacing: '0.22em', color: '#3a3835', textTransform: 'uppercase', padding: '0 16px', marginBottom: '6px' }}>{section.title}</div>
            {section.items.map(item => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 16px',
                  fontSize: '11px',
                  letterSpacing: '0.08em',
                  textDecoration: 'none',
                  color: active ? '#f0ebe2' : '#52504c',
                  background: active ? '#1a1917' : 'transparent',
                  borderLeft: active ? '2px solid #b08d57' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  <Icon style={{ width: '13px', height: '13px', flexShrink: 0 }} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* MODULES */}
      <div style={{ borderTop: '1px solid #1a1917', padding: '16px 0 8px' }}>
        <div style={{ fontSize: '8px', letterSpacing: '0.22em', color: '#3a3835', textTransform: 'uppercase', padding: '0 16px', marginBottom: '8px' }}>LABS</div>
        {MODULES.map(mod => {
          const Icon = mod.icon
          const active = isActive(mod.href)
          return (
            <div key={mod.href}>
              <Link href={mod.href} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 16px',
                fontSize: '11px',
                letterSpacing: '0.08em',
                textDecoration: 'none',
                color: active ? '#b08d57' : '#52504c',
                background: active ? '#1a1917' : 'transparent',
                borderLeft: active ? '2px solid #b08d57' : '2px solid transparent',
                transition: 'all 0.15s',
              }}>
                <Icon style={{ width: '13px', height: '13px', flexShrink: 0 }} />
                {mod.label}
              </Link>
              {mod.sub.map(s => (
                <Link key={s.href} href={s.href} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '7px 16px 7px 39px',
                  fontSize: '10px',
                  letterSpacing: '0.07em',
                  textDecoration: 'none',
                  color: pathname === s.href ? '#b08d57' : '#3a3835',
                  background: pathname === s.href ? '#1a1917' : 'transparent',
                  transition: 'all 0.15s',
                }}>
                  {s.label}
                </Link>
              ))}
            </div>
          )
        })}
      </div>

      {/* VERSION */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1a1917' }}>
        <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: '#2e2c29' }}>Private beta · v0.1</div>
      </div>
    </nav>
  )
}
