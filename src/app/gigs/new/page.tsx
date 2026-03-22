'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
  })

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  const inputStyle = {
    width: '100%', background: s.bg, border: `1px solid ${s.border}`,
    color: s.text, fontFamily: s.font, fontSize: '14px',
    padding: '12px 16px', outline: 'none', boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    fontSize: '9px', letterSpacing: '0.18em', color: s.dimmer,
    textTransform: 'uppercase' as const, marginBottom: '8px', display: 'block',
  }

  function update(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
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
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          Signal Lab — New gig
        </div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '36px', fontWeight: 200, letterSpacing: '0.03em' }}>Add new gig</div>
      </div>

      <div style={{ maxWidth: '720px' }}>

        {/* SHOW DETAILS */}
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '32px', marginBottom: '16px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Show details</div>
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
          <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Financial</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Fee</label>
              <input value={form.fee} onChange={e => update('fee', e.target.value)}
                placeholder="5000" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Currency</label>
              <select value={form.currency} onChange={e => update('currency', e.target.value)} style={inputStyle}>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="AUD">AUD</option>
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
          <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Promoter</div>
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
