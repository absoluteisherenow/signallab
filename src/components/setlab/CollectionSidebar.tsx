'use client'

import { useState } from 'react'

interface SidebarProps {
  // Counts
  totalTracks: number
  discoveryCount: number
  wantlistCount: number
  playlists: Record<string, number> // name → track count
  pastSets: Array<{ id: string; name: string; tracks?: string; created_at: string }>
  folders: Array<{ id: string; name: string; path: string; track_count: number }>
  // Current selection
  activeSection: string
  onSectionChange: (section: string) => void
  // Intelligence tab
  onIntelligence?: () => void
  intelligenceActive?: boolean
  // Actions
  onImportRekordbox?: () => void
  onAddFolder?: () => void
}

export function CollectionSidebar({
  totalTracks, discoveryCount, wantlistCount,
  playlists, pastSets, folders,
  activeSection, onSectionChange,
  onIntelligence, intelligenceActive,
  onImportRekordbox, onAddFolder,
}: SidebarProps) {
  const [collectionOpen, setCollectionOpen] = useState(true)
  const [playlistsOpen, setPlaylistsOpen] = useState(true)
  const [setsOpen, setSetsOpen] = useState(false)
  const [foldersOpen, setFoldersOpen] = useState(false)

  const s = {
    bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
    gold: 'var(--gold)', goldDim: 'var(--gold-dim)',
    text: 'var(--text)', textDim: 'var(--text-dim)', textDimmer: 'var(--text-dimmer)',
    setlab: 'var(--red-brown)', font: 'var(--font-mono)',
  }

  const item = (key: string, label: string, count: number, indent = 0) => (
    <button
      key={key}
      onClick={() => onSectionChange(key)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '7px 16px 7px ' + (16 + indent * 16) + 'px',
        background: activeSection === key ? 'rgba(176, 141, 87, 0.08)' : 'transparent',
        border: 'none', borderLeft: activeSection === key ? '2px solid ' + s.setlab : '2px solid transparent',
        color: activeSection === key ? s.text : s.textDim,
        fontFamily: s.font, fontSize: '11px', letterSpacing: '0.04em',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.12s',
      }}
      onMouseEnter={e => { if (activeSection !== key) (e.currentTarget.style.background = 'rgba(176, 141, 87, 0.04)') }}
      onMouseLeave={e => { if (activeSection !== key) (e.currentTarget.style.background = 'transparent') }}
    >
      <span>{label}</span>
      <span style={{ fontSize: '10px', color: s.textDimmer, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </button>
  )

  const sectionHeader = (label: string, open: boolean, toggle: () => void, action?: { label: string; onClick: () => void }) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px 6px', cursor: 'pointer', userSelect: 'none',
    }}>
      <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
        <span style={{
          fontSize: '8px', color: s.textDimmer, transition: 'transform 0.15s',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block',
        }}>&#9654;</span>
        <span style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: s.textDimmer, fontFamily: s.font }}>
          {label}
        </span>
      </div>
      {action && (
        <button
          onClick={e => { e.stopPropagation(); action.onClick() }}
          style={{
            background: 'none', border: 'none', color: s.textDimmer, fontFamily: s.font,
            fontSize: '14px', cursor: 'pointer', padding: '0 2px', lineHeight: 1,
          }}
          title={action.label}
        >+</button>
      )}
    </div>
  )

  return (
    <div style={{
      width: '220px', minWidth: '220px', height: '100vh',
      background: s.panel, borderRight: '1px solid ' + s.border,
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
      fontFamily: s.font,
    }}>
      {/* App title */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid ' + s.border,
      }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.25em', color: s.setlab, textTransform: 'uppercase', marginBottom: '4px' }}>
          SONIX
        </div>
        <div style={{ fontSize: '12px', letterSpacing: '0.08em', color: s.text, fontWeight: 400, marginBottom: '2px' }}>
          Set Lab
        </div>
      </div>

      {/* Collection */}
      {sectionHeader('Collection', collectionOpen, () => setCollectionOpen(v => !v))}
      {collectionOpen && (
        <div>
          {item('all', 'All Tracks', totalTracks)}
          {item('discoveries', 'Discoveries', discoveryCount)}
          {item('wantlist', 'Wantlist', wantlistCount)}
        </div>
      )}

      {/* Playlists */}
      {sectionHeader('Playlists', playlistsOpen, () => setPlaylistsOpen(v => !v))}
      {playlistsOpen && (
        <div>
          {Object.entries(playlists).length === 0 ? (
            <div style={{ padding: '6px 16px 6px 32px', fontSize: '10px', color: s.textDimmer, fontStyle: 'italic' }}>
              No playlists yet
            </div>
          ) : (
            Object.entries(playlists).map(([name, count]) =>
              item('playlist:' + name, name, count, 1)
            )
          )}
        </div>
      )}

      {/* Past Sets */}
      {sectionHeader('Sets', setsOpen, () => setSetsOpen(v => !v))}
      {setsOpen && (
        <div>
          {pastSets.length === 0 ? (
            <div style={{ padding: '6px 16px 6px 32px', fontSize: '10px', color: s.textDimmer, fontStyle: 'italic' }}>
              No saved sets
            </div>
          ) : (
            pastSets.map(ps => {
              let trackCount = 0
              try { trackCount = JSON.parse(ps.tracks || '[]').length } catch {}
              return item('set:' + ps.id, ps.name || 'Untitled', trackCount, 1)
            })
          )}
        </div>
      )}

      {/* Folders */}
      {sectionHeader('Folders', foldersOpen, () => setFoldersOpen(v => !v), onAddFolder ? { label: 'Add folder', onClick: onAddFolder } : undefined)}
      {foldersOpen && (
        <div>
          {folders.length === 0 ? (
            <div style={{ padding: '6px 16px 6px 32px', fontSize: '10px', color: s.textDimmer, fontStyle: 'italic' }}>
              No folders linked
            </div>
          ) : (
            folders.map(f => item('folder:' + f.id, f.name, f.track_count, 1))
          )}
        </div>
      )}

      {/* Intelligence */}
      {onIntelligence && (
        <div style={{ borderTop: '1px solid ' + s.border, marginTop: '8px', paddingTop: '4px' }}>
          <button
            onClick={onIntelligence}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              width: '100%', padding: '8px 16px',
              background: intelligenceActive ? 'rgba(176, 141, 87, 0.08)' : 'transparent',
              border: 'none', borderLeft: intelligenceActive ? '2px solid ' + s.gold : '2px solid transparent',
              color: intelligenceActive ? s.text : s.textDim,
              fontFamily: s.font, fontSize: '11px', letterSpacing: '0.04em',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { if (!intelligenceActive) (e.currentTarget.style.background = 'rgba(176, 141, 87, 0.04)') }}
            onMouseLeave={e => { if (!intelligenceActive) (e.currentTarget.style.background = 'transparent') }}
          >
            <span style={{ fontSize: '10px', opacity: 0.5 }}>◇</span>
            <span>Intelligence</span>
          </button>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Import button */}
      {onImportRekordbox && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid ' + s.border }}>
          <button
            onClick={onImportRekordbox}
            style={{
              width: '100%', padding: '9px 14px',
              background: 'transparent', border: '1px solid ' + s.setlab,
              color: s.setlab, fontFamily: s.font, fontSize: '10px',
              letterSpacing: '0.14em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(154,106,90,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Import library
          </button>
        </div>
      )}
    </div>
  )
}
