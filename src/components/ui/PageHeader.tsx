'use client'

import Link from 'next/link'

interface Breadcrumb {
  label: string
  href?: string
}

interface Tab {
  label: string
  href?: string
  onClick?: () => void
  active: boolean
}

interface PageHeaderProps {
  breadcrumb?: Breadcrumb[]
  section: string
  sectionColor?: string
  title: string
  subtitle?: string
  right?: React.ReactNode
  tabs?: Tab[]
}

export function PageHeader({
  breadcrumb,
  section,
  sectionColor = 'var(--gold)',
  title,
  subtitle,
  right,
  tabs,
}: PageHeaderProps) {
  return (
    <div style={{ padding: '40px 48px 0', borderBottom: '1px solid var(--border-dim)' }}>

      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '9px',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--text-dimmest)',
          marginBottom: '16px',
          fontFamily: 'var(--font-mono)',
        }}>
          {breadcrumb.map((crumb, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {i > 0 && <span style={{ color: 'var(--border)' }}>{'>'}</span>}
              {crumb.href ? (
                <Link href={crumb.href} style={{
                  color: 'var(--text-dimmer)',
                  textDecoration: 'none',
                  transition: 'color 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-dim)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmer)'}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span style={{ color: 'var(--text-dimmer)' }}>{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: tabs && tabs.length > 0 ? '20px' : '0' }}>
        <div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.22em',
            color: sectionColor,
            textTransform: 'uppercase',
            marginBottom: '12px',
            fontFamily: 'var(--font-mono)',
          }}>
            {section}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(40px, 5vw, 64px)',
            fontWeight: 300,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            color: 'var(--text)',
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontSize: '13px',
              color: 'var(--text-dimmer)',
              marginTop: '14px',
              lineHeight: 1.5,
              maxWidth: '560px',
              fontFamily: 'var(--font-mono)',
            }}>
              {subtitle}
            </div>
          )}
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
              color: tab.active ? 'var(--text)' : 'rgba(240,235,226,0.3)',
              borderBottom: `2px solid ${tab.active ? sectionColor : 'transparent'}`,
              fontFamily: 'var(--font-mono)',
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
      {(!tabs || tabs.length === 0) && <div style={{ height: '24px' }} />}
    </div>
  )
}
