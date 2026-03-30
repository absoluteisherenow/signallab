'use client'

import Link from 'next/link'

interface Tab {
  label: string
  href?: string
  onClick?: () => void
  active: boolean
}

interface PageHeaderProps {
  section: string
  sectionColor?: string
  title: string
  right?: React.ReactNode
  tabs?: Tab[]
}

export function PageHeader({
  section,
  sectionColor = '#b08d57',
  title,
  right,
  tabs,
}: PageHeaderProps) {
  const font = "'DM Mono', monospace"

  return (
    <div style={{ padding: '48px 48px 0', borderBottom: '1px solid #1a1917' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: sectionColor, textTransform: 'uppercase', marginBottom: '12px', fontFamily: font }}>
            {section}
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(36px, 4vw, 52px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1, color: '#f0ebe2' }}>
            {title}
          </div>
        </div>
        {right && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {right}
          </div>
        )}
      </div>

      {tabs && tabs.length > 0 && (
        <div style={{ display: 'flex' }}>
          {tabs.map(tab => {
            const baseStyle: React.CSSProperties = {
              padding: '12px 24px 12px 0',
              marginRight: '8px',
              fontSize: '12px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: tab.active ? '#f0ebe2' : 'rgba(240,235,226,0.3)',
              borderBottom: `2px solid ${tab.active ? sectionColor : 'transparent'}`,
              fontFamily: font,
              fontWeight: tab.active ? 500 : 400,
              whiteSpace: 'nowrap',
              transition: 'color 0.12s',
              cursor: 'pointer',
            }

            if (tab.href) {
              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  style={{ ...baseStyle, textDecoration: 'none', display: 'block' }}
                  onMouseEnter={e => { if (!tab.active) e.currentTarget.style.color = 'rgba(240,235,226,0.6)' }}
                  onMouseLeave={e => { if (!tab.active) e.currentTarget.style.color = 'rgba(240,235,226,0.3)' }}
                >
                  {tab.label}
                </Link>
              )
            }

            return (
              <button
                key={tab.label}
                onClick={tab.onClick}
                style={{ ...baseStyle, background: 'none', border: 'none', borderBottom: `2px solid ${tab.active ? sectionColor : 'transparent'}` }}
                onMouseEnter={e => { if (!tab.active) e.currentTarget.style.color = 'rgba(240,235,226,0.6)' }}
                onMouseLeave={e => { if (!tab.active) e.currentTarget.style.color = 'rgba(240,235,226,0.3)' }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Bottom padding when no tabs */}
      {(!tabs || tabs.length === 0) && <div style={{ height: '32px' }} />}
    </div>
  )
}
