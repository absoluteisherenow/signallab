'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ScreenshotUpload } from '@/components/ui/ScreenshotUpload'

export default function NewRelease() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    type: 'single',
    release_date: '',
    label: '',
    streaming_url: '',
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

  async function save() {
    if (!form.title) { setError('Release title is required'); return }
    if (!form.release_date) { setError('Release date is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to save')
      router.push('/releases')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '48px 56px' }}>

      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          <Link href="/releases" style={{ color: s.gold, textDecoration: 'none' }}>Releases</Link>
          <span style={{ color: s.dimmer }}>—</span>
          New release
        </div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1 }}>Add new release</div>
      </div>

      <div style={{ maxWidth: '720px' }}>

        {/* SCREENSHOT UPLOAD */}
        <div style={{ marginBottom: '20px' }}>
          <ScreenshotUpload
            extractionPrompt="Extract music release details from this image. Return JSON with: title, type (single/ep/album), release_date (YYYY-MM-DD), label, streaming_url. Only include fields you can confidently extract."
            onExtracted={fields => {
              setForm(f => ({
                ...f,
                ...(fields.title && { title: fields.title }),
                ...(fields.type && { type: fields.type }),
                ...(fields.release_date && { release_date: fields.release_date }),
                ...(fields.label && { label: fields.label }),
                ...(fields.streaming_url && { streaming_url: fields.streaming_url }),
              }))
            }}
          />
        </div>

        {/* RELEASE DETAILS */}
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Release details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={labelStyle}>Title *</label>
              <input value={form.title} onChange={e => update('title', e.target.value)}
                placeholder="e.g. Losing Signal EP" style={inputStyle} autoFocus />
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
                {form.release_date && (
                  <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.2)', fontSize: '11px' }}>
                    <div style={{ fontSize: '9px', color: '#6a5030', letterSpacing: '0.15em', marginBottom: 8 }}>DISTRIBUTOR DEADLINES</div>
                    {[
                      { name: 'DistroKid', days: 1 },
                      { name: 'TuneCore / CD Baby', days: 7 },
                      { name: 'AWAL / Major', days: 21 },
                    ].map(d => {
                      const deadline = new Date(form.release_date)
                      deadline.setDate(deadline.getDate() - d.days)
                      const isPast = deadline < new Date()
                      return (
                        <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: isPast ? '#c06060' : '#8a7658' }}>
                          <span>{d.name}</span>
                          <span style={{ color: isPast ? '#c06060' : '#c9a46e' }}>
                            {isPast ? '⚠ ' : ''}{deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
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
            {saving ? 'Saving…' : 'Save release'}
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
