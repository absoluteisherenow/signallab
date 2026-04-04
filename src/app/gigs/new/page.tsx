'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ScreenshotUpload } from '@/components/ui/ScreenshotUpload'

export default function NewGig() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    venue: '',
    location: '',
    date: '',
    time: '',
    fee: '',
    currency: 'EUR',
    audience: '',
    status: 'pending',
    promoter_email: '',
    notes: '',
    artwork_url: '',
    ra_url: '',
  })
  const [artworkTab, setArtworkTab] = useState<'ra' | 'upload'>('ra')
  const [uploadingArtwork, setUploadingArtwork] = useState(false)
  const [raInput, setRaInput] = useState('')
  const [fetchingArtwork, setFetchingArtwork] = useState(false)
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null)
  const [artworkError, setArtworkError] = useState('')

  // Debounced RA artwork fetch
  useEffect(() => {
    if (!raInput || !raInput.includes('ra.co')) { setArtworkPreview(null); setArtworkError(''); return }
    const t = setTimeout(async () => {
      setFetchingArtwork(true); setArtworkError('')
      try {
        const d = await fetch(`/api/ra/artwork?url=${encodeURIComponent(raInput)}`).then(r => r.json())
        if (d.artwork) { setArtworkPreview(d.artwork); setForm(f => ({ ...f, artwork_url: d.artwork, ra_url: raInput })) }
        else setArtworkError(d.error || 'No artwork found')
      } catch { setArtworkError('Could not fetch — check the URL') }
      finally { setFetchingArtwork(false) }
    }, 700)
    return () => clearTimeout(t)
  }, [raInput])

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

  async function handleArtworkUpload(file: File) {
    setUploadingArtwork(true); setArtworkError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const d = await fetch('/api/upload/artwork', { method: 'POST', body: fd }).then(r => r.json())
      if (d.url) { setArtworkPreview(d.url); setForm(f => ({ ...f, artwork_url: d.url })) }
      else setArtworkError(d.error || 'Upload failed')
    } catch { setArtworkError('Upload failed') }
    finally { setUploadingArtwork(false) }
  }

  function currencyFromLocation(location: string): string {
    const loc = location.toLowerCase()
    if (/australia|melbourne|sydney|brisbane|perth|adelaide|hobart/.test(loc)) return 'AUD'
    if (/\buk\b|united kingdom|england|scotland|wales|london|manchester|glasgow|bristol|edinburgh|leeds|birmingham|liverpool|nottingham|brighton|belfast|cardiff|sheffield|newcastle/.test(loc)) return 'GBP'
    if (/\busa\b|\bus\b|united states|new york|los angeles|chicago|miami|san francisco|las vegas|detroit|brooklyn|boston|seattle|portland|denver|atlanta|austin|nashville|philadelphia|washington dc/.test(loc)) return 'USD'
    if (/switzerland|zurich|zürich|geneva|genève|basel|bern/.test(loc)) return 'CHF'
    if (/japan|tokyo|osaka|kyoto/.test(loc)) return 'JPY'
    if (/canada|toronto|montreal|vancouver/.test(loc)) return 'CAD'
    return 'EUR'
  }

  function update(key: string, value: string) {
    if (key === 'location') {
      const detectedCurrency = currencyFromLocation(value)
      setForm(f => ({ ...f, location: value, currency: detectedCurrency }))
    } else {
      setForm(f => ({ ...f, [key]: value }))
    }
  }

  async function save() {
    if (!form.title) { setError('Show title is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to save')
      router.push('/gigs')
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '48px 56px' }}>

      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          Tour Lab — New gig
        </div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '36px', fontWeight: 300, letterSpacing: '0.03em' }}>Add new gig</div>
      </div>

      <div style={{ maxWidth: '720px' }}>

        {/* SCREENSHOT UPLOAD */}
        <div style={{ marginBottom: '20px' }}>
          <ScreenshotUpload
            extractionPrompt="Extract gig booking details from this image. Return JSON with: title, venue, location, date (YYYY-MM-DD), time (HH:MM), fee (number), currency (3-letter code), promoter_email, promoter_name. Only include fields you can confidently extract."
            onExtracted={fields => {
              setForm(f => ({
                ...f,
                ...(fields.title && { title: fields.title }),
                ...(fields.venue && { venue: fields.venue }),
                ...(fields.location && { location: fields.location }),
                ...(fields.date && { date: fields.date }),
                ...(fields.time && { time: fields.time }),
                ...(fields.fee && { fee: String(fields.fee) }),
                ...(fields.currency && { currency: fields.currency }),
                ...(fields.promoter_email && { promoter_email: fields.promoter_email }),
                // promoter_name has no dedicated field so append to notes
                ...(fields.promoter_name && !f.notes && { notes: `Promoter: ${fields.promoter_name}` }),
              }))
            }}
          />
        </div>

        {/* SHOW DETAILS */}
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Show details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={labelStyle}>Show title *</label>
              <input value={form.title} onChange={e => update('title', e.target.value)}
                placeholder="Electric Nights Festival" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Venue</label>
                <input value={form.venue} onChange={e => update('venue', e.target.value)}
                  placeholder="Tresor Club" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input value={form.location} onChange={e => update('location', e.target.value)}
                  placeholder="Berlin, Germany" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={form.date} onChange={e => update('date', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Set time</label>
                <input value={form.time} onChange={e => update('time', e.target.value)}
                  placeholder="23:00" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={form.status} onChange={e => update('status', e.target.value)} style={inputStyle}>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* FINANCIAL */}
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Financial</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Fee</label>
              <input value={form.fee} onChange={e => update('fee', e.target.value)}
                placeholder="5000" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Currency</label>
              <select value={form.currency} onChange={e => update('currency', e.target.value)} style={inputStyle}>
                <option value="EUR">EUR €</option>
                <option value="GBP">GBP £</option>
                <option value="USD">USD $</option>
                <option value="CHF">CHF</option>
                <option value="AUD">AUD $</option>
                <option value="CAD">CAD $</option>
                <option value="JPY">JPY ¥</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Expected audience</label>
              <input value={form.audience} onChange={e => update('audience', e.target.value)}
                placeholder="2500" style={inputStyle} />
            </div>
          </div>
        </div>

        {/* PROMOTER */}
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', marginBottom: '32px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Promoter</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={labelStyle}>Promoter email</label>
              <input type="email" value={form.promoter_email} onChange={e => update('promoter_email', e.target.value)}
                placeholder="bookings@venue.com" style={inputStyle} />
              <div style={{ fontSize: '10px', color: '#2e2c29', marginTop: '6px' }}>Used to send advance request automatically</div>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => update('notes', e.target.value)}
                placeholder="Any additional notes about the show..."
                rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
        </div>

        {/* ARTWORK */}
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px' }}>Artwork</div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: `1px solid ${s.border}` }}>
            {(['ra', 'upload'] as const).map(t => (
              <button key={t} onClick={() => { setArtworkTab(t); setArtworkPreview(null); setArtworkError(''); setRaInput(''); setForm(f => ({ ...f, artwork_url: '', ra_url: '' })) }} style={{
                padding: '8px 18px', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase',
                background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: s.font,
                color: artworkTab === t ? s.gold : s.dimmer,
                borderBottom: artworkTab === t ? `1px solid ${s.gold}` : '1px solid transparent',
                marginBottom: '-1px',
              }}>
                {t === 'ra' ? 'From RA' : 'Upload'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              {artworkTab === 'ra' ? (
                <div>
                  <label style={labelStyle}>
                    Resident Advisor event URL
                    {fetchingArtwork && <span style={{ marginLeft: '8px', color: s.dimmer, fontStyle: 'italic', textTransform: 'none' }}>fetching…</span>}
                  </label>
                  <input value={raInput} onChange={e => { setRaInput(e.target.value); setArtworkPreview(null); setForm(f => ({ ...f, artwork_url: '', ra_url: '' })) }}
                    placeholder="https://ra.co/events/2147483"
                    style={{ ...inputStyle, borderColor: artworkPreview ? `${s.gold}60` : undefined }} />
                  {artworkError && <div style={{ fontSize: '10px', color: '#8a4a3a', marginTop: '6px' }}>{artworkError}</div>}
                  {artworkPreview && <div style={{ fontSize: '10px', color: '#3d6b4a', marginTop: '6px' }}>✓ Artwork found</div>}
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>
                    Upload artwork
                    {uploadingArtwork && <span style={{ marginLeft: '8px', color: s.dimmer, fontStyle: 'italic', textTransform: 'none' }}>uploading…</span>}
                  </label>
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', height: '80px', border: `1px dashed ${artworkPreview ? s.gold + '60' : s.border}`,
                    cursor: 'pointer', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: s.dimmer, background: 'transparent', boxSizing: 'border-box' as const,
                  }}>
                    {uploadingArtwork ? 'Uploading…' : artworkPreview ? '✓ Uploaded — click to replace' : '+ Choose file'}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleArtworkUpload(f) }} />
                  </label>
                  {artworkError && <div style={{ fontSize: '10px', color: '#8a4a3a', marginTop: '6px' }}>{artworkError}</div>}
                </div>
              )}
            </div>

            {/* Preview */}
            {artworkPreview ? (
              <div style={{ flexShrink: 0, position: 'relative' }}>
                <img src={artworkPreview} alt="Event artwork" style={{ width: '120px', height: '120px', objectFit: 'cover', display: 'block', border: `1px solid ${s.border}` }} />
                <button onClick={() => { setArtworkPreview(null); setRaInput(''); setForm(f => ({ ...f, artwork_url: '', ra_url: '' })) }}
                  style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(7,7,6,0.8)', border: 'none', color: s.dimmer, cursor: 'pointer', fontSize: '12px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ) : (
              <div style={{ width: '120px', height: '120px', border: `1px dashed ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '9px', color: s.dimmer, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.6 }}>No<br/>artwork</div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: '#8a4a3a', padding: '14px 18px', border: '1px solid #4a2a1a', background: '#1a0a06', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={save} disabled={saving} style={{
            background: saving ? s.panel : s.gold,
            color: saving ? s.dimmer : '#070706',
            border: `1px solid ${saving ? s.border : s.gold}`,
            fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
            textTransform: 'uppercase', padding: '16px 36px', cursor: saving ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            {saving && <div style={{ width: '10px', height: '10px', border: `1px solid ${s.dimmer}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
            {saving ? 'Saving...' : 'Save gig →'}
          </button>
          <button onClick={() => router.push('/gigs')} style={{
            background: 'transparent', color: s.dimmer,
            border: `1px solid ${s.border}`, fontFamily: s.font,
            fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase',
            padding: '16px 28px', cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
