'use client'

import { useState, useEffect, useRef } from 'react'
import { SignalLabHeader } from './SignalLabHeader'

interface MediaItem {
  url: string
  key: string
  size: number
  uploadedAt: string
  category?: string
}

/**
 * One shared IntersectionObserver for every video tile on the page.
 *
 * The old pattern created a fresh IO per tile. At 120 tiles that was 120
 * observers + 120 `onTimeUpdate` handlers firing ~4×/sec each (480+ events
 * /second of React→DOM work just to trim preview loops). On this page that
 * was enough to starve the main thread and hard-crash navigation clicks
 * after a deploy — the sub-nav `<Link>`s would not respond.
 *
 * New pattern: a single module-level observer, `preload="none"` so we don't
 * spawn 120 metadata fetches on mount, and native `loop` instead of a
 * JS-driven preview trim. Videos still pause off-screen; we just don't
 * hand-crank currentTime anymore.
 */
let sharedVideoObserver: IntersectionObserver | null = null
function getSharedVideoObserver() {
  if (sharedVideoObserver || typeof window === 'undefined') return sharedVideoObserver
  sharedVideoObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        const v = entry.target as HTMLVideoElement
        if (entry.isIntersecting) {
          v.play().catch(() => { /* autoplay may be blocked — poster still renders */ })
        } else {
          v.pause()
        }
      }
    },
    { rootMargin: '200px 0px', threshold: 0.1 }
  )
  return sharedVideoObserver
}

function AutoplayVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    const io = getSharedVideoObserver()
    if (!el || !io) return
    io.observe(el)
    return () => io.unobserve(el)
  }, [])

  return (
    <video
      ref={ref}
      src={src + '#t=0.1'}
      muted
      loop
      playsInline
      preload="none"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

export function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/media')
      .then(r => r.json())
      .then(d => setItems(d.blobs || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const s = {
    bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
    gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
    font: 'var(--font-mono)',
  }

  function toggle(url: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
  }

  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  // Initial render cap — without this we paint N DOM nodes + trigger N image
  // fetches the instant the user clicks Media, which makes the tab feel dead
  // for seconds when there are hundreds of gig photos in R2. 48 = 12 rows at
  // 4 columns, ~2 viewports; reveal-all toggle shows the rest. Cut from 120
  // because 120 video tiles were saturating the main thread enough to make
  // sub-nav clicks stop responding.
  const INITIAL_CAP = 48
  const [showAll, setShowAll] = useState(false)

  const [dedupeRunning, setDedupeRunning] = useState(false)

  async function runDedupe(dupedCount: number) {
    if (dedupeRunning) return
    if (!window.confirm(`Delete ${dupedCount} duplicate file${dupedCount === 1 ? '' : 's'} from R2? The newest copy of each is kept. This cannot be undone.`)) return
    setDedupeRunning(true)
    try {
      const res = await fetch('/api/media/dedupe', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Dedupe failed')
      // Refresh list from server so delete keys are reflected
      const refreshed = await fetch('/api/media').then(r => r.json())
      setItems(refreshed.blobs || [])
      alert(`Deleted ${data.deleted} duplicate${data.deleted === 1 ? '' : 's'}. ${data.kept} unique file${data.kept === 1 ? '' : 's'} remain.`)
    } catch (err: any) {
      alert(`Dedupe failed: ${err.message}`)
    } finally {
      setDedupeRunning(false)
    }
  }

  async function uploadFiles(files: FileList) {
    setUploading(true)
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.url) {
          setItems(prev => [{ url: data.url, key: data.key || file.name, size: file.size, uploadedAt: new Date().toISOString() }, ...prev])
        }
      } catch { /* skip failed uploads */ }
    }
    setUploading(false)
  }

  async function deleteItem(url: string) {
    setDeleting(prev => new Set(prev).add(url))
    try {
      const item = items.find(i => i.url === url)
      const res = await fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item?.key }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.url !== url))
        setSelected(prev => { const next = new Set(prev); next.delete(url); return next })
      }
    } catch { /* ignore */ }
    setDeleting(prev => { const next = new Set(prev); next.delete(url); return next })
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }}
        onChange={e => e.target.files && uploadFiles(e.target.files)} />

      <SignalLabHeader right={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => fileRef.current?.click()} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: '32px', padding: '0 16px', borderRadius: '2px',
            background: 'rgba(255,42,26,0.15)', border: '1px solid rgba(255,42,26,0.35)',
            color: '#d4a843', fontFamily: s.font, fontSize: '9px', letterSpacing: '0.18em',
            textTransform: 'uppercase', cursor: 'pointer', fontWeight: 400,
          }}>
            + Upload media
          </button>
          {selected.size > 0 && (
            <button onClick={() => window.location.href = '/broadcast'} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              height: '32px', padding: '0 16px', borderRadius: '2px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(240,235,226,0.35)', fontFamily: s.font, fontSize: '9px', letterSpacing: '0.18em',
              textTransform: 'uppercase', cursor: 'pointer', fontWeight: 400,
            }}>
              Use {selected.size} in post
            </button>
          )}
        </div>
      } />

      <div style={{ padding: '40px 48px' }}>

      {loading ? (
        <div style={{ fontSize: '13px', color: s.dimmer, padding: '40px 0' }}>Loading media...</div>
      ) : items.length === 0 ? (
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: s.dim, marginBottom: '8px' }}>No media uploaded yet</div>
          <div style={{ fontSize: '12px', color: s.dimmer, marginBottom: '24px' }}>Upload photos and videos in Broadcast Lab</div>
          <a href="/broadcast" style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: s.gold, textDecoration: 'none', border: `1px solid ${s.gold}40`, padding: '12px 24px' }}>
            Go to Broadcast Lab →
          </a>
        </div>
      ) : (
        <>
        {(() => {
          const filtered = items.filter(item => !item.key?.includes('error') && !item.key?.includes('screenshot'))
          // Dedupe near-duplicates. Same category + same byte size = same image
          // uploaded twice (e.g. via different flows or accidental re-uploads).
          // Not perfect — two different photos with identical byte count would
          // collapse — but in practice R2 filenames are unique-per-upload, so
          // only true duplicates hit both keys.
          const seen = new Map<string, typeof filtered[0]>()
          for (const item of filtered) {
            const cat = item.key?.split('/')[1] ?? 'other'
            const sig = `${cat}:${item.size}`
            const existing = seen.get(sig)
            if (!existing || (item.uploadedAt && existing.uploadedAt && new Date(item.uploadedAt) > new Date(existing.uploadedAt))) {
              seen.set(sig, item)
            }
          }
          const visible = Array.from(seen.values()).sort((a, b) => {
            const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
            const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
            return tb - ta
          })
          const sliced = showAll ? visible : visible.slice(0, INITIAL_CAP)
          const hidden = visible.length - sliced.length
          const duped = filtered.length - visible.length
          return (
            <>
        {duped > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: s.dimmer }}>
              {visible.length} unique · {duped} duplicate{duped === 1 ? '' : 's'} hidden
            </div>
            <button
              onClick={() => runDedupe(duped)}
              disabled={dedupeRunning}
              style={{
                background: dedupeRunning ? 'transparent' : 'rgba(192,64,64,0.08)',
                border: `1px solid ${dedupeRunning ? s.border : 'rgba(192,64,64,0.4)'}`,
                color: dedupeRunning ? s.dimmer : '#c04040',
                fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em',
                textTransform: 'uppercase', padding: '8px 16px',
                cursor: dedupeRunning ? 'wait' : 'pointer',
              }}
            >
              {dedupeRunning ? 'Deleting…' : `Delete ${duped} duplicate${duped === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {sliced.map(item => (
            <div key={item.url} onClick={() => toggle(item.url)} style={{
              background: s.panel,
              border: `1px solid ${selected.has(item.url) ? s.gold : s.border}`,
              cursor: 'pointer',
              transition: 'all 0.15s',
              position: 'relative',
            }}>
              <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#1d1d1d' }}>
                {/\.(mp4|mov|webm|m4v)$/i.test(item.key ?? item.url) ? (
                  <AutoplayVideo src={item.url} />
                ) : (
                  <img src={item.url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).src = '' }} />
                )}
              </div>
              {selected.has(item.url) && (
                <div style={{ position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px', background: s.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#050505', fontWeight: 600 }}>✓</div>
              )}
              {/* Delete button */}
              <button
                onClick={e => { e.stopPropagation(); if (!window.confirm('Delete this media?')) return; deleteItem(item.url) }}
                disabled={deleting.has(item.url)}
                style={{
                  position: 'absolute', top: '8px', left: '8px',
                  width: '24px', height: '24px',
                  background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(192,64,64,0.4)',
                  color: deleting.has(item.url) ? '#666' : '#c04040',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', cursor: deleting.has(item.url) ? 'wait' : 'pointer',
                  opacity: 0, transition: 'opacity 0.15s',
                }}
                className="media-delete-btn"
                title="Delete"
              >×</button>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: s.dimmer, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.key?.split('/').pop() ?? ''}
                </div>
                <div style={{ fontSize: '10px', color: '#222222', marginTop: '3px' }}>
                  {(item.size / 1024).toFixed(0)} KB
                </div>
              </div>
            </div>
          ))}
        </div>
        {hidden > 0 && (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button
              onClick={() => setShowAll(true)}
              style={{
                background: 'transparent', border: `1px solid ${s.border}`,
                color: s.dim, fontFamily: s.font, fontSize: '10px',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                padding: '12px 28px', cursor: 'pointer',
              }}
            >
              Show {hidden} more
            </button>
          </div>
        )}
            </>
          )
        })()}
        </>
      )}

      </div>{/* end inner padding */}
      <style>{`
        div:hover > .media-delete-btn { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
