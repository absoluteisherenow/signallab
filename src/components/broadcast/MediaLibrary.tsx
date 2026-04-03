'use client'

import { useState, useEffect, useRef } from 'react'
import { SignalLabHeader } from './SignalLabHeader'

interface MediaItem {
  url: string
  pathname: string
  size: number
  uploadedAt: string
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

  async function uploadFiles(files: FileList) {
    setUploading(true)
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.url) {
          setItems(prev => [{ url: data.url, pathname: file.name, size: file.size, uploadedAt: new Date().toISOString() }, ...prev])
        }
      } catch { /* skip failed uploads */ }
    }
    setUploading(false)
  }

  async function deleteItem(url: string) {
    setDeleting(prev => new Set(prev).add(url))
    try {
      const res = await fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
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
            background: 'rgba(176,141,87,0.15)', border: '1px solid rgba(176,141,87,0.35)',
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {items.filter(item => !item.pathname.includes('error') && !item.pathname.includes('screenshot')).map(item => (
            <div key={item.url} onClick={() => toggle(item.url)} style={{
              background: s.panel,
              border: `1px solid ${selected.has(item.url) ? s.gold : s.border}`,
              cursor: 'pointer',
              transition: 'all 0.15s',
              position: 'relative',
            }}>
              <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#1a1917' }}>
                <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={e => { (e.target as HTMLImageElement).src = '' }} />
              </div>
              {selected.has(item.url) && (
                <div style={{ position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px', background: s.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#070706', fontWeight: 600 }}>✓</div>
              )}
              {/* Delete button */}
              <button
                onClick={e => { e.stopPropagation(); deleteItem(item.url) }}
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
                  {item.pathname.split('/').pop()}
                </div>
                <div style={{ fontSize: '10px', color: '#2e2c29', marginTop: '3px' }}>
                  {(item.size / 1024).toFixed(0)} KB
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      </div>{/* end inner padding */}
      <style>{`
        div:hover > .media-delete-btn { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
