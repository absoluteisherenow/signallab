'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ScreenshotUpload } from '@/components/ui/ScreenshotUpload'
import { ScanPulse } from '@/components/ui/ScanPulse'

export default function NewRelease() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [linkInput, setLinkInput] = useState('')
  const [fetchingLink, setFetchingLink] = useState(false)
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

  async function fetchFromLink() {
    const url = linkInput.trim()
    if (!url) return
    setFetchingLink(true)
    setError('')
    try {
      // Step 1: Fetch oEmbed data for real metadata
      let oembedRaw: Record<string, unknown> = {}
      try {
        const isSoundCloud = url.includes('soundcloud.com')
        const isSpotify = url.includes('spotify.com') || url.includes('open.spotify.com')
        if (isSoundCloud) {
          const oRes = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`)
          if (oRes.ok) oembedRaw = await oRes.json()
        } else if (isSpotify) {
          const oRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
          if (oRes.ok) oembedRaw = await oRes.json()
        }
      } catch { /* oEmbed optional */ }

      // Step 2: Send URL + oEmbed data to Claude to parse into clean fields
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          nocache: true,
          system: 'You parse music release metadata into clean, separate fields. Return ONLY valid JSON. NEVER fabricate — only include what the data tells you.',
          messages: [{
            role: 'user',
            content: `I have a music release link and its metadata. Parse this into clean, separate fields.

URL: ${url}

oEmbed metadata from the platform:
${JSON.stringify(oembedRaw, null, 2)}

RULES:
- The oEmbed "title" often contains multiple pieces mashed together like "ARTIST — Title [Label]" or "Artist - Track Name". SPLIT these into separate fields.
- The oEmbed "author_name" is the ACCOUNT that uploaded it — this might be the label, not the artist. Look at the title to determine the actual artist.
- For SoundCloud "sets/" URLs, the release type is likely an EP or album, not a single.
- For single track URLs, type is "single".
- Do NOT guess the release date — omit it if not present in the data.
- The label might be in square brackets in the title, or it might be the author_name if the URL path starts with a label name.
- Clean up capitalisation — use proper title case for the release title.

Return JSON with ONLY these fields (omit any you can't determine):
{
  "title": "just the release/track title, nothing else",
  "type": "single|ep|album|remix",
  "label": "the record label if identifiable",
  "streaming_url": "the full URL"
}`,
          }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || '{}'
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const fields = JSON.parse(cleaned)

      setForm(f => ({
        ...f,
        ...(fields.title && { title: fields.title }),
        ...(fields.type && { type: fields.type }),
        ...(fields.label && { label: fields.label }),
        streaming_url: fields.streaming_url || url,
      }))
    } catch {
      setError('Could not extract release info from that link')
    } finally {
      setFetchingLink(false)
    }
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

        {/* LINK IMPORT */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              placeholder="Paste SoundCloud, Spotify, or Bandcamp link..."
              onKeyDown={e => e.key === 'Enter' && linkInput.trim() && !fetchingLink && fetchFromLink()}
              style={{
                flex: 1, background: s.bg, border: `1px solid ${s.border}`,
                color: s.text, fontFamily: s.font, fontSize: '12px',
                padding: '12px 16px', outline: 'none',
              }}
            />
            <button
              onClick={fetchFromLink}
              disabled={fetchingLink || !linkInput.trim()}
              style={{
                background: 'transparent', border: `1px solid ${s.gold}`,
                color: s.gold, fontFamily: s.font, fontSize: '10px',
                letterSpacing: '0.15em', textTransform: 'uppercase',
                padding: '0 20px', cursor: fetchingLink ? 'wait' : 'pointer',
                opacity: fetchingLink || !linkInput.trim() ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: '8px',
                whiteSpace: 'nowrap',
              }}
            >
              {fetchingLink ? <><ScanPulse size="sm" /> Fetching...</> : 'Import →'}
            </button>
          </div>
        </div>

        {/* SCREENSHOT UPLOAD */}
        <div style={{ marginBottom: '20px' }}>
          <ScreenshotUpload
            extractionPrompt="Extract music release details from this image. Return JSON with: title, type (single/ep/album), release_date (YYYY-MM-DD), label, streaming_url. Only include fields you can confidently extract. NEVER fabricate — only include what you can see."
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
