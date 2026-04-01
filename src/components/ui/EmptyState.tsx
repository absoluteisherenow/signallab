'use client'

import Link from 'next/link'

interface EmptyStateAction {
  label: string
  href: string
  primary?: boolean
}

interface EmptyStateProps {
  title: string
  description?: string
  actions?: EmptyStateAction[]
}

export function EmptyState({ title, description, actions }: EmptyStateProps) {
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border-dim)',
      padding: '64px 40px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '10px',
        letterSpacing: '0.3em',
        color: 'var(--text-dimmer)',
        textTransform: 'uppercase',
        marginBottom: '20px',
        fontFamily: 'var(--font-mono)',
      }}>
        {title}
      </div>
      {description && (
        <div style={{
          fontSize: '13px',
          color: 'var(--text-dim)',
          marginBottom: actions ? '32px' : '0',
          maxWidth: '420px',
          margin: actions ? '0 auto 32px' : '0 auto',
          lineHeight: 1.6,
          fontFamily: 'var(--font-mono)',
        }}>
          {description}
        </div>
      )}
      {actions && actions.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          {actions.map(action => (
            <Link
              key={action.label}
              href={action.href}
              className={action.primary ? 'btn-primary' : 'btn-secondary'}
              style={{ textDecoration: 'none' }}
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
