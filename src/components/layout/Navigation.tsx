'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { NotificationBell } from '@/components/ui/NotificationBell'
import { LogoIcon } from '@/components/layout/Logo'

interface AliasInfo {
  id: string
  name: string
  genre: string
}

type NavItem = { label: string; href: string; sub: { label: string; href: string }[] }
type NavGroup = { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [
      { label: 'Dashboard', href: '/dashboard', sub: [] },
    ],
  },
  {
    label: '',
    items: [
      { label: 'Broadcast Lab', href: '/broadcast', sub: [] },
      { label: 'Set Lab', href: '/setlab', sub: [] },
      { label: 'SONIX Lab', href: '/sonix', sub: [] },
      { label: 'Tour Lab', href: '/gigs', sub: [] },
      { label: 'Drop Lab', href: '/releases', sub: [] },
      { label: 'Mind', href: '/meditate', sub: [] },
    ],
  },
]

const HIDDEN_ROUTES = ['/', '/pricing', '/login', '/onboarding', '/mobile', '/join']

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [apiUsage, setApiUsage] = useState<{ percentUsed: number; totalCostUsd: number; warning: boolean; critical: boolean } | null>(null)
  const [aliases, setAliases] = useState<AliasInfo[]>([])
  const [activeAliasId, setActiveAliasId] = useState<string | null>(null)
  const [artistName, setArtistName] = useState('Signal Lab')
  const [showAliasSwitcher, setShowAliasSwitcher] = useState(false)
  const aliasSwitcherRef = useRef<HTMLDivElement>(null)

  async function handleLogout() {
    const { createBrowserClient } = await import('@supabase/auth-helpers-nextjs')
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signOut()
    router.push('/login')
  }

  useEffect(() => {
    fetch('/api/usage').then(r => r.json()).then(d => {
      if (!d.error) setApiUsage(d)
    }).catch(() => {})
    const t = setInterval(() => {
      fetch('/api/usage').then(r => r.json()).then(d => { if (!d.error) setApiUsage(d) }).catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // Load aliases for the switcher
  useEffect(() => {
    const stored = localStorage.getItem('activeAliasId')
    if (stored) setActiveAliasId(stored)

    fetch('/api/settings').then(r => r.json()).then(d => {
      if (d.settings?.aliases && d.settings.aliases.length > 0) {
        setAliases(d.settings.aliases)
      }
      if (d.settings?.profile?.name) {
        setArtistName(d.settings.profile.name)
      }
    }).catch(() => {})
  }, [])

  // Close alias switcher on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (aliasSwitcherRef.current && !aliasSwitcherRef.current.contains(e.target as Node)) {
        setShowAliasSwitcher(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (HIDDEN_ROUTES.includes(pathname) || pathname.startsWith('/join/')) {
    return null
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    if (href === '/gigs') return pathname === '/gigs' || pathname.startsWith('/gigs/')
    return pathname === href || pathname.startsWith(href + '/')
  }

  function isParentActive(item: NavItem) {
    return isActive(item.href) || item.sub.some(s => isActive(s.href))
  }

  const showApiBar = apiUsage && (apiUsage.warning || apiUsage.critical)

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="sidebar-nav" style={{
        width: 200,
        minWidth: 200,
        background: 'var(--bg)',
        borderRight: '1px solid var(--border-dim)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        scrollbarWidth: 'none',
      }}>

        {/* Brand */}
        <div style={{ padding: '24px 24px 22px', borderBottom: '1px solid var(--border-dim)' }}>
          <Link href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
            <LogoIcon size={32} />
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              fontWeight: 300,
              letterSpacing: '0.06em',
              color: 'var(--text)',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>
              Signal Lab <span style={{ color: 'var(--gold)', fontWeight: 300 }}>OS</span>
            </div>
          </Link>
        </div>

        {/* Alias switcher — only shown if aliases exist */}
        {aliases.length > 0 && (
          <div ref={aliasSwitcherRef} style={{ padding: '10px 24px', borderBottom: '1px solid var(--border-dim)', position: 'relative' }}>
            <button
              onClick={() => setShowAliasSwitcher(!showAliasSwitcher)}
              style={{
                width: '100%',
                background: 'rgba(176,141,87,0.06)',
                border: '1px solid rgba(176,141,87,0.2)',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--gold)', textTransform: 'uppercase' }}>
                {activeAliasId ? (aliases.find(a => a.id === activeAliasId)?.name || artistName) : artistName}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-dimmer)', transform: showAliasSwitcher ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                v
              </span>
            </button>

            {showAliasSwitcher && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 24,
                right: 24,
                background: 'var(--bg)',
                border: '1px solid var(--border-dim)',
                zIndex: 50,
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              }}>
                <button
                  onClick={() => {
                    localStorage.removeItem('activeAliasId')
                    setActiveAliasId(null)
                    setShowAliasSwitcher(false)
                    window.location.reload()
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: !activeAliasId ? 'rgba(176,141,87,0.08)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-dim)',
                    color: !activeAliasId ? 'var(--gold)' : 'var(--text-dimmer)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(176,141,87,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = !activeAliasId ? 'rgba(176,141,87,0.08)' : 'transparent'}
                >
                  {artistName} <span style={{ color: 'var(--text-dimmest)', fontSize: 9 }}>(primary)</span>
                </button>
                {aliases.map(alias => {
                  const isActive = activeAliasId === alias.id
                  return (
                    <button
                      key={alias.id}
                      onClick={() => {
                        localStorage.setItem('activeAliasId', alias.id)
                        setActiveAliasId(alias.id)
                        setShowAliasSwitcher(false)
                        window.location.reload()
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: isActive ? 'rgba(176,141,87,0.08)' : 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border-dim)',
                        color: isActive ? 'var(--gold)' : 'var(--text-dimmer)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(176,141,87,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = isActive ? 'rgba(176,141,87,0.08)' : 'transparent'}
                    >
                      {alias.name} {alias.genre && <span style={{ color: 'var(--text-dimmest)', fontSize: 9 }}>({alias.genre})</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Nav body */}
        <div style={{ flex: 1, padding: '16px 0' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label || gi}>
              {group.label ? (
                <div style={{
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: '0.2em',
                  color: 'var(--text-dimmest)',
                  textTransform: 'uppercase',
                  padding: '20px 28px 8px',
                }}>
                  {group.label}
                </div>
              ) : gi > 0 ? (
                <div style={{ height: 1, background: 'var(--border-dim)', margin: '10px 28px' }} />
              ) : null}

              <div>
                {group.items.map(item => {
                  const parentActive = isParentActive(item)

                  return (
                    <div key={item.href}>
                      <Link
                        href={item.href}
                        style={{
                          display: 'block',
                          padding: '10px 28px',
                          textDecoration: 'none',
                          fontSize: 12.5,
                          fontWeight: parentActive ? 500 : 400,
                          color: parentActive ? 'var(--gold-bright)' : 'var(--text-dimmer)',
                          borderLeft: parentActive ? '2px solid var(--gold-bright)' : '2px solid transparent',
                          background: parentActive ? 'rgba(201,169,110,0.06)' : 'transparent',
                          transition: 'color 0.12s, background 0.12s',
                        }}
                        onMouseEnter={e => { if (!parentActive) { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)' } }}
                        onMouseLeave={e => { if (!parentActive) { e.currentTarget.style.color = 'var(--text-dimmer)'; e.currentTarget.style.background = 'transparent' } }}
                      >
                        {item.label}
                      </Link>

                      {item.sub.length > 0 && parentActive && (
                        <div>
                          {item.sub.map(s => {
                            const subActive = pathname === s.href
                            return (
                              <Link
                                key={s.href}
                                href={s.href}
                                style={{
                                  display: 'block',
                                  padding: '8px 28px 8px 44px',
                                  fontSize: 12,
                                  textDecoration: 'none',
                                  color: subActive ? 'var(--gold-bright)' : 'var(--text-dimmest)',
                                  transition: 'color 0.12s',
                                }}
                                onMouseEnter={e => { if (!subActive) e.currentTarget.style.color = 'var(--text-dimmer)' }}
                                onMouseLeave={e => { if (!subActive) e.currentTarget.style.color = 'var(--text-dimmest)' }}
                              >
                                {s.label}
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* API usage — only show when warning/critical */}
        {showApiBar && (
          <div style={{ padding: '10px 28px 12px', borderTop: '1px solid var(--border-dim)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 8, letterSpacing: '0.18em', color: apiUsage.critical ? 'var(--red-brown)' : 'var(--gold)', textTransform: 'uppercase' }}>
                {apiUsage.critical ? 'Critical' : 'Warning'}
              </span>
              <span style={{ fontSize: 8, color: apiUsage.critical ? 'var(--red-brown)' : 'var(--gold)' }}>
                {apiUsage.percentUsed}%
              </span>
            </div>
            <div style={{ height: 2, background: 'var(--border-dim)', borderRadius: 2 }}>
              <div style={{
                height: 2, borderRadius: 2,
                width: `${Math.min(apiUsage.percentUsed, 100)}%`,
                background: apiUsage.critical ? 'var(--red-brown)' : 'var(--gold)',
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border-dim)', padding: '8px 0', marginTop: 'auto' }}>
          <Link href="/business/settings" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 28px',
            textDecoration: 'none',
            fontSize: 12.5,
            color: pathname === '/business/settings' ? 'var(--gold-bright)' : 'var(--text-dimmer)',
            borderLeft: pathname === '/business/settings' ? '2px solid var(--gold-bright)' : '2px solid transparent',
            background: pathname === '/business/settings' ? 'rgba(201,169,110,0.06)' : 'transparent',
            transition: 'color 0.12s',
          }}
          onMouseEnter={e => { if (pathname !== '/business/settings') e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { if (pathname !== '/business/settings') e.currentTarget.style.color = 'var(--text-dimmer)' }}
          >
            Settings
          </Link>
          <button
            onClick={handleLogout}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              borderLeft: '2px solid transparent',
              padding: '8px 28px',
              textDecoration: 'none',
              fontSize: 12.5,
              fontFamily: 'var(--font-mono)',
              fontWeight: 400,
              color: 'var(--text-dimmer)',
              cursor: 'pointer',
              transition: 'color 0.12s',
              letterSpacing: 'inherit',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)' }}
          >
            Logout
          </button>
          <div style={{ padding: '2px 28px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: 9,
              color: 'var(--text-dimmest)',
              letterSpacing: '0.1em',
            }}>
              signallabos.com
            </span>
            <NotificationBell />
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-tab-bar" style={{
        display: 'none',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        background: 'var(--bg)',
        borderTop: '1px solid var(--border-dim)',
        zIndex: 1000,
        fontFamily: 'var(--font-mono)',
        backdropFilter: 'blur(16px)',
      }}>
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'space-evenly', width: '100%', position: 'relative' }}>
          {/* Home */}
          <Link href="/dashboard" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            textDecoration: 'none', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: isActive('/dashboard') ? 'var(--gold)' : 'var(--text-dimmer)',
            padding: '8px 0', flex: 1,
          }}>
            <div style={{ fontSize: '18px', lineHeight: 1, marginBottom: '2px' }}>—</div>
            Home
          </Link>

          {/* Scan */}
          <Link href="/setlab" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            textDecoration: 'none', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: isActive('/setlab') ? 'var(--gold)' : 'var(--text-dimmer)',
            padding: '8px 0', flex: 1,
          }}>
            <div style={{ fontSize: '18px', lineHeight: 1, marginBottom: '2px' }}>◎</div>
            Scan
          </Link>

          {/* Upload */}
          <Link href="/broadcast" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            textDecoration: 'none', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: isActive('/broadcast') ? 'var(--gold)' : 'var(--text-dimmer)',
            padding: '8px 0', flex: 1,
          }}>
            <div style={{ fontSize: '18px', lineHeight: 1, marginBottom: '2px' }}>↑</div>
            Upload
          </Link>

          {/* Tour */}
          <Link href="/gigs" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            textDecoration: 'none', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: isActive('/gigs') ? 'var(--gold)' : 'var(--text-dimmer)',
            padding: '8px 0', flex: 1,
          }}>
            <div style={{ fontSize: '18px', lineHeight: 1, marginBottom: '2px' }}>◆</div>
            Tour
          </Link>

          {/* Recharge */}
          <Link href="/meditate" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            textDecoration: 'none', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: isActive('/meditate') ? 'var(--gold)' : 'var(--text-dimmer)',
            padding: '8px 0', flex: 1,
          }}>
            <div style={{ fontSize: '16px', lineHeight: 1, marginBottom: '2px' }}>✦</div>
            Mind
          </Link>
        </div>
      </nav>
    </>
  )
}
