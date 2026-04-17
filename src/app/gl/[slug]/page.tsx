'use client'

/**
 * Public guest-list signup page at /gl/<slug>.
 *
 * Reached via WhatsApp share from GigDetail. Shows gig title/venue/date and a
 * short form: name (required), +1s, response type, one contact field, notes.
 * No login, no cookie — submits to /api/gl/<slug>.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Gig = { title: string; date: string; venue: string; lineup: string }

const S = {
  bg: '#050505',
  panel: '#0e0e0e',
  panelAlt: '#141414',
  border: '#1d1d1d',
  text: '#f2f2f2',
  dim: '#b0b0b0',
  dimmer: '#6a6a6a',
  accent: '#ff2a1a',
  font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: S.bg,
  border: `1px solid ${S.border}`,
  color: S.text,
  fontFamily: S.font,
  fontSize: '14px',
  padding: '12px 14px',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: S.dim,
  marginBottom: '6px',
  display: 'block',
}

export default function GuestListPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug || ''

  const [gig, setGig] = useState<Gig | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [name, setName] = useState('')
  const [plusOnes, setPlusOnes] = useState(0)
  const [response, setResponse] = useState<'coming' | 'guestlist' | 'maybe'>('coming')
  const [instagram, setInstagram] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug) return
    fetch(`/api/gl/${slug}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then(d => { if (d?.gig) setGig(d.gig) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Your name is required'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/gl/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          plus_ones: plusOnes,
          response,
          instagram: instagram.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Submission failed')
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const wrapperStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: S.bg,
    color: S.text,
    fontFamily: S.font,
    padding: '60px 20px',
    display: 'flex',
    justifyContent: 'center',
  }

  if (loading) {
    return <div style={wrapperStyle}><div style={{ color: S.dim, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div></div>
  }

  if (notFound) {
    return (
      <div style={wrapperStyle}>
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: S.accent, marginBottom: '12px' }}>
            Not found
          </div>
          <div style={{ fontSize: '13px', color: S.dim, lineHeight: 1.7 }}>
            This guest-list link is invalid or has been taken down.
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={wrapperStyle}>
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: S.accent, marginBottom: '16px' }}>
            You're on the list
          </div>
          <div style={{ fontSize: '14px', color: S.text, marginBottom: '8px', fontWeight: 300 }}>
            Thanks {name.split(' ')[0] || 'mate'}.
          </div>
          <div style={{ fontSize: '12px', color: S.dim, lineHeight: 1.7 }}>
            We'll confirm the spot shortly. See you there.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapperStyle}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        {/* Gig header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', textTransform: 'uppercase', color: S.accent, marginBottom: '10px' }}>
            Guest list
          </div>
          {gig && (
            <>
              <div style={{ fontSize: '22px', color: S.text, lineHeight: 1.2, marginBottom: '8px', fontWeight: 300 }}>
                {gig.title}
              </div>
              <div style={{ fontSize: '12px', color: S.dim, letterSpacing: '0.06em' }}>
                {gig.venue}{gig.venue && gig.date ? ' · ' : ''}{fmtDate(gig.date)}
              </div>
              {gig.lineup && (
                <div style={{ fontSize: '11px', color: S.dimmer, marginTop: '8px', letterSpacing: '0.04em' }}>
                  {gig.lineup}
                </div>
              )}
            </>
          )}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Your name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="First last" required maxLength={80} style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>+1s</label>
              <select value={plusOnes} onChange={e => setPlusOnes(Number(e.target.value))} style={{ ...inputStyle, appearance: 'none' }}>
                {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>I'm…</label>
              <select value={response} onChange={e => setResponse(e.target.value as any)} style={{ ...inputStyle, appearance: 'none' }}>
                <option value="coming">Buying a ticket</option>
                <option value="guestlist">Asking for guest list</option>
                <option value="maybe">Maybe</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Instagram <span style={{ color: S.dimmer, textTransform: 'none', letterSpacing: 0 }}>(so we recognise you)</span></label>
            <input type="text" value={instagram} onChange={e => setInstagram(e.target.value)}
              placeholder="@handle" maxLength={40} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Phone <span style={{ color: S.dimmer, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+44 7…" maxLength={30} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Anything to tell us?</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={300}
              placeholder="Bringing someone, dietary notes, etc." style={{ ...inputStyle, resize: 'vertical', minHeight: '70px', fontFamily: S.font }} />
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: S.accent, letterSpacing: '0.04em' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting || !name.trim()}
            style={{
              background: submitting || !name.trim() ? S.panelAlt : S.accent,
              border: `1px solid ${submitting || !name.trim() ? S.border : S.accent}`,
              color: submitting || !name.trim() ? S.dim : S.bg,
              fontFamily: S.font,
              fontSize: '11px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              padding: '16px 24px',
              cursor: submitting || !name.trim() ? 'not-allowed' : 'pointer',
              marginTop: '8px',
            }}>
            {submitting ? 'Sending…' : 'Put me down'}
          </button>
        </form>
      </div>
    </div>
  )
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
