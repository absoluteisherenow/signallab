'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Artist Voice', href: '/broadcast' },
  { label: 'Calendar', href: '/broadcast/calendar' },
  { label: 'The Edit', href: '/broadcast/scanner' },
  { label: 'Media Library', href: '/broadcast/media' },
]

interface SignalLabHeaderProps {
  right?: React.ReactNode
}

export function SignalLabHeader({ right }: SignalLabHeaderProps) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/broadcast') return pathname === '/broadcast'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const s = {
    gold: '#b08d57',
    text: '#f0ebe2',
    border: '#1a1917',
    font: "'DM Mono', monospace",
  }

  return (
    <div style={{ padding: '48px 48px 0', borderBottom: `1px solid ${s.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '12px', fontFamily: s.font }}>
            Broadcast Lab
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1, color: s.text }}>
            Your content
          </div>
        </div>
        {right && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {right}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0' }}>
        {TABS.map(tab => {
          const active = isActive(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: 'block',
                padding: '12px 24px 12px 0',
                marginRight: '8px',
                fontSize: '12px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                color: active ? s.text : 'rgba(240,235,226,0.3)',
                borderBottom: active ? `2px solid ${s.gold}` : '2px solid transparent',
                fontFamily: s.font,
                fontWeight: active ? 500 : 400,
                transition: 'color 0.12s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'rgba(240,235,226,0.6)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(240,235,226,0.3)' }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
