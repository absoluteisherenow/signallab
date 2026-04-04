'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface GigInfo {
  title: string
  venue: string
  date: string
  location?: string
}

const PROMOTER_FIELDS = [
  { key: 'local_contact_name', label: 'Contact on the night', placeholder: 'Name' },
  { key: 'local_contact_phone', label: 'Contact phone', placeholder: '+44 7700 000000' },
  { key: 'set_time', label: 'Set time + length', placeholder: 'e.g. 01:00 – 02:30' },
  { key: 'doors_time', label: 'Doors', placeholder: 'e.g. 22:00' },
  { key: 'running_order', label: 'Running order', placeholder: 'e.g. DJ A 22:00–23:30, NM 23:30–01:00, DJ B 01:00–03:00' },
  { key: 'driver', label: 'Driver / transport', placeholder: 'e.g. Car collecting from hotel at 21:00' },
  { key: 'artist_liaison', label: 'Artist liaison', placeholder: 'Name + contact if different from above' },
  { key: 'additional_notes', label: 'Anything else', placeholder: 'Optional' },
]

export default function AdvancePage() {
  const { gigId } = useParams()
  const [form, setForm] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [gig, setGig] = useState<GigInfo | null>(null)
  const [techRider, setTechRider] = useState<string | null>(null)
  const [hospitalityRider, setHospitalityRider] = useState<string | null>(null)
  const [techConfirmed, setTechConfirmed] = useState(false)
  const [hospoConfirmed, setHospoConfirmed] = useState(false)

  useEffect(() => {
    fetch(`/api/advance?gigId=${gigId}`)
      .then(r => r.json())
      .then(data => {
        if (data.gig) setGig(data.gig)
        if (data.techRider) setTechRider(data.techRider)
        if (data.hospitalityRider) setHospitalityRider(data.hospitalityRider)
      })
      .catch(() => {})
  }, [gigId])

  const displayDate = gig?.date
    ? new Date(gig.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  async function submit() {
    setSubmitting(true)
    try {
      await fetch('/api/advance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gig_id: gigId,
          tech_confirmed: techConfirmed,
          hospo_confirmed: hospoConfirmed,
          ...form,
        }),
      })
      setSubmitted(true)
    } catch {
      alert('Something went wrong — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const allConfirmed = techConfirmed && hospoConfirmed
  const hasRequiredFields = form.set_time && form.local_contact_name

  // ── SUBMITTED STATE ──
  if (submitted) return (
    <div style={{ minHeight: '100vh', background: '#070706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', 'Courier New', monospace" }}>
      <div style={{ textAlign: 'center', color: '#f0ebe2', padding: '24px' }}>
        <img src="/nm-emblem.png" alt="Night Manoeuvres" style={{ width: '80px', height: '80px', marginBottom: '40px', objectFit: 'contain' }} />
        <div style={{ color: '#b08d57', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '20px' }}>Advance confirmed</div>
        <div style={{ fontSize: '28px', fontWeight: 300, marginBottom: '16px', lineHeight: 1.3 }}>Thank you</div>
        {gig && (
          <div style={{ color: '#f0ebe2', fontSize: '15px', lineHeight: 1.6, marginBottom: '12px' }}>
            {gig.title}
          </div>
        )}
        <div style={{ color: '#8a8780', fontSize: '14px', lineHeight: 1.6 }}>We've got everything we need.<br />See you at the show.</div>
      </div>
    </div>
  )

  // ── MAIN FORM ──
  return (
    <div style={{ minHeight: '100vh', background: '#070706', color: '#f0ebe2', fontFamily: "'DM Mono', 'Courier New', monospace", padding: '48px 24px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* NM Emblem */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '48px' }}>
          <img src="/nm-emblem.png" alt="Night Manoeuvres" style={{ width: '100px', height: '100px', objectFit: 'contain', display: 'block' }} />
        </div>

        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ color: '#c9a46e', fontSize: '12px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '12px' }}>Show advance</div>
          {gig ? (
            <>
              <div style={{ fontSize: '24px', fontWeight: 400, marginBottom: '10px', lineHeight: 1.3, color: '#ffffff' }}>{gig.title}</div>
              <div style={{ color: '#b0ada6', fontSize: '15px', lineHeight: 1.6 }}>
                {gig.venue}{gig.location ? `, ${gig.location}` : ''}
              </div>
              <div style={{ color: '#b0ada6', fontSize: '15px' }}>{displayDate}</div>
            </>
          ) : (
            <div style={{ fontSize: '22px', fontWeight: 400, color: '#ffffff' }}>Loading...</div>
          )}
        </div>

        {/* TECH RIDER */}
        {techRider && (() => {
          const hasWeBring = techRider.toLowerCase().includes('we bring')
          const parts = hasWeBring ? techRider.split(/we bring:?/i) : [techRider]
          const venueProvides = parts[0].replace(/^HYBRID LIVE\s*/i, '').trim()
          const weBring = parts[1]?.trim() || null
          // Extract synth spec if present
          const hasSynthSpec = weBring?.toLowerCase().includes('synth spec')
          const weBringLines = weBring ? weBring.split(/synth spec:?/i)[0].trim() : null
          const synthSpec = hasSynthSpec && weBring ? weBring.split(/synth spec:?/i)[1]?.trim() : null

          return (
            <div style={{ marginBottom: '40px' }}>
              <div style={sectionHeader}>Technical requirements {techRider.toLowerCase().startsWith('hybrid') ? '— Hybrid Live' : ''}</div>

              {/* Venue provides */}
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '10px' }}>Please provide</div>
              <div style={riderBox}>
                {venueProvides.split('\n').filter(l => l.trim()).map((line, i) => (
                  <div key={i} style={{ padding: '6px 0', fontSize: '14px', lineHeight: 1.7, color: '#e8e4dc' }}>
                    {line}
                  </div>
                ))}
              </div>

              {/* We bring */}
              {weBringLines && (
                <>
                  <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: '#8a8780', textTransform: 'uppercase', marginBottom: '10px', marginTop: '20px' }}>We bring (no action needed)</div>
                  <div style={{ ...riderBox, opacity: 0.7, borderStyle: 'dashed' as const }}>
                    {weBringLines.split('\n').filter(l => l.trim()).map((line, i) => (
                      <div key={i} style={{ padding: '6px 0', fontSize: '14px', lineHeight: 1.7, color: '#b0ada6' }}>
                        {line}
                      </div>
                    ))}
                    {synthSpec && (
                      <div style={{ padding: '10px 0 2px', fontSize: '12px', color: '#6a6862', borderTop: '1px solid #2e2c29', marginTop: '8px' }}>
                        Synth dimensions: {synthSpec}
                      </div>
                    )}
                  </div>
                </>
              )}

              <label style={confirmRow} onClick={() => setTechConfirmed(!techConfirmed)}>
                <div style={{
                  ...checkbox,
                  background: techConfirmed ? '#b08d57' : 'transparent',
                  borderColor: techConfirmed ? '#b08d57' : '#3a3835',
                }}>
                  {techConfirmed && <span style={{ fontSize: '12px', color: '#070706', fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: '14px', color: techConfirmed ? '#ffffff' : '#b0ada6' }}>
                  Confirmed — we can provide this
                </span>
              </label>
            </div>
          )
        })()}

        {/* HOSPITALITY RIDER */}
        {hospitalityRider && (
          <div style={{ marginBottom: '40px' }}>
            <div style={sectionHeader}>Hospitality</div>
            <div style={riderBox}>
              {hospitalityRider.split('\n').map((line, i) => (
                <div key={i} style={{ padding: '6px 0', fontSize: '14px', lineHeight: 1.7, color: '#e8e4dc' }}>
                  {line}
                </div>
              ))}
            </div>
            <label style={confirmRow} onClick={() => setHospoConfirmed(!hospoConfirmed)}>
              <div style={{
                ...checkbox,
                background: hospoConfirmed ? '#b08d57' : 'transparent',
                borderColor: hospoConfirmed ? '#b08d57' : '#3a3835',
              }}>
                {hospoConfirmed && <span style={{ fontSize: '12px', color: '#070706', fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: '14px', color: hospoConfirmed ? '#ffffff' : '#b0ada6' }}>
                Confirmed — we can provide this
              </span>
            </label>
          </div>
        )}

        {/* PROMOTER DETAILS */}
        <div style={{ marginBottom: '40px' }}>
          <div style={sectionHeader}>Your details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {PROMOTER_FIELDS.map(field => (
              <div key={field.key}>
                <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                  {field.label}
                </div>
                <input
                  value={form[field.key] || ''}
                  onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#b08d57'}
                  onBlur={e => e.target.style.borderColor = '#2e2c29'}
                />
              </div>
            ))}
          </div>
        </div>

        {/* SUBMIT */}
        <button
          onClick={submit}
          disabled={submitting || !allConfirmed || !hasRequiredFields}
          style={{
            width: '100%',
            background: (allConfirmed && hasRequiredFields) ? '#b08d57' : '#2e2c29',
            color: (allConfirmed && hasRequiredFields) ? '#070706' : '#6a6862',
            border: 'none',
            fontFamily: "'DM Mono', 'Courier New', monospace",
            fontSize: '12px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            padding: '18px',
            cursor: (allConfirmed && hasRequiredFields) ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.6 : 1,
            fontWeight: 600,
            transition: 'all 0.2s',
          }}
        >
          {submitting ? 'Submitting...' : !allConfirmed ? 'Confirm riders above to continue' : !hasRequiredFields ? 'Fill in set time + contact to continue' : 'Confirm advance →'}
        </button>

        {/* Signal Lab OS footer */}
        <div style={{ marginTop: '64px', paddingTop: '24px', borderTop: '1px solid #1a1917', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '48px' }}>
          <a href="https://signallabos.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#b08d57" strokeWidth="1.5" opacity="0.25"/>
                <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#b08d57" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span style={{ fontFamily: "'Unbounded', Arial, sans-serif", fontWeight: 200, fontSize: '10px', color: '#b08d57', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Signal Lab OS</span>
            </div>
            <span style={{ fontSize: '9px', color: '#52504c', letterSpacing: '0.1em' }}>Join the waitlist</span>
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Styles ──

const sectionHeader: React.CSSProperties = {
  fontSize: '12px',
  letterSpacing: '0.25em',
  color: '#c9a46e',
  textTransform: 'uppercase',
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: '1px solid #3a3835',
}

const riderBox: React.CSSProperties = {
  background: '#141310',
  border: '1px solid #3a3835',
  padding: '20px 24px',
  marginBottom: '16px',
}

const confirmRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  cursor: 'pointer',
  padding: '8px 0',
}

const checkbox: React.CSSProperties = {
  width: '22px',
  height: '22px',
  border: '2px solid #3a3835',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: 'all 0.15s',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#141310',
  border: '1px solid #3a3835',
  color: '#ffffff',
  fontFamily: "'DM Mono', 'Courier New', monospace",
  fontSize: '14px',
  padding: '14px 16px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}
