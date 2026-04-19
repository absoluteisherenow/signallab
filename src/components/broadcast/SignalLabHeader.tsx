'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Broadcast sub-nav tabs. The chain at `/broadcast` is the home surface and
 * doesn't get a tab — it's the default when you click Broadcast Lab in the
 * sidebar. Plan collapses the old Ideas + Strategy pages into one entry
 * (see PlanSubNav for the sub-view switcher).
 */
export const BROADCAST_TABS: { label: string; href: string }[] = [
  { label: 'Calendar', href: '/broadcast/calendar' },
  { label: 'Media', href: '/broadcast/media' },
  { label: 'Plan', href: '/broadcast/plan' },
]

/**
 * Grow Lab sub-nav tabs. `/grow` now houses paid + acquisition — Ads, Growth
 * trajectory, and DM Automations — under a single top-level sidebar entry
 * (different job from Broadcast's organic-compose-and-publish loop).
 */
export const GROW_TABS: { label: string; href: string }[] = [
  { label: 'Ads', href: '/grow/ads' },
  { label: 'Growth', href: '/grow/growth' },
  { label: 'Automations', href: '/grow/automations' },
]

interface SignalLabHeaderProps {
  right?: React.ReactNode
  /**
   * Optional centered slot — absolutely positioned in the header's title row
   * so it sits horizontally centered on the page regardless of what's in the
   * left title block or right meta slot. Used by the chain page to centre
   * the PhaseRail progress indicator.
   */
  center?: React.ReactNode
  /**
   * Optional override. If not supplied, the header auto-detects whether the
   * current URL is `/grow/*` or `/broadcast/*` and swaps tabs + eyebrow.
   * Passed explicitly only by surfaces that don't live under either prefix
   * (rare — most callers can rely on auto-detect).
   */
  tabs?: { label: string; href: string }[]
  eyebrow?: string
  /**
   * Override the big display title when no tab is active. Without this the
   * title falls back to the eyebrow ("Broadcast Lab" → two words, wraps on
   * narrow viewports and pushes the tabs down by a line — breaking tab
   * position parity with single-word pages like Calendar / Media / Plan).
   */
  title?: string
  /**
   * Compact variant — shrinks the display title and trims padding. Used by
   * vertically-dense surfaces (e.g. the Broadcast chain) so the shared
   * header structure stays consistent site-wide without eating the canvas.
   */
  compact?: boolean
  /**
   * Hide the giant display title (visibility, not display) so the tab row
   * lands at the exact same Y coordinate as every other page — critical for
   * muscle memory nav. Used on surfaces where the title is redundant with
   * the page's own centrepiece (e.g. the chain, where the giant "DROP" is
   * the title already).
   */
  hideTitle?: boolean
}

export function SignalLabHeader({ right, center, tabs, eyebrow, title, compact = false, hideTitle = false }: SignalLabHeaderProps) {
  const pathname = usePathname()

  // Auto-switch: if the caller didn't override, pick the right nav by URL.
  // Keeps every existing page working without touching imports.
  const inGrow = pathname.startsWith('/grow')
  const resolvedTabs = tabs ?? (inGrow ? GROW_TABS : BROADCAST_TABS)
  const resolvedEyebrow = eyebrow ?? (inGrow ? 'Grow Lab' : 'Broadcast Lab')

  function isActive(href: string) {
    // `/broadcast/plan` is the nav entry but the real content lives at
    // `/broadcast/ideas` and `/broadcast/strategy` — mark Plan active on
    // any of those three so the tab bar never goes cold.
    if (href === '/broadcast/plan') {
      return (
        pathname === '/broadcast/plan' ||
        pathname.startsWith('/broadcast/plan/') ||
        pathname === '/broadcast/ideas' ||
        pathname.startsWith('/broadcast/ideas/') ||
        pathname === '/broadcast/strategy' ||
        pathname.startsWith('/broadcast/strategy/')
      )
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  // If no tab is active (e.g. on /broadcast chain root or /grow landing),
  // fall back to: explicit `title` prop → single-word derived from eyebrow
  // → the eyebrow itself. Single-word fallback keeps tabs at the same Y as
  // the single-word titled sibling pages (Calendar / Media / Plan).
  const activeTab = resolvedTabs.find(t => isActive(t.href))
  const fallbackTitle = title ?? resolvedEyebrow.split(' ')[0]
  const displayLabel = activeTab?.label ?? fallbackTitle

  const s = {
    gold: 'var(--gold)',
    text: 'var(--text)',
    border: 'var(--border-dim)',
    font: 'var(--font-mono)',
  }

  const padTop = compact ? '20px' : '40px'
  const padX = compact ? '32px' : '48px'
  const titleSize = compact ? 'clamp(28px, 3.6vw, 48px)' : 'clamp(48px, 7vw, 96px)'
  const titleMB = compact ? '10px' : '20px'
  const eyebrowMB = compact ? '6px' : '12px'

  return (
    <div style={{ padding: `${padTop} ${padX} 0`, borderBottom: `1px solid ${s.border}`, position: 'relative', zIndex: 10, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: titleMB, position: 'relative' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: eyebrowMB, fontFamily: s.font }}>
            {resolvedEyebrow}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: titleSize, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.9, textTransform: 'uppercase', color: s.text, whiteSpace: 'nowrap', visibility: hideTitle ? 'hidden' : 'visible' }}>
            {displayLabel}
          </div>
        </div>
        {center && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              pointerEvents: 'auto',
            }}
          >
            {center}
          </div>
        )}
        {right && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {right}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0' }}>
        {resolvedTabs.map(tab => {
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
