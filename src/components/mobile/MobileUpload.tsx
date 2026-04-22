'use client'

import { useState, useRef } from 'react'

const s = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
  gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
  font: 'var(--font-mono)',
}

interface UploadedItem {
  url: string
  type: string
  name: string
}

export default function MobileUpload() {
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState<UploadedItem[]>([])
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList) {
    setUploading(true)
    setError('')
    const newItems: UploadedItem[] = []
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('folder', 'media')
        const res = await fetch('/api/media', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.url) {
          newItems.push({ url: data.url, type: file.type.startsWith('video') ? 'video' : 'image', name: file.name })
        }
      } catch {
        setError(`Failed to upload ${file.name}`)
      }
    }
    setUploaded(prev => [...newItems, ...prev])
    setUploading(false)
  }

  return (
    <div style={{ background: s.bg, minHeight: '100vh', fontFamily: s.font, color: s.text, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

      <div style={{ padding: '20px 16px 16px' }}>
        <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '26px', fontWeight: 300, marginBottom: '6px' }}>
          Content
        </div>
        <div style={{ fontSize: '12px', color: s.dimmer }}>
          Capture photos and video — schedule posts on desktop
        </div>
      </div>

      <div style={{ padding: '0 16px', marginBottom: '20px' }}>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.length) handleFiles(e.target.files) }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={() => {
              const inp = document.createElement('input')
              inp.type = 'file'; inp.accept = 'image/*,video/*'; inp.capture = 'environment'
              inp.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files
                if (files?.length) handleFiles(files)
              }
              inp.click()
            }}
            disabled={uploading}
            style={{
              background: s.panel, border: `1px solid ${s.border}`,
              padding: '22px 20px', textAlign: 'left', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '16px',
            }}
          >
            <div style={{ fontSize: '24px', color: s.gold, opacity: 0.6, flexShrink: 0 }}>◉</div>
            <div>
              <div style={{ fontSize: '15px', color: s.text, marginBottom: '4px' }}>Camera</div>
              <div style={{ fontSize: '12px', color: s.dimmer }}>Photo or video at the gig</div>
            </div>
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              background: s.panel, border: `1px solid ${s.border}`,
              padding: '22px 20px', textAlign: 'left', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '16px',
            }}
          >
            <div style={{ fontSize: '24px', color: s.gold, opacity: 0.6, flexShrink: 0 }}>↑</div>
            <div>
              <div style={{ fontSize: '15px', color: s.text, marginBottom: '4px' }}>Gallery</div>
              <div style={{ fontSize: '12px', color: s.dimmer }}>Upload from camera roll</div>
            </div>
          </button>
        </div>

        {uploading && (
          <div style={{ marginTop: '14px', padding: '14px', background: s.panel, border: `1px solid ${s.gold}30`, fontSize: '12px', color: s.gold, letterSpacing: '0.1em', textAlign: 'center' }}>
            Uploading...
          </div>
        )}

        {error && (
          <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(192,64,64,0.1)', border: '1px solid rgba(192,64,64,0.3)', fontSize: '12px', color: '#c04040' }}>
            {error}
          </div>
        )}
      </div>

      {uploaded.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '12px' }}>
            Uploaded · {uploaded.length} item{uploaded.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {uploaded.map((item, i) => (
              <div key={i} style={{ position: 'relative', paddingTop: '100%', background: s.panel, border: `1px solid ${s.border}` }}>
                {item.type === 'image' ? (
                  <img src={item.url} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '10px', color: s.dimmer, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Video</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '14px', fontSize: '12px', color: s.dimmer, textAlign: 'center' }}>
            Available in your media library on desktop
          </div>
        </div>
      )}

      {uploaded.length === 0 && !uploading && (
        <div style={{ padding: '32px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: s.dimmer, lineHeight: 1.6 }}>
            Capture content at the gig — schedule posts later on desktop
          </div>
        </div>
      )}
    </div>
  )
}
