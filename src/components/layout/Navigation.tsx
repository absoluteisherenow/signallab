'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const MODULES = [
  { label: 'Signal Lab', href: '/broadcast', color: '#3d6b4a', sub: [
    { label: 'Tone Intelligence', href: '/broadcast' },
    { label: 'Calendar', href: '/broadcast/calendar' },
    { label: 'Content Intelligence', href: '/broadcast/scanner' },
    { label: 'Media Library', href: '/broadcast/media' },
  ]},
  { label: 'Tour Lab', href: '/dashboard', color: '#b08d57', sub: [
    { label: 'Gigs', href: '/logistics' },
    { label: 'Finances', href: '/business/finances' },
      { label: 'Contracts', href: '/contracts' },
  ]},
  { label: 'Sonix Lab', href: '/sonix', color: '#6a7a9a', sub: [
    { label: 'Compose', href: '/sonix#compose' },
    { label: 'Arrange', href: '/sonix#arrange' },
    { label: 'Mixdown', href: '/sonix#mixdown' },
    { label: 'Max for Live', href: '/maxforlive' },
  ]},
  { label: 'Set Lab', href: '/setlab', color: '#9a6a5a', sub: [
    { label: 'Rekordbox import', href: '/setlab/rekordbox' },
  ]},
]

export function Navigation() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href
  const moduleActive = (mod: typeof MODULES[0]) => {
    if (mod.href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname === mod.href || mod.sub.some(s => pathname === s.href)
  }
  
  // Hide nav on pricing page
  if (pathname === '/pricing') {
    return null
  }
  
  return (
    <nav style={{ width: '200px', background: '#070706', borderRight: '1px solid #1a1917', display: 'flex', flexDirection: 'column', fontFamily: "'DM Mono', monospace", flexShrink: 0, overflowY: 'auto' }}>
      <div style={{ padding: '20px 18px 18px', borderBottom: '1px solid #1a1917' }}>
        <Link href='/dashboard' style={{ textDecoration: 'none' }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '10px', fontWeight: 200, letterSpacing: '0.15em', color: '#b08d57', lineHeight: 1.3 }}>THE MODULAR SUITE</div>
        </Link>
      </div>
      <div style={{ flex: 1, padding: '16px 0' }}>
        {MODULES.map(mod => {
          const active = moduleActive(mod)
          return (
            <div key={mod.href} style={{ marginBottom: '16px' }}>
              <Link href={mod.href} style={{ display: 'block', padding: '6px 18px', fontSize: '12px', letterSpacing: '0.08em', textDecoration: 'none', color: active ? mod.color : '#52504c', transition: 'color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = mod.color }}
                onMouseLeave={e => { e.currentTarget.style.color = active ? mod.color : '#52504c' }}
              >{mod.label}</Link>
              {mod.sub.map(s => (
                <Link key={s.href} href={s.href} style={{ display: 'block', padding: '5px 18px 5px 28px', fontSize: '11px', letterSpacing: '0.06em', textDecoration: 'none', color: isActive(s.href) ? mod.color : '#2e2c29', transition: 'color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = mod.color }}
                  onMouseLeave={e => { e.currentTarget.style.color = isActive(s.href) ? mod.color : '#2e2c29' }}
                >{s.label}</Link>
              ))}
            </div>
          )
        })}
      </div>
      <div style={{ borderTop: '1px solid #1a1917' }}>
        <Link href='/business/settings' style={{ display: 'block', padding: '12px 18px', fontSize: '11px', letterSpacing: '0.08em', textDecoration: 'none', color: pathname === '/business/settings' ? '#b08d57' : '#2e2c29', transition: 'color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#8a8780' }}
          onMouseLeave={e => { e.currentTarget.style.color = pathname === '/business/settings' ? '#b08d57' : '#2e2c29' }}
        >Settings</Link>
      </div>
    </nav>
  )
}
