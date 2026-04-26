'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'

type Status = 'pending' | 'shortlisted' | 'rejected' | 'used'

interface Clip {
  id: string
  source_type: string
  source_url: string
  title: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  status: Status
  scan_id: string | null
  caption_draft: string | null
  notes: string | null
  imported_at: string
}

const FILTERS: { label: string; value: Status | 'all' }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Shortlisted', value: 'shortlisted' },
  { label: 'Used', value: 'used' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: 'all' },
]

export default function ClipInboxPage() {
  const [clips, setClips] = useState<Clip[]>([])
  const [filter, setFilter] = useState<Status | 'all'>('pending')
  const [loading, setLoading] = useState(true)
  const [urlsText, setUrlsText] = useState('')
  const [importing, setImporting] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/clip-inbox/list?status=${filter}&limit=300`)
    const d = await r.json()
    setClips(d.clips ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  async function importUrls() {
    const urls = urlsText.split(/\s+/).map(s => s.trim()).filter(Boolean)
    if (urls.length === 0) return
    setImporting(true)
    const r = await fetch('/api/clip-inbox/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    })
    const d = await r.json()
    if (r.ok) {
      setBanner(`Imported ${d.inserted}, skipped ${d.skipped} duplicates.`)
      setUrlsText('')
      load()
    } else {
      setBanner(`Error: ${d.error || 'unknown'}`)
    }
    setImporting(false)
    setTimeout(() => setBanner(null), 4000)
  }

  async function setStatus(clip: Clip, status: Status) {
    await fetch(`/api/clip-inbox/${clip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  async function remove(clip: Clip) {
    if (!window.confirm(`Delete "${clip.title ?? 'clip'}"?`)) return
    await fetch(`/api/clip-inbox/${clip.id}`, { method: 'DELETE' })
    load()
  }

  // Hotkeys: s = shortlist, r = reject, u = used, x = delete — when a clip is focused
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!focusId) return
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      const clip = clips.find(c => c.id === focusId)
      if (!clip) return
      if (e.key === 's') { e.preventDefault(); setStatus(clip, 'shortlisted') }
      else if (e.key === 'r') { e.preventDefault(); setStatus(clip, 'rejected') }
      else if (e.key === 'u') { e.preventDefault(); setStatus(clip, 'used') }
      else if (e.key === 'x') { e.preventDefault(); remove(clip) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, clips])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PageHeader
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Clip Inbox' }]}
        section="CONTENT"
        title="Clip Inbox"
        subtitle="Triage raw footage. Shortlist, reject, draft. Nothing ships until you click."
        tabs={FILTERS.map(f => ({
          label: f.label,
          active: filter === f.value,
          onClick: () => setFilter(f.value),
        }))}
      />

      <div style={{ padding: '24px 48px 64px' }}>
        {/* Import panel */}
        <div style={{
          border: '1px solid var(--border-dim)',
          padding: '16px',
          marginBottom: '24px',
          background: 'var(--bg-raised)',
        }}>
          <div style={{
            fontSize: '9px',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'var(--text-dimmest)',
            marginBottom: '8px',
            fontFamily: 'var(--font-mono)',
          }}>Paste Dropbox links (one per line)</div>
          <textarea
            value={urlsText}
            onChange={e => setUrlsText(e.target.value)}
            rows={4}
            placeholder="https://www.dropbox.com/scl/fi/.../clip.mov?..."
            style={{
              width: '100%',
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border-dim)',
              padding: '10px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px' }}>
            <button
              onClick={importUrls}
              disabled={importing || !urlsText.trim()}
              style={{
                background: 'var(--gold)',
                color: 'var(--bg)',
                border: 'none',
                padding: '8px 16px',
                fontSize: '11px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                cursor: importing ? 'wait' : 'pointer',
                opacity: importing || !urlsText.trim() ? 0.5 : 1,
              }}
            >{importing ? 'Importing…' : 'Import'}</button>
            {banner && <span style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{banner}</span>}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ color: 'var(--text-dimmer)', fontSize: '12px' }}>Loading…</div>
        ) : clips.length === 0 ? (
          <div style={{ color: 'var(--text-dimmer)', fontSize: '12px' }}>
            No clips in <strong>{filter}</strong>. Paste some Dropbox links above to start.
          </div>
        ) : (
          <>
            <div style={{
              fontSize: '10px',
              color: 'var(--text-dimmest)',
              fontFamily: 'var(--font-mono)',
              marginBottom: '12px',
            }}>
              {clips.length} clip{clips.length === 1 ? '' : 's'} · Click to focus · <kbd>s</kbd> shortlist · <kbd>r</kbd> reject · <kbd>u</kbd> used · <kbd>x</kbd> delete
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}>
              {clips.map(clip => (
                <ClipTile
                  key={clip.id}
                  clip={clip}
                  focused={focusId === clip.id}
                  onFocus={() => setFocusId(clip.id)}
                  onSetStatus={(s) => setStatus(clip, s)}
                  onDelete={() => remove(clip)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ClipTile({
  clip,
  focused,
  onFocus,
  onSetStatus,
  onDelete,
}: {
  clip: Clip
  focused: boolean
  onFocus: () => void
  onSetStatus: (s: Status) => void
  onDelete: () => void
}) {
  const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(clip.source_url) || clip.source_type === 'dropbox'
  return (
    <div
      onClick={onFocus}
      style={{
        border: focused ? '1px solid var(--gold)' : '1px solid var(--border-dim)',
        background: 'var(--bg-raised)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ aspectRatio: '16/9', background: '#000', overflow: 'hidden' }}>
        {isVideo ? (
          <video
            src={clip.source_url}
            preload="metadata"
            controls={focused}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ padding: '16px', color: 'var(--text-dimmer)', fontSize: '11px' }}>
            {clip.source_type}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{
          fontSize: '12px',
          color: 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{clip.title || 'Untitled'}</div>
        <div style={{
          fontSize: '9px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--text-dimmest)',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>{clip.source_type}</span>
          <span>{clip.status}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Link
            href={`/clip-inbox/${clip.id}/edit`}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              color: 'var(--gold)',
              border: '1px solid var(--gold)',
              padding: '4px 8px',
              fontSize: 10,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)',
              textDecoration: 'none',
            }}
          >Edit</Link>
          <TileBtn onClick={(e) => { e.stopPropagation(); onSetStatus('shortlisted') }} label="Shortlist" />
          <TileBtn onClick={(e) => { e.stopPropagation(); onSetStatus('rejected') }} label="Reject" />
          <TileBtn onClick={(e) => { e.stopPropagation(); onSetStatus('used') }} label="Used" />
          <TileBtn onClick={(e) => { e.stopPropagation(); onDelete() }} label="Delete" danger />
        </div>
      </div>
    </div>
  )
}

function TileBtn({ onClick, label, danger }: { onClick: (e: React.MouseEvent) => void; label: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        color: danger ? 'var(--danger, #d44)' : 'var(--text-dimmer)',
        border: '1px solid var(--border-dim)',
        padding: '4px 8px',
        fontSize: '10px',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
      }}
    >{label}</button>
  )
}
