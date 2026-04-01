'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function EditRelease() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [artworkUrl, setArtworkUrl] = useState('')
  const [uploadingArt, setUploadingArt] = useState(false)
  const [form, setForm] = useState({
    title: '',
    artist: '',
    type: 'single',
    release_date: '',
    label: '',
    streaming_url: '',
    artwork_url: '',
    notes: '',
  })

  const s = {
    bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)',
    gold: 'var(--gold)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
    font: 'var(--font-mono)',
  }

  const inputStyle = {
    width: '100%', background: s.bg, border: `1px solid ${s.border}`,
    color: s.text, fontFamily: s.font, fontSize: '14px',
    padding: '12px 16px', outline: 'none', boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer,
    textTransform: 'uppercase' as const, marginBottom: '8px', display: 'block',
  }

  function update(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  useEffect(() => {
    fetch('/api/releases')
      .then(r => r.json())
      .then(d => {
        const release = (d.releases || []).find((r: { id: string }) => r.id === id)
        if (release) {
          setForm({
            title: release.title || '',
            artist: release.artist || '',
            type: release.type || 'single',
            release_date: release.release_date || '',
            label: release.label || '',
            streaming_url: release.streaming_url || '',
            artwork_url: release.artwork_url || '',
            notes: release.notes || '',
          })
          if (release.artwork_url) setArtworkUrl(release.artwork_url)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  async function save() {
    if (!form.title) { setError('Release title is required'); return }
    if (!form.release_date) { setError('Release date is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/releases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...form }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to save')
      router.push('/releases')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ background: s.bg, color: s.dimmer, fontFamily: s.font, minHeight: '100vh', padding: '48px 56px', fontSize: '12px' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '48px 56px' }}>

      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          <Link href="/releases" style={{ color: s.gold, textDecoration: 'none' }}>Releases</Link>
          <span style={{ color: s.dimmer }}>—</span>
          Edit
        </div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1 }}>Edit release</div>
      </div>

      <div style={{ maxWidth: '720px' }}>

        {/* RELEASE DETAILS */}
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Release details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={labelStyle}>Title *</label>
              <input value={form.title} onChange={e => update('title', e.target.value)}
                placeholder="e.g. Losing Signal EP" style={inputStyle} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Artist</label>
              <input value={form.artist} onChange={e => update('artist', e.target.value)}
                placeholder="e.g. Night Manoeuvres, or collab artist" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select value={form.type} onChange={e => update('type', e.target.value)} style={inputStyle}>
                  <option value="single">Single</option>
                  <option value="ep">EP</option>
                  <option value="album">Album</option>
                  <option value="remix">Remix</option>
                  <option value="compilation">Compilation</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Release date *</label>
                <input type="date" value={form.release_date} onChange={e => update('release_date', e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Label</label>
              <input value={form.label} onChange={e => update('label', e.target.value)}
                placeholder="e.g. Ostgut Ton, Mote Evolver, Self-released" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Streaming link</label>
              <input value={form.streaming_url} onChange={e => update('streaming_url', e.target.value)}
                placeholder="Beatport / Spotify / Bandcamp URL" style={inputStyle} />
            </div>
          </div>
        </div>

        {/* ARTWORK */}
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Artwork</div>
          {artworkUrl ? (
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <img src={artworkUrl} alt="Artwork" style={{ width: '120px', height: '120px', objectFit: 'cover', border: `1px solid ${s.border}` }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', color: s.dim }}>Artwork uploaded</div>
                <button onClick={() => { setArtworkUrl(''); update('artwork_url', '') }}
                  style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, fontFamily: s.font, fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer' }}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '120px', border: `1px dashed ${s.border}`, cursor: uploadingArt ? 'wait' : 'pointer',
              fontSize: '11px', color: s.dimmer, opacity: uploadingArt ? 0.5 : 1,
            }}>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setUploadingArt(true)
                try {
                  const formData = new FormData()
                  formData.append('file', file)
                  formData.append('folder', 'releases')
                  const res = await fetch('/api/media', { method: 'POST', body: formData })
                  const data = await res.json()
                  if (data.url) {
                    setArtworkUrl(data.url)
                    update('artwork_url', data.url)
                  }
                } catch { setError('Failed to upload artwork') }
                finally { setUploadingArt(false) }
              }} />
              {uploadingArt ? 'Uploading...' : 'Click to upload artwork'}
            </label>
          )}
        </div>

        {/* NOTES */}
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', marginBottom: '32px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Notes</div>
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)}
            placeholder="Press notes, promo plan, distribution details..."
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' as const }} />
        </div>

        {error && (
          <div style={{ color: '#c0392b', fontSize: '12px', marginBottom: '20px', padding: '12px 16px', border: '1px solid #c0392b' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={save} disabled={saving}
            style={{ background: s.gold, color: '#070706', border: 'none', padding: '0 32px', height: '44px', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <Link href="/releases"
            style={{ border: `1px solid ${s.border}`, color: s.dim, textDecoration: 'none', padding: '0 24px', height: '44px', display: 'flex', alignItems: 'center', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}
