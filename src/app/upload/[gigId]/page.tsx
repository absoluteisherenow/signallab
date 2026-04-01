'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface GigInfo {
  id: string
  venue: string
  date: string
  slot_time?: string
  set_time?: string
  venue_address?: string
}

interface UploadFile {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  url?: string
  error?: string
}

export default function UploadPortal({ params }: { params: Promise<{ gigId: string }> }) {
  const [gigId, setGigId] = useState<string>('')
  const [gig, setGig] = useState<GigInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [files, setFiles] = useState<UploadFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [allDone, setAllDone] = useState(false)

  useEffect(() => {
    params.then(p => setGigId(p.gigId))
  }, [params])

  useEffect(() => {
    if (!gigId) return
    async function fetchGig() {
      const { data, error } = await supabase
        .from('gigs')
        .select('id, venue, date, slot_time, set_time, venue_address')
        .eq('id', gigId)
        .single()

      if (error || !data) {
        setNotFound(true)
      } else {
        setGig(data)
      }
      setLoading(false)
    }
    fetchGig()
  }, [gigId])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const additions: UploadFile[] = Array.from(newFiles).map(file => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      progress: 0,
      status: 'pending' as const,
    }))
    setFiles(prev => [...prev, ...additions])
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(e.target.files)
      e.target.value = ''
    }
  }, [addFiles])

  const uploadFile = async (uploadFile: UploadFile) => {
    setFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 10 } : f))

    try {
      const formData = new FormData()
      formData.append('file', uploadFile.file)

      const res = await fetch(`/api/upload?gigId=${gigId}`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }

      const data = await res.json()
      setFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...f, status: 'done' as const, progress: 100, url: data.url } : f))
    } catch (err: any) {
      setFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...f, status: 'error' as const, error: err.message } : f))
    }
  }

  const uploadAll = async () => {
    const pending = files.filter(f => f.status === 'pending')
    for (const f of pending) {
      await uploadFile(f)
    }
    setAllDone(true)
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const pendingCount = files.filter(f => f.status === 'pending').length
  const doneCount = files.filter(f => f.status === 'done').length
  const isUploading = files.some(f => f.status === 'uploading')

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loadingDot} />
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.label}>Signal Lab</div>
          <h1 style={styles.title}>Gig not found</h1>
          <p style={styles.subtitle}>This upload link may have expired or the gig has been removed.</p>
        </div>
      </div>
    )
  }

  const gigDate = gig ? new Date(gig.date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) : ''

  const timeStr = gig?.slot_time || gig?.set_time || ''

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.label}>Content Upload</div>
        <div style={styles.goldLine} />
        <h1 style={styles.title}>{gig?.venue}</h1>
        <p style={styles.subtitle}>
          {gigDate}{timeStr ? ` \u00b7 ${timeStr}` : ''}
          {gig?.venue_address ? <><br /><span style={{ color: 'var(--text-dimmer)', fontSize: 12 }}>{gig.venue_address}</span></> : null}
        </p>

        {/* Brief */}
        <div style={styles.briefBox}>
          <div style={styles.briefLabel}>Format requirements</div>
          <ul style={styles.briefList}>
            <li>Vertical 9:16 for stories / reels</li>
            <li>Landscape for feed posts</li>
            <li>Minimum 1080p resolution</li>
            <li>Capture: crowd shots, booth shots, venue atmosphere, artist performing</li>
          </ul>
        </div>

        {/* Upload area */}
        {allDone && doneCount > 0 && pendingCount === 0 ? (
          <div style={styles.successBox}>
            <div style={styles.successIcon}>&#10003;</div>
            <div style={styles.successTitle}>{doneCount} file{doneCount !== 1 ? 's' : ''} uploaded</div>
            <div style={styles.successSub}>Thank you. The content will be reviewed and added to the media library.</div>
            <button
              style={styles.btnSecondary}
              onClick={() => { setFiles([]); setAllDone(false) }}
            >
              Upload more
            </button>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            <div
              style={{
                ...styles.dropZone,
                borderColor: dragOver ? 'var(--gold)' : 'var(--border)',
                background: dragOver ? 'rgba(176,141,87,0.06)' : 'var(--bg)',
              }}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <div style={styles.dropIcon}>&#8593;</div>
              <div style={styles.dropText}>
                Drag files here or click to browse
              </div>
              <div style={styles.dropHint}>
                Photos, videos, any format
              </div>
              <input
                id="file-input"
                type="file"
                multiple
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div style={styles.fileList}>
                {files.map(f => (
                  <div key={f.id} style={styles.fileRow}>
                    <div style={styles.fileName}>
                      {f.file.name}
                      <span style={styles.fileSize}>
                        {(f.file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                    <div style={styles.fileStatus}>
                      {f.status === 'pending' && (
                        <button style={styles.removeBtn} onClick={() => removeFile(f.id)}>&times;</button>
                      )}
                      {f.status === 'uploading' && (
                        <span style={styles.statusUploading}>Uploading...</span>
                      )}
                      {f.status === 'done' && (
                        <span style={styles.statusDone}>&#10003;</span>
                      )}
                      {f.status === 'error' && (
                        <span style={styles.statusError}>{f.error || 'Failed'}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload button */}
            {pendingCount > 0 && (
              <button
                style={{
                  ...styles.btnPrimary,
                  opacity: isUploading ? 0.5 : 1,
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                }}
                disabled={isUploading}
                onClick={uploadAll}
              >
                {isUploading
                  ? 'Uploading...'
                  : `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          Signal Lab &middot; Night Manoeuvres
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    fontFamily: 'var(--font-mono)',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    background: 'var(--panel)',
    border: '1px solid var(--border-dim)',
    padding: '48px 40px',
  },
  label: {
    fontSize: 9,
    letterSpacing: '0.35em',
    textTransform: 'uppercase' as const,
    color: 'var(--gold)',
    marginBottom: 16,
  },
  goldLine: {
    width: 28,
    height: 1,
    background: 'var(--gold)',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(28px, 4vw, 40px)',
    fontWeight: 300,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
    color: 'var(--text)',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-dim)',
    marginBottom: 32,
    lineHeight: 1.5,
  },
  briefBox: {
    border: '1px solid var(--border-dim)',
    padding: '20px 24px',
    marginBottom: 32,
    background: 'var(--bg)',
  },
  briefLabel: {
    fontSize: 9,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-dimmer)',
    marginBottom: 12,
  },
  briefList: {
    fontSize: 12,
    color: 'var(--text-dim)',
    lineHeight: 1.8,
    paddingLeft: 16,
    margin: 0,
  },
  dropZone: {
    border: '1px dashed var(--border)',
    padding: '40px 24px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginBottom: 20,
  },
  dropIcon: {
    fontSize: 24,
    color: 'var(--gold)',
    marginBottom: 12,
  },
  dropText: {
    fontSize: 13,
    color: 'var(--text)',
    marginBottom: 6,
  },
  dropHint: {
    fontSize: 11,
    color: 'var(--text-dimmer)',
  },
  fileList: {
    marginBottom: 20,
  },
  fileRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--border-dim)',
    fontSize: 12,
  },
  fileName: {
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    marginRight: 12,
  },
  fileSize: {
    color: 'var(--text-dimmer)',
    marginLeft: 8,
    fontSize: 10,
  },
  fileStatus: {
    flexShrink: 0,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dimmer)',
    fontSize: 16,
    cursor: 'pointer',
    padding: '0 4px',
  },
  statusUploading: {
    color: 'var(--gold)',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
  },
  statusDone: {
    color: 'var(--green)',
    fontSize: 14,
  },
  statusError: {
    color: '#c06060',
    fontSize: 10,
  },
  btnPrimary: {
    width: '100%',
    height: 44,
    background: 'rgba(176,141,87,0.15)',
    color: 'var(--gold-bright)',
    border: '1px solid rgba(176,141,87,0.35)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    transition: 'all 0.15s',
    marginBottom: 24,
  },
  btnSecondary: {
    height: 36,
    padding: '0 20px',
    background: 'transparent',
    color: 'var(--text-dimmer)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    marginTop: 16,
  },
  successBox: {
    textAlign: 'center' as const,
    padding: '40px 0',
  },
  successIcon: {
    fontSize: 32,
    color: 'var(--green)',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 16,
    color: 'var(--text)',
    marginBottom: 8,
  },
  successSub: {
    fontSize: 12,
    color: 'var(--text-dim)',
    lineHeight: 1.6,
  },
  loadingDot: {
    width: 8,
    height: 8,
    background: 'var(--gold)',
    borderRadius: '50%',
    margin: '60px auto',
    animation: 'pulse 1.5s infinite',
  },
  footer: {
    fontSize: 9,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-dimmest)',
    textAlign: 'center' as const,
    marginTop: 32,
    paddingTop: 24,
    borderTop: '1px solid var(--border-dim)',
  },
}
