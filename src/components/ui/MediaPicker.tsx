'use client'

import { useState, useEffect, useRef } from 'react'

interface MediaItem {
  url: string
  pathname: string
  size: number
  uploadedAt: string
  category: string
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'promo', label: 'Promo shots' },
  { key: 'crowd', label: 'Crowd clips' },
  { key: 'studio', label: 'Studio' },
  { key: 'artwork', label: 'Artwork' },
  { key: 'bts', label: 'Behind the scenes' },
  { key: 'travel', label: 'Travel' },
  { key: 'other', label: 'Other' },
] as const

interface MediaPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (urls: string[]) => void
  multiple?: boolean
}

export function MediaPicker({ open, onClose, onSelect, multiple = true }: MediaPickerProps) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSelected([])
      loadMedia()
    }
  }, [open, category])

  async function loadMedia() {
    setLoading(true)
    try {
      const params = category !== 'all' ? `?category=${category}` : ''
      const res = await fetch(`/api/media${params}`)
      const data = await res.json()
      setItems((data.blobs || []).sort((a: MediaItem, b: MediaItem) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      ))
    } catch { /* silent */ }
    setLoading(false)
  }

  async function upload(files: FileList) {
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        await fetch('/api/media', { method: 'POST', body: form })
      }
      await loadMedia()
    } catch { /* silent */ }
    setUploading(false)
  }

  function toggleSelect(url: string) {
    if (multiple) {
      setSelected(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url])
    } else {
      setSelected([url])
    }
  }

  function confirm() {
    onSelect(selected)
    onClose()
  }

  if (!open) return null

  const isVideo = (path: string) => /\.(mp4|mov|webm)$/i.test(path)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[#0e0d0b] border border-white/10 w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/7">
          <div className="text-[10px] tracking-[.22em] uppercase text-[#b08d57]">Media library</div>
          <button onClick={onClose} className="text-[#8a8780] hover:text-[#f0ebe2] text-lg leading-none">×</button>
        </div>

        {/* Categories */}
        <div className="flex gap-1.5 px-5 py-3 border-b border-white/7 overflow-x-auto">
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={`text-[9px] tracking-[.14em] uppercase px-3 py-1.5 border whitespace-nowrap transition-colors ${category === c.key ? 'border-[#b08d57] text-[#b08d57]' : 'border-white/10 text-[#52504c] hover:border-white/20'}`}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-square bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-[11px] text-[#8a8780] mb-2">No media{category !== 'all' ? ` in ${CATEGORIES.find(c => c.key === category)?.label}` : ''}</div>
              <div className="text-[10px] text-[#2e2c29]">Upload files to get started</div>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {items.map(item => (
                <button key={item.url} onClick={() => toggleSelect(item.url)}
                  className={`aspect-square relative overflow-hidden border-2 transition-colors group ${selected.includes(item.url) ? 'border-[#b08d57]' : 'border-transparent hover:border-white/20'}`}>
                  {isVideo(item.pathname) ? (
                    <div className="w-full h-full bg-[#1a1917] flex items-center justify-center">
                      <span className="text-[#8a8780] text-xs">▶</span>
                    </div>
                  ) : (
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  )}
                  {selected.includes(item.url) && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-[#b08d57] rounded-full flex items-center justify-center text-[#070706] text-[9px] font-bold">
                      ✓
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="text-[8px] text-[#8a8780] truncate">{item.category}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer — upload + confirm */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/7">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden"
              onChange={e => { if (e.target.files?.length) upload(e.target.files) }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-[9px] tracking-[.14em] uppercase border border-white/10 text-[#8a8780] px-3 py-1.5 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors disabled:opacity-40">
              {uploading ? 'Auto-sorting...' : 'Upload new'}
            </button>
            {uploading && <span className="text-[8px] text-[#52504c]">Categorising with vision</span>}
          </div>
          <div className="flex items-center gap-3">
            {selected.length > 0 && (
              <span className="text-[10px] text-[#52504c]">{selected.length} selected</span>
            )}
            <button onClick={confirm} disabled={selected.length === 0}
              className="text-[10px] tracking-[.16em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2 hover:bg-[#c9a46e] transition-colors disabled:opacity-30">
              Attach{selected.length > 0 ? ` (${selected.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
