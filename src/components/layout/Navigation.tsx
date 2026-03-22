'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const MODULES = [
  { label: 'Signal Lab', href: '/dashboard', color: '#b08d57', sub: [
    { label: 'Gigs', href: '/gigs' },
    { label: 'Logistics', href: '/gigs/logistics' },
    { label: 'Finances', href: '/business/finances' },
    { label: 'Settings', href: '/business/settings' },
  ]},
  { label: 'Broadcast Lab', href: '/broadcast', color: '#3d6b4a', sub: [
    { label: 'Tone Intelligence', href: '/broadcast' },
    { label: 'Calendar', href: '/broadcast/calendar' },
    { label: 'Media Library', href: '/broadcast/media' },
    { label: 'Scanner', href: '/broadcast/media' },
  ]},
  { label: 'Sonix Lab', href: '/sonix', color: '#6a7a9a', sub: [
    { label: 'Compose', href: '/sonix#compose' },
    { label: 'Arrange', href: '/sonix#arrange' },
    { label: 'Mixdown', href: '/sonix#mixdown' },
  ]},
  { label: 'Set Lab', href: '/setlab', color: '#9a6a5a', sub: [
    { label: 'Library', href: '/setlab' },
    { label: 'Builder', href: '/setlab#builder' },
    { label: 'Rekordbox', href: '/setlab/rekordbox' },
  ]},
  { label: 'Max for Live', href: '/maxforlive', color: '#7a5a8a', sub: [] },
]

export function Navigation() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav style={{ width: '200px', background: '#070706', borderRight: '1px solid #1a1917', display: 'flex', flexDirection: 'column', fontFamily: "'DM Mono', monospace", flexShrink: 0, overflowY: 'auto' }}>
      <div style={{ padding: '20px 18px 18px', borderBottom: '1px solid #1a1917' }}>
        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '12px', fontWeight: 200, letterSpacing: '0.22em', color: '#b08d57', lineHeight: 1.3 }}>NIGHT</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '12px', fontWeight: 200, letterSpacing: '0.22em', color: '#b08d57', lineHeight: 1.3 }}>MANOEUVRES</div>
        </Link>
        <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: '#2e2c29', marginTop: '6px', textTransform: 'uppercase' }}>The Modular Suite</div>
      </div>
      <div style={{ flex: 1, padding: '12px 0' }}>
        {MODULES.map(mod => {
          const active = isActive(mod.href)
          const anySub = mod.sub.some(s => pathname.startsWith(s.href))
          const expanded = active || anySub
          return (
            <div key={mod.href} style={{ marginBottom: '2px' }}>
              <Link href={mod.href} style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', fontSize: '12px', letterSpacing: '0.08em', textDecoration: 'none', color: expanded ? mod.color : '#52504c', borderLeft: expanded ? '2px solid ' + mod.color : '2px solid transparent', transition: 'all 0.15s' }}>
                {mod.label}
              </Link>
              {expanded && mod.sub.map(s => (
                <Link key={s.href + s.label} href={s.href} style={{ display: 'block', padding: '7px 18px 7px 28px', fontSize: '11px', letterSpacing: '0.06em', textDecoration: 'none', color: pathname === s.href ? mod.color : '#3a3835', transition: 'color 0.15s' }}>
                  {s.label}
                </Link>
              ))}
            </div>
          )
        })}
      </div>
      <div style={{ padding: '12px 18px', borderTop: '1px solid #1a1917' }}>
        <div style={{ fontSize: '8px', letterSpacing: '0.12em', color: '#1a1917' }}>Private beta · v0.1</div>
      </div>
    </nav>
  )
}
