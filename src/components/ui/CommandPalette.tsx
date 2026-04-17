'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface PaletteItem {
  label: string
  section: string
  href: string
  keywords?: string[]
}

const ITEMS: PaletteItem[] = [
  // Navigation
  { label: 'Dashboard', section: 'Navigate', href: '/dashboard', keywords: ['home', 'overview'] },
  { label: 'Broadcast Lab', section: 'Navigate', href: '/broadcast', keywords: ['social', 'content', 'posts', 'instagram'] },
  { label: 'Content Calendar', section: 'Navigate', href: '/broadcast/calendar', keywords: ['schedule', 'plan'] },
  { label: 'Media Library', section: 'Navigate', href: '/broadcast/media', keywords: ['photos', 'videos', 'assets'] },
  { label: 'Set Lab', section: 'Navigate', href: '/setlab', keywords: ['dj', 'tracks', 'sets', 'mix'] },
  { label: 'Mix Scanner', section: 'Navigate', href: '/setlab/mix-scanner', keywords: ['analyse', 'scan', 'tracklist'] },
  { label: 'Rekordbox Import', section: 'Navigate', href: '/setlab/import', keywords: ['import', 'rekordbox', 'library'] },
  { label: 'SONIX Lab', section: 'Navigate', href: '/sonix', keywords: ['music', 'production', 'compose', 'arrange'] },
  { label: 'Tour Lab — Gigs', section: 'Navigate', href: '/gigs', keywords: ['shows', 'tour', 'bookings', 'dates'] },
  { label: 'Drop Lab — Releases', section: 'Navigate', href: '/releases', keywords: ['release', 'singles', 'ep', 'album'] },
  { label: 'Finances', section: 'Navigate', href: '/business/finances', keywords: ['invoices', 'money', 'payments', 'expenses'] },
  { label: 'Contracts', section: 'Navigate', href: '/contracts', keywords: ['booking', 'agreement', 'parse'] },
  { label: 'Settings', section: 'Navigate', href: '/business/settings', keywords: ['profile', 'account', 'preferences'] },
  // Quick actions
  { label: '+ New Gig', section: 'Create', href: '/gigs/new', keywords: ['add', 'book', 'show'] },
  { label: '+ New Release', section: 'Create', href: '/releases/new', keywords: ['add', 'drop', 'single'] },
  { label: '+ New Post', section: 'Create', href: '/broadcast', keywords: ['add', 'content', 'social'] },
  { label: '+ Upload Contract', section: 'Create', href: '/contracts', keywords: ['parse', 'booking'] },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const filtered = query.trim()
    ? ITEMS.filter(item => {
        const q = query.toLowerCase()
        return (
          item.label.toLowerCase().includes(q) ||
          item.section.toLowerCase().includes(q) ||
          item.keywords?.some(k => k.includes(q))
        )
      })
    : ITEMS

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setOpen(prev => !prev)
      setQuery('')
      setSelectedIndex(0)
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  function navigate(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      navigate(filtered[selectedIndex].href)
    }
  }

  if (!open) return null

  // Group items by section
  const sections: Record<string, PaletteItem[]> = {}
  filtered.forEach(item => {
    if (!sections[item.section]) sections[item.section] = []
    sections[item.section].push(item)
  })

  let globalIndex = -1

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '20vh',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          animation: 'fadeIn 0.15s ease forwards',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-dim)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages, actions..."
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              outline: 'none',
              padding: 0,
            }}
          />
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '8px 0' }}>
          {filtered.length === 0 && (
            <div style={{
              padding: '24px 20px',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--text-dimmer)',
              fontFamily: 'var(--font-mono)',
            }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              <div style={{
                padding: '8px 20px 4px',
                fontSize: '9px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--text-dimmest)',
                fontFamily: 'var(--font-mono)',
              }}>
                {section}
              </div>
              {items.map(item => {
                globalIndex++
                const idx = globalIndex
                const isSelected = idx === selectedIndex
                return (
                  <div
                    key={item.href}
                    onClick={() => navigate(item.href)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      padding: '10px 20px',
                      fontSize: '13px',
                      color: isSelected ? 'var(--text)' : 'var(--text-dim)',
                      background: isSelected ? 'rgba(255,42,26,0.08)' : 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.08s',
                    }}
                  >
                    <span>{item.label}</span>
                    {isSelected && (
                      <span style={{ fontSize: '10px', color: 'var(--text-dimmest)', letterSpacing: '0.1em' }}>
                        Enter
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border-dim)',
          fontSize: '10px',
          color: 'var(--text-dimmest)',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          gap: '16px',
        }}>
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  )
}
