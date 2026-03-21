'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Blob {
  url: string
  pathname: string
  size: number
  uploadedAt: string
}

export function MediaLibrary() {
  const [blobs, setBlobs] = useState<Blob[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<{msg:string,tag:string}|null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const showToast = (msg: string, tag = 'Info') => {
    setToast({msg,tag})
    setTimeout(() => setToast(null), 3400)
  }

  useEffect(() => { fetchMedia() }, [])

  async function fetchMedia() {
    setLoading(true)
    try {
      const res = await fetch('/api/media')
      const data = await res.json()
      setBlobs(data.blobs || [])
    } catch { showToast('Failed to load media', 'Error') }
    finally { setLoading(false) }
  }

  async function uploadFiles(files: FileList) {
    setUploading(true)
    try {
      await Promise.all(Array.from(files).map(async file => {
        const form = new FormData()
        form.append('file', file)
        await fetch('/api/upload', { method: 'POST', body: form })
      }))
      showToast(`${files.length} file${files.length>1?'s':''} uploaded`, 'Done')
      fetchMedia()
    } catch { showToast('Upload failed', 'Error') }
    finally { setUploading(false) }
  }

  function toggleSelect(url: string) {
    setSelected(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url])
  }

  function useInPost() {
    if (!selected.length) { showToast('Select at least one image', 'Error'); return }
    const params = new URLSearchParams()
    selected.forEach(url => params.append('media', url))
    if (selected.length > 1) params.set('format', 'carousel')
    router.push('/broadcast?' + params.toString())
  }

  return (
    <div className="min-h-screen bg-[#070706] text-[#f0ebe2] font-mono p-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-[9px] tracking-[.3em] uppercase text-[#b08d57] flex items-center gap-3 mb-3">
            <span className="block w-7 h-px bg-[#b08d57]" />
            Broadcast Lab — Media Library
          </div>
          <div className="text-3xl tracking-[.04em] font-light">
            Media <span className="italic text-[#b08d57]" style={{fontFamily:'Georgia,serif'}}>library</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selected.length > 0 && (
            <div className="text-[9px] tracking-[.1em] uppercase text-[#8a8780]">
              {selected.length} selected{selected.length > 1 ? ' — carousel' : ''}
            </div>
          )}
          {selected.length > 0 && (
            <button onClick={useInPost}
              className="text-[9px] tracking-[.18em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2.5 hover:bg-[#c9a46e] transition-colors">
              Use in post{selected.length > 1 ? ' (carousel)' : ''} -&gt;
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files) }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="text-[9px] tracking-[.18em] uppercase border border-white/13 text-[#8a8780] px-5 py-2.5 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors disabled:opacity-40 flex items-center gap-2">
            {uploading && <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
            {uploading ? 'Uploading...' : 'Upload media'}
          </button>
          <button onClick={fetchMedia} className="text-[9px] tracking-[.18em] uppercase border border-white/13 text-[#8a8780] px-4 py-2.5 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_,i) => (
            <div key={i} className="aspect-square bg-[#0e0d0b] border border-white/7 animate-pulse" />
          ))}
        </div>
      ) : blobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="text-[#2e2c29] text-4xl">+</div>
          <div className="text-[9px] tracking-[.2em] uppercase text-[#2e2c29]">No media yet — upload your first file</div>
          <button onClick={() => fileInputRef.current?.click()}
            className="text-[9px] tracking-[.18em] uppercase border border-white/13 text-[#8a8780] px-5 py-2.5 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors mt-4">
            Upload media
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {blobs.map((blob, i) => {
            const isSelected = selected.includes(blob.url)
            const selIdx = selected.indexOf(blob.url)
            return (
              <div key={i} onClick={() => toggleSelect(blob.url)}
                className={`relative aspect-square cursor-pointer group overflow-hidden border-2 transition-all ${isSelected ? 'border-[#b08d57]' : 'border-transparent hover:border-white/20'}`}>
                <img src={blob.url} alt="" className="w-full h-full object-cover" />
                <div className={`absolute inset-0 transition-opacity ${isSelected ? 'bg-[#b08d57]/20' : 'bg-black/0 group-hover:bg-black/20'}`} />
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-[#b08d57] flex items-center justify-center text-[#070706] text-[10px] font-bold">
                    {selIdx + 1}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="text-[8px] tracking-[.08em] text-[#8a8780] truncate">
                    {new Date(blob.uploadedAt).toLocaleDateString('en-GB')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-7 right-7 bg-[#0e0d0b]/96 border border-white/13 px-5 py-3.5 text-[11px] tracking-[.07em] text-[#f0ebe2] z-50 max-w-xs leading-relaxed backdrop-blur-md">
          <div className="text-[8px] tracking-[.2em] uppercase text-[#b08d57] mb-1">{toast.tag}</div>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
