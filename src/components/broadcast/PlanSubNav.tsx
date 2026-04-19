'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * PlanSubNav — the second-level strip that lives under the Plan tab.
 *
 * Plan collapses the old Ideas + Strategy pages into one top-nav entry.
 * Each keeps its own route for deep-linkable URLs, but this strip gives
 * the user a visible way to hop between the two without re-opening the
 * sidebar. Mirrors the SignalLabHeader styling (mono font, tracked-out
 * labels, active tab in gold with an underline) so the two strips read
 * as one continuous nav.
 *
 * Rendered from `/broadcast/ideas/page.tsx` and `ContentStrategy` just
 * below the SignalLabHeader.
 */

const SUB_TABS: { label: string; href: string }[] = [
  { label: 'Ideas', href: '/broadcast/ideas' },
  { label: 'Strategy', href: '/broadcast/strategy' },
]

export function PlanSubNav() {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div
      style={{
        padding: '14px 48px',
        borderBottom: '1px solid var(--border-dim)',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {SUB_TABS.map(tab => {
        const active = isActive(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              color: active ? 'var(--gold)' : 'var(--text-dimmer)',
              fontWeight: active ? 500 : 400,
              paddingBottom: 4,
              borderBottom: active ? '1px solid var(--gold)' : '1px solid transparent',
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-dimmer)' }}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
