'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface GigInfo {
  title: string
  venue: string
  date: string
  location?: string
}

function isLocalGig(location?: string): boolean {
  if (!location) return false
  const loc = location.toLowerCase()
  return /london|hackney|dalston|shoreditch|brixton|peckham|bermondsey|camden|islington/.test(loc)
}

// Paired rows: [left, right] on same line. Single item = full width.
const FORM_ROWS: { key: string; label: string; placeholder: string }[][] = [
  [
    { key: 'local_contact_name', label: 'Promoter name', placeholder: 'Name' },
    { key: 'local_contact_phone', label: 'Promoter contact', placeholder: '+44 7700 000000' },
  ],
  [
    { key: 'local_contact_email', label: 'Promoter email', placeholder: 'email@domain.com' },
  ],
  [
    { key: 'driver_name', label: 'Driver name', placeholder: 'Name' },
    { key: 'driver_contact', label: 'Driver contact', placeholder: '+44 7700 000000' },
  ],
  [
    { key: 'artist_liaison_name', label: 'Artist liaison name', placeholder: 'Name' },
    { key: 'artist_liaison_contact', label: 'Artist liaison contact', placeholder: '+44 7700 000000' },
  ],
  [
    { key: 'videographer_name', label: 'Videographer name', placeholder: 'Name' },
    { key: 'videographer_contact', label: 'Videographer contact', placeholder: '+44 7700 000000' },
  ],
  [
    { key: 'videographer_email', label: 'Videographer email', placeholder: 'email@domain.com' },
  ],
  [
    { key: 'sound_tech_name', label: 'Sound tech name', placeholder: 'Name' },
    { key: 'sound_tech_contact', label: 'Sound tech contact', placeholder: '+44 7700 000000' },
  ],
  [
    { key: 'set_time', label: 'Set time', placeholder: 'e.g. 01:00 – 02:30' },
  ],
  [
    { key: 'running_order', label: 'Running order', placeholder: 'e.g. DJ A 22:00, NM 00:00, DJ B 02:00' },
  ],
  [
    { key: 'green_room', label: 'Green room', placeholder: 'e.g. Yes — basement behind stage' },
  ],
  [
    { key: 'guest_list_spots', label: 'Guest list spots', placeholder: 'e.g. 4' },
    { key: 'guest_list_method', label: 'Send guest list how / by when', placeholder: 'e.g. email by Friday' },
  ],
  [
    { key: 'additional_notes', label: 'Anything else', placeholder: 'Optional' },
  ],
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
  const [accomProvided, setAccomProvided] = useState(false)
  const [transferProvided, setTransferProvided] = useState(false)

  useEffect(() => {
    fetch(`/api/advance?gigId=${gigId}`)
      .then(r => r.json())
      .then(data => {
        if (data.gig) setGig(data.gig)
        if (data.techRider) setTechRider(data.techRider)
        if (data.hospitalityRider) setHospitalityRider(data.hospitalityRider)
        if (data.prefill && Object.keys(data.prefill).length > 0) {
          setForm(data.prefill)
          if (data.prefill.hotel_name) setAccomProvided(true)
          if (data.prefill.transfer_driver_name) setTransferProvided(true)
        }
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

  // Only require a confirm if the rider block actually rendered
  const allConfirmed = (!techRider || techConfirmed) && (!hospitalityRider || hospoConfirmed)
  const hasRequiredFields = form.set_time && form.local_contact_name

  // ── SUBMITTED STATE ──
  if (submitted) return (
    <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      <div style={{ textAlign: 'center', color: '#f2f2f2', padding: '24px' }}>
        <img src="/nm-emblem.png" alt="Night Manoeuvres" style={{ width: '80px', height: '80px', marginBottom: '40px', objectFit: 'contain' }} />
        <div style={{ color: '#ff2a1a', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '20px' }}>Advance confirmed</div>
        <div style={{ fontSize: '28px', fontWeight: 300, marginBottom: '16px', lineHeight: 1.3 }}>Thank you</div>
        {gig && (
          <div style={{ color: '#f2f2f2', fontSize: '15px', lineHeight: 1.6, marginBottom: '12px' }}>
            {gig.title}
          </div>
        )}
        <div style={{ color: '#909090', fontSize: '14px', lineHeight: 1.6 }}>We've got everything we need.<br />See you at the show.</div>
      </div>
    </div>
  )

  // ── MAIN FORM ──
  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: '#f2f2f2', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", padding: '48px 24px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        {/* NM Emblem */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '48px' }}>
          <img src="/nm-emblem.png" alt="Night Manoeuvres" style={{ width: '100px', height: '100px', objectFit: 'contain', display: 'block' }} />
        </div>

        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ color: '#ff2a1a', fontSize: '12px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '12px' }}>Show advance</div>
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
                  <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: '#909090', textTransform: 'uppercase', marginBottom: '10px', marginTop: '20px' }}>We bring (no action needed)</div>
                  <div style={{ ...riderBox, opacity: 0.7, borderStyle: 'dashed' as const }}>
                    {weBringLines.split('\n').filter(l => l.trim()).map((line, i) => (
                      <div key={i} style={{ padding: '6px 0', fontSize: '14px', lineHeight: 1.7, color: '#b0ada6' }}>
                        {line}
                      </div>
                    ))}
                    {synthSpec && (
                      <div style={{ padding: '10px 0 2px', fontSize: '12px', color: '#6a6862', borderTop: '1px solid #222222', marginTop: '8px' }}>
                        Synth dimensions: {synthSpec}
                      </div>
                    )}
                  </div>
                </>
              )}

              <label style={confirmRow} onClick={() => setTechConfirmed(!techConfirmed)}>
                <div style={{
                  ...checkbox,
                  background: techConfirmed ? '#ff2a1a' : 'transparent',
                  borderColor: techConfirmed ? '#ff2a1a' : '#3a3835',
                }}>
                  {techConfirmed && <span style={{ fontSize: '12px', color: '#050505', fontWeight: 700 }}>✓</span>}
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
                background: hospoConfirmed ? '#ff2a1a' : 'transparent',
                borderColor: hospoConfirmed ? '#ff2a1a' : '#3a3835',
              }}>
                {hospoConfirmed && <span style={{ fontSize: '12px', color: '#050505', fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: '14px', color: hospoConfirmed ? '#ffffff' : '#b0ada6' }}>
                Confirmed — we can provide this
              </span>
            </label>
          </div>
        )}

        {/* SHOW DETAILS */}
        <div style={{ marginBottom: '40px' }}>
          <div style={sectionHeader}>Show details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {FORM_ROWS.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: '12px' }}>
                {row.map(field => (
                  <div key={field.key} style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                      {field.label}
                    </div>
                    <input
                      value={form[field.key] || ''}
                      onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = '#ff2a1a'}
                      onBlur={e => e.target.style.borderColor = '#222222'}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ACCOMMODATION & TRANSFER — non-local gigs only */}
        {gig && !isLocalGig(gig.location) && (
          <>
            {/* ACCOMMODATION */}
            <div style={{ marginBottom: '40px' }}>
              <div style={sectionHeader}>Accommodation</div>
              <label style={confirmRow} onClick={() => setAccomProvided(!accomProvided)}>
                <div style={{
                  ...checkbox,
                  background: accomProvided ? '#ff2a1a' : 'transparent',
                  borderColor: accomProvided ? '#ff2a1a' : '#3a3835',
                }}>
                  {accomProvided && <span style={{ fontSize: '12px', color: '#050505', fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: '14px', color: accomProvided ? '#ffffff' : '#b0ada6' }}>
                  Is accommodation being provided?
                </span>
              </label>
              {accomProvided && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
                  {[
                    { key: 'hotel_name', label: 'Hotel name', placeholder: 'Hotel name' },
                    { key: 'hotel_address', label: 'Hotel address', placeholder: 'Full address' },
                  ].map(field => (
                    <div key={field.key}>
                      <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                        {field.label}
                      </div>
                      <input
                        value={form[field.key] || ''}
                        onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = '#ff2a1a'}
                        onBlur={e => e.target.style.borderColor = '#222222'}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Check-in date
                      </div>
                      <input
                        type="date"
                        value={form.hotel_checkin_date || ''}
                        onChange={e => setForm(p => ({ ...p, hotel_checkin_date: e.target.value }))}
                        style={{ ...inputStyle, colorScheme: 'dark' }}
                        onFocus={e => e.target.style.borderColor = '#ff2a1a'}
                        onBlur={e => e.target.style.borderColor = '#222222'}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Check-in time
                      </div>
                      <input
                        value={form.hotel_checkin_time || ''}
                        onChange={e => setForm(p => ({ ...p, hotel_checkin_time: e.target.value }))}
                        placeholder="e.g. 14:00"
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = '#ff2a1a'}
                        onBlur={e => e.target.style.borderColor = '#222222'}
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Confirmation reference
                    </div>
                    <input
                      value={form.hotel_reference || ''}
                      onChange={e => setForm(p => ({ ...p, hotel_reference: e.target.value }))}
                      placeholder="Booking reference"
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = '#ff2a1a'}
                      onBlur={e => e.target.style.borderColor = '#222222'}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* TRANSFER */}
            <div style={{ marginBottom: '40px' }}>
              <div style={sectionHeader}>Airport / station transfer</div>
              <label style={confirmRow} onClick={() => setTransferProvided(!transferProvided)}>
                <div style={{
                  ...checkbox,
                  background: transferProvided ? '#ff2a1a' : 'transparent',
                  borderColor: transferProvided ? '#ff2a1a' : '#3a3835',
                }}>
                  {transferProvided && <span style={{ fontSize: '12px', color: '#050505', fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: '14px', color: transferProvided ? '#ffffff' : '#b0ada6' }}>
                  Is a pickup being arranged?
                </span>
              </label>
              {transferProvided && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Driver / company name
                      </div>
                      <input
                        value={form.transfer_driver_name || ''}
                        onChange={e => setForm(p => ({ ...p, transfer_driver_name: e.target.value }))}
                        placeholder="Name"
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = '#ff2a1a'}
                        onBlur={e => e.target.style.borderColor = '#222222'}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Driver phone
                      </div>
                      <input
                        value={form.transfer_driver_phone || ''}
                        onChange={e => setForm(p => ({ ...p, transfer_driver_phone: e.target.value }))}
                        placeholder="+44 7700 000000"
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = '#ff2a1a'}
                        onBlur={e => e.target.style.borderColor = '#222222'}
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Pickup location
                    </div>
                    <input
                      value={form.transfer_pickup_location || ''}
                      onChange={e => setForm(p => ({ ...p, transfer_pickup_location: e.target.value }))}
                      placeholder="e.g. Berlin Tegel arrivals"
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = '#ff2a1a'}
                      onBlur={e => e.target.style.borderColor = '#222222'}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#b0ada6', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Pickup time
                    </div>
                    <input
                      value={form.transfer_pickup_time || ''}
                      onChange={e => setForm(p => ({ ...p, transfer_pickup_time: e.target.value }))}
                      placeholder="e.g. 14:30"
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = '#ff2a1a'}
                      onBlur={e => e.target.style.borderColor = '#222222'}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* SUBMIT */}
        <button
          onClick={submit}
          disabled={submitting || !allConfirmed || !hasRequiredFields}
          style={{
            width: '100%',
            background: (allConfirmed && hasRequiredFields) ? '#ff2a1a' : '#222222',
            color: (allConfirmed && hasRequiredFields) ? '#050505' : '#6a6862',
            border: 'none',
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
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
        <div style={{ marginTop: '64px', paddingTop: '24px', borderTop: '1px solid #1d1d1d', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '48px' }}>
          <div style={{ fontSize: '9px', color: '#909090', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '10px' }}>Powered by</div>
          <a href="https://signallabos.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" strokeWidth="1.5" opacity="0.25"/>
                <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#ff2a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 200, fontSize: '10px', color: '#ff2a1a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Signal Lab OS</span>
            </div>
            <span style={{ fontSize: '9px', color: '#909090', letterSpacing: '0.1em' }}>Join the waitlist</span>
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
  color: '#ff2a1a',
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
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontSize: '14px',
  padding: '14px 16px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}
