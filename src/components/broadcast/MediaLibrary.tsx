'use client'

import { useState, useEffect } from 'react'

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

  useEffect(() => {
    fetch('/api/media')
      .then(r => r.json())
      .then(d => setItems(d.blobs || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  function toggle(url: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '40px 48px' }}>
      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          Broadcast Lab — Media Library
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '28px', fontWeight: 200 }}>Media library</div>
            <div style={{ fontSize: '13px', color: s.dimmer, marginTop: '6px' }}>{items.length} items</div>
          </div>
          {selected.size > 0 && (
            <button onClick={() => window.location.href = '/broadcast'} style={{
              background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
              border: '1px solid #b08d57', color: '#b08d57',
              fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em',
              textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer',
            }}>
              Use {selected.size} in post →
            </button>
          )}
        </div>
      </div>

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
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: s.dimmer, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.pathname.split('/').pop()}
                </div>
                <div style={{ fontSize: '9px', color: '#2e2c29', marginTop: '3px' }}>
                  {(item.size / 1024).toFixed(0)} KB
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
