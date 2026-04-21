'use client'

/**
 * Mobile quick-create menu — landing for the "+" tab slot on non-gig days.
 * Single screen with New Post / New Gig / Track ID / Capture Reminder.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BRT } from '@/lib/design/brt'

const C = BRT

const OPTIONS = [
  { label: 'New post', href: '/mobile/post', icon: '↗' },
  { label: 'Track ID', href: '/setlab', icon: '◎' },
  { label: 'New gig (desktop)', href: '/gigs', icon: '◆' },
  { label: 'Playlist grab', href: '/setlab', icon: '♫' },
]

export default function MobileCreatePage() {
  const router = useRouter()
  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      color: C.ink,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      paddingBottom: 96,
    }}>
      <div style={{
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${C.divide}`,
      }}>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          fontWeight: 800,
        }}>
          Create
        </div>
        <button
          onClick={() => router.back()}
          style={{
            background: 'none',
            border: 'none',
            color: C.inkDim,
            fontSize: 13,
            fontFamily: 'inherit',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            minHeight: 44,
            padding: '0 6px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {OPTIONS.map(opt => (
          <Link
            key={opt.label}
            href={opt.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '18px 16px',
              background: C.surface,
              border: `1px solid ${C.divide}`,
              color: C.ink,
              textDecoration: 'none',
              minHeight: 56,
            }}
          >
            <span style={{ fontSize: 22, color: C.red, width: 24, textAlign: 'center' }}>{opt.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{opt.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
