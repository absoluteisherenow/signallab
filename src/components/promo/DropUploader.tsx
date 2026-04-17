'use client'

import { useRef, useState } from 'react'
import { extractPeaksFromFile } from '@/components/setlab/WaveformDisplay'

type Contact = { id: string; name: string; instagram_handle?: string | null; email?: string | null }
type StagedTrack = {
  file: File
  title: string
  artist: string
  label: string
  duration_sec: number
  peaks: number[]
  status: 'ready' | 'uploading' | 'done' | 'error'
  error?: string
}
type DropLink = { contact_id: string; code: string; url: string }

function parseFilename(name: string): { artist: string; title: string } {
  const stripped = name.replace(/\.(mp3|wav|flac|aac|m4a|ogg|aiff?)$/i, '').trim()
  const cleaned = stripped.replace(/^\d{1,3}[\s.\-_]+/, '').trim()
  for (const delim of [' — ', ' - ', ' – ', ' _ ']) {
    if (cleaned.includes(delim)) {
      const parts = cleaned.split(delim)
      return { artist: parts[0].trim(), title: parts.slice(1).join(delim).trim() }
    }
  }
  return { artist: '', title: cleaned }
}

async function readDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const a = document.createElement('audio')
    a.preload = 'metadata'
    a.src = URL.createObjectURL(file)
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(a.src)
      resolve(Math.round(a.duration || 0))
    }
    a.onerror = () => resolve(0)
  })
}

export default function DropUploader({ contacts }: { contacts: Contact[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tracks, setTracks] = useState<StagedTrack[]>([])
  const [dropTitle, setDropTitle] = useState('')
  const [dropArtist, setDropArtist] = useState('Night Manoeuvres')
  const [dropLabel, setDropLabel] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ blast_id: string; links: DropLink[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = e.dataTransfer?.files
    if (files?.length) {
      const audio = Array.from(files).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|aiff?|flac|aac|m4a|ogg)$/i.test(f.name))
      if (audio.length === 0) {
        setError('No audio files detected in drop')
        return
      }
      const dt = new DataTransfer()
      audio.forEach(f => dt.items.add(f))
      handleFiles(dt.files)
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setProcessing(true)
    setError('')
    const staged: StagedTrack[] = []
    for (const file of Array.from(files)) {
      try {
        const meta = parseFilename(file.name)
        const [duration_sec, peaks] = await Promise.all([
          readDuration(file),
          extractPeaksFromFile(file, 200),
        ])
        staged.push({
          file,
          title: meta.title || file.name,
          artist: meta.artist || '',
          label: '',
          duration_sec,
          peaks,
          status: 'ready',
        })
      } catch (err: any) {
        staged.push({
          file,
          title: file.name,
          artist: '',
          label: '',
          duration_sec: 0,
          peaks: [],
          status: 'error',
          error: err?.message || 'Failed to analyse',
        })
      }
    }
    setTracks(prev => [...prev, ...staged])
    setProcessing(false)
    if (!dropTitle && staged[0]?.title) setDropTitle(staged[0].title)
  }

  function toggleContact(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size === contacts.length) setSelected(new Set())
    else setSelected(new Set(contacts.map(c => c.id)))
  }

  async function submit() {
    if (!dropTitle || tracks.length === 0 || selected.size === 0) {
      setError('Need a title, at least 1 track, and at least 1 contact')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      const dropRes = await fetch('/api/promo/create-drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: dropTitle,
          artist: dropArtist,
          label: dropLabel,
          message,
          contact_ids: Array.from(selected),
        }),
      })
      const dropData = await dropRes.json()
      if (!dropRes.ok) throw new Error(dropData.error || 'Failed to create drop')

      const blast_id = dropData.blast_id as string

      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i]
        setTracks(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'uploading' } : x))

        const form = new FormData()
        form.append('file', t.file)
        form.append('blast_id', blast_id)
        form.append('title', t.title)
        form.append('artist', t.artist)
        form.append('label', t.label)
        form.append('position', String(i))
        form.append('duration_sec', String(t.duration_sec))
        form.append('waveform_peaks', JSON.stringify(t.peaks))

        const r = await fetch('/api/promo/upload', { method: 'POST', body: form })
        const j = await r.json()
        if (!r.ok) {
          setTracks(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'error', error: j.error } : x))
          throw new Error(j.error || `Upload failed for ${t.title}`)
        }
        setTracks(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'done' } : x))
      }

      setResult({ blast_id, links: dropData.links })
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={h2}>Drop ready</h2>
        <p style={p}>
          {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'} uploaded. {result.links.length} private links generated.
        </p>
        <div style={linkList}>
          {result.links.map(l => {
            const contact = contacts.find(c => c.id === l.contact_id)
            return (
              <div key={l.code} style={linkRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={linkName}>{contact?.name || 'Unknown'}</div>
                  <div style={linkUrl}>{l.url}</div>
                </div>
                <button
                  style={btnCopy}
                  onClick={() => navigator.clipboard.writeText(l.url)}
                >
                  COPY
                </button>
              </div>
            )
          })}
        </div>
        <a href={`/signal-drop/${result.blast_id}`} style={btnPrimary}>VIEW ANALYTICS →</a>
      </div>
    )
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ display: 'flex', flexDirection: 'column', gap: 28, outline: dragOver ? '2px dashed #ff2a1a' : 'none', outlineOffset: 4 }}
    >
      {/* Drop metadata */}
      <section style={section}>
        <label style={labelS}>DROP TITLE</label>
        <input
          type="text"
          value={dropTitle}
          onChange={e => setDropTitle(e.target.value)}
          placeholder="Untitled drop"
          style={input}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelS}>ARTIST</label>
            <input type="text" value={dropArtist} onChange={e => setDropArtist(e.target.value)} style={input} />
          </div>
          <div>
            <label style={labelS}>LABEL</label>
            <input type="text" value={dropLabel} onChange={e => setDropLabel(e.target.value)} style={input} />
          </div>
        </div>
        <label style={labelS}>MESSAGE (shown on landing page)</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="A few lines for the recipient…"
          rows={3}
          style={{ ...input, resize: 'vertical', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
        />
      </section>

      {/* Track upload */}
      <section style={section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={labelS}>TRACKS</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing || submitting}
            style={btnSmall}
          >
            {processing ? 'ANALYSING…' : '+ ADD FILES'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={e => handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />

        {tracks.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            style={{ ...dropzone, borderColor: dragOver ? '#ff2a1a' : '#2a2a2a', background: dragOver ? '#140504' : '#0a0a0a' }}
          >
            <div style={{ fontSize: 11, letterSpacing: '0.1em', color: dragOver ? '#ff2a1a' : '#7a7a7a' }}>
              {dragOver ? 'DROP TO ADD' : 'DRAG AUDIO FILES OR CLICK TO BROWSE'}
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 6 }}>mp3, wav, aiff, flac · max 100MB</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tracks.map((t, i) => (
              <div key={i} style={trackRow}>
                <div style={{ fontSize: 10, color: '#7a7a7a', width: 24 }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    value={t.title}
                    onChange={e => setTracks(prev => prev.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                    style={{ ...inputMini, fontWeight: 600 }}
                  />
                  <input
                    type="text"
                    value={t.artist}
                    placeholder="artist"
                    onChange={e => setTracks(prev => prev.map((x, idx) => idx === i ? { ...x, artist: e.target.value } : x))}
                    style={inputMini}
                  />
                </div>
                <div style={{ fontSize: 10, color: '#7a7a7a', width: 46, textAlign: 'right' }}>
                  {Math.floor(t.duration_sec / 60)}:{String(t.duration_sec % 60).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 10, width: 60, textAlign: 'right', color: statusColor(t.status) }}>
                  {t.status.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Contacts */}
      <section style={section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={labelS}>RECIPIENTS · {selected.size}/{contacts.length}</label>
          <button type="button" onClick={selectAll} style={btnSmall}>
            {selected.size === contacts.length ? 'CLEAR' : 'SELECT ALL'}
          </button>
        </div>
        {contacts.length === 0 ? (
          <div style={{ ...dropzone, cursor: 'default' }}>
            <div style={{ fontSize: 11, color: '#7a7a7a' }}>NO CONTACTS YET</div>
            <a href="/signal/promo" style={{ color: '#ff2a1a', fontSize: 10, marginTop: 6, textDecoration: 'none', letterSpacing: '0.1em' }}>
              + ADD CONTACTS →
            </a>
          </div>
        ) : (
          <div style={contactGrid}>
            {contacts.map(c => {
              const on = selected.has(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleContact(c.id)}
                  style={{ ...contactChip, ...(on ? contactChipOn : {}) }}
                >
                  <span>{c.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {error && <div style={errorBox}>{error}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || tracks.length === 0 || !dropTitle || selected.size === 0}
        style={{
          ...btnPrimary,
          opacity: (submitting || tracks.length === 0 || !dropTitle || selected.size === 0) ? 0.4 : 1,
          cursor: submitting ? 'wait' : 'pointer',
        }}
      >
        {submitting ? 'UPLOADING…' : `CREATE DROP → ${tracks.length} TRACK${tracks.length === 1 ? '' : 'S'} · ${selected.size} RECIPIENT${selected.size === 1 ? '' : 'S'}`}
      </button>
    </div>
  )
}

function statusColor(s: StagedTrack['status']): string {
  switch (s) {
    case 'done': return '#ff2a1a'
    case 'error': return '#ff5040'
    case 'uploading': return '#ff2a1a'
    default: return '#7a7a7a'
  }
}

const section: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '20px 22px',
  background: '#0e0e0e',
  border: '1px solid #1d1d1d',
}

const h2: React.CSSProperties = {
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontSize: 20,
  fontWeight: 300,
  color: '#f2f2f2',
  margin: 0,
}

const p: React.CSSProperties = {
  fontSize: 12,
  color: '#a0a0a0',
  margin: 0,
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const labelS: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.12em',
  color: '#7a7a7a',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  textTransform: 'uppercase' as const,
}

const input: React.CSSProperties = {
  background: '#0a0a0a',
  border: '1px solid #1d1d1d',
  color: '#f2f2f2',
  padding: '10px 12px',
  fontSize: 13,
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const inputMini: React.CSSProperties = {
  ...input,
  padding: '4px 6px',
  fontSize: 12,
  border: '1px solid transparent',
  background: 'transparent',
}

const dropzone: React.CSSProperties = {
  padding: '40px 20px',
  border: '1px dashed #2a2a2a',
  background: '#0a0a0a',
  textAlign: 'center',
  cursor: 'pointer',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const trackRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 10px',
  background: '#0a0a0a',
  border: '1px solid #1d1d1d',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const contactGrid: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const contactChip: React.CSSProperties = {
  padding: '6px 10px',
  background: '#0a0a0a',
  border: '1px solid #1d1d1d',
  color: '#a0a0a0',
  fontSize: 11,
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  cursor: 'pointer',
  letterSpacing: '0.02em',
}

const contactChipOn: React.CSSProperties = {
  background: '#ff2a1a',
  borderColor: '#ff2a1a',
  color: '#000',
}

const btnPrimary: React.CSSProperties = {
  padding: '14px 20px',
  background: '#ff2a1a',
  border: 'none',
  color: '#000',
  fontSize: 12,
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  letterSpacing: '0.1em',
  fontWeight: 700,
  cursor: 'pointer',
  textAlign: 'center',
  textDecoration: 'none',
  display: 'block',
}

const btnSmall: React.CSSProperties = {
  padding: '6px 10px',
  background: 'transparent',
  border: '1px solid #1d1d1d',
  color: '#a0a0a0',
  fontSize: 10,
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  letterSpacing: '0.1em',
  cursor: 'pointer',
}

const btnCopy: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: '1px solid #ff2a1a',
  color: '#ff2a1a',
  fontSize: 10,
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  letterSpacing: '0.1em',
  cursor: 'pointer',
}

const errorBox: React.CSSProperties = {
  padding: '10px 14px',
  background: '#2a0a08',
  border: '1px solid #5a1510',
  color: '#ff5040',
  fontSize: 12,
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const linkList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxHeight: 320,
  overflowY: 'auto',
}

const linkRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  background: '#0a0a0a',
  border: '1px solid #1d1d1d',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const linkName: React.CSSProperties = {
  fontSize: 12,
  color: '#f2f2f2',
}

const linkUrl: React.CSSProperties = {
  fontSize: 10,
  color: '#7a7a7a',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
