'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const SECTIONS = [
  { title: 'Show times', fields: [
    { key: 'load_in_time', label: 'Load in time', placeholder: '16:00' },
    { key: 'soundcheck_time', label: 'Soundcheck', placeholder: '18:00' },
    { key: 'doors_time', label: 'Doors', placeholder: '21:00' },
    { key: 'set_time', label: 'Set time', placeholder: '23:00' },
    { key: 'set_length', label: 'Set length', placeholder: '60 mins' },
  ]},
  { title: 'Venue access', fields: [
    { key: 'parking', label: 'Parking / load in', placeholder: 'Rear entrance on Smith St' },
    { key: 'wifi_name', label: 'WiFi name', placeholder: 'VenueName_Staff' },
    { key: 'wifi_password', label: 'WiFi password', placeholder: '' },
    { key: 'dressing_room', label: 'Dressing room', placeholder: 'Level 2, left of stage' },
  ]},
  { title: 'Hospitality', fields: [
    { key: 'hospitality', label: 'Rider / hospitality', placeholder: 'Beers, water, towels...' },
    { key: 'hotel_name', label: 'Hotel name', placeholder: 'Ace Hotel' },
    { key: 'hotel_address', label: 'Hotel address', placeholder: '100 Main St' },
    { key: 'hotel_checkin', label: 'Check in time', placeholder: '15:00' },
  ]},
  { title: 'Contacts & technical', fields: [
    { key: 'local_contact_name', label: 'Local contact name', placeholder: 'John Smith' },
    { key: 'local_contact_phone', label: 'Local contact phone', placeholder: '+44 7700 900000' },
    { key: 'backline', label: 'Backline / equipment', placeholder: 'Pioneer CDJ-3000s, DJM-900NXS2' },
    { key: 'additional_notes', label: 'Additional notes', placeholder: 'Anything else we should know' },
  ]},
]

interface GigInfo {
  title: string
  venue: string
  date: string
  location?: string
}

export default function AdvancePage() {
  const { gigId } = useParams()
  const [form, setForm] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [gig, setGig] = useState<GigInfo | null>(null)

  useEffect(() => {
    // Fetch gig details for context
    fetch(`/api/advance?gigId=${gigId}`)
      .then(r => r.json())
      .then(data => {
        if (data.gig) {
          setGig(data.gig)
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
        body: JSON.stringify({ gig_id: gigId, ...form }),
      })
      setSubmitted(true)
    } catch {
      alert('Something went wrong — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) return (
    <div style={{ minHeight: '100vh', background: '#070706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', 'Courier New', monospace" }}>
      <div style={{ textAlign: 'center', color: '#f0ebe2' }}>
        <img src="/nm-logo-bw.png" alt="Night Manoeuvres" style={{ width: '120px', marginBottom: '32px', opacity: 0.9 }} />
        <div style={{ color: '#b08d57', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>Advance complete</div>
        <div style={{ fontSize: '28px', fontWeight: 300, marginBottom: '12px' }}>Thank you</div>
        <div style={{ color: '#8a8780', fontSize: '13px' }}>The artist has been notified. See you at the show.</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#070706', color: '#f0ebe2', fontFamily: "'DM Mono', 'Courier New', monospace", padding: '48px 24px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        {/* NM Logo */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <img src="/nm-logo-bw.png" alt="Night Manoeuvres" style={{ width: '140px', opacity: 0.9 }} />
        </div>

        {/* Header with gig context */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ color: '#b08d57', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '8px' }}>Advance form</div>
          {gig ? (
            <>
              <div style={{ fontSize: '24px', fontWeight: 300, marginBottom: '6px', lineHeight: 1.3 }}>{gig.title}</div>
              <div style={{ color: '#8a8780', fontSize: '13px', marginBottom: '4px' }}>
                {gig.venue}{gig.location ? `, ${gig.location}` : ''}
              </div>
              <div style={{ color: '#8a8780', fontSize: '13px', marginBottom: '24px' }}>{displayDate}</div>
            </>
          ) : (
            <div style={{ fontSize: '24px', fontWeight: 300, marginBottom: '8px' }}>Show advance</div>
          )}
          <div style={{ color: '#52504c', fontSize: '12px', borderTop: '1px solid #1a1917', paddingTop: '16px' }}>
            Please complete all sections below. Takes around 5 minutes.
          </div>
        </div>

        {/* Form sections */}
        {SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: '40px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#b08d57', textTransform: 'uppercase', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #2e2c29' }}>
              {section.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {section.fields.map(field => (
                <div key={field.key}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#8a8780', textTransform: 'uppercase', marginBottom: '8px' }}>{field.label}</div>
                  <input
                    value={form[field.key] || ''}
                    onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{
                      width: '100%',
                      background: '#0e0d0b',
                      border: '1px solid #2e2c29',
                      color: '#f0ebe2',
                      fontFamily: "'DM Mono', 'Courier New', monospace",
                      fontSize: '13px',
                      padding: '12px 16px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={e => e.target.style.borderColor = '#b08d57'}
                    onBlur={e => e.target.style.borderColor = '#2e2c29'}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Submit */}
        <button onClick={submit} disabled={submitting} style={{
          width: '100%', background: '#b08d57', color: '#070706', border: 'none',
          fontFamily: "'DM Mono', 'Courier New', monospace", fontSize: '11px', letterSpacing: '0.2em',
          textTransform: 'uppercase', padding: '16px', cursor: 'pointer', opacity: submitting ? 0.6 : 1,
          fontWeight: 600, transition: 'opacity 0.2s',
        }}>
          {submitting ? 'Submitting...' : 'Submit advance →'}
        </button>

        {/* Signal Lab OS footer */}
        <div style={{ marginTop: '64px', paddingTop: '24px', borderTop: '1px solid #1a1917', textAlign: 'center', paddingBottom: '48px' }}>
          <svg width="16" height="16" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle' }}>
            <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#b08d57" strokeWidth="1.5" opacity="0.25"/>
            <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#b08d57" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span style={{ fontFamily: "'Unbounded', Arial, sans-serif", fontWeight: 200, fontSize: '10px', color: '#b08d57', letterSpacing: '0.12em', textTransform: 'uppercase', marginLeft: '6px', verticalAlign: 'middle' }}>Signal Lab OS</span>
          <div style={{ fontSize: '9px', color: '#52504c', marginTop: '6px', letterSpacing: '0.1em' }}>signallabos.com</div>
        </div>
      </div>
    </div>
  )
}
