'use client'

import { useState } from 'react'
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

export default function AdvancePage() {
  const { gigId } = useParams()
  const [form, setForm] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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
    <div style={{ minHeight: '100vh', background: '#070706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono, monospace' }}>
      <div style={{ textAlign: 'center', color: '#f0ebe2' }}>
        <div style={{ color: '#b08d57', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>Advance complete</div>
        <div style={{ fontSize: '28px', fontWeight: 300, marginBottom: '12px' }}>Thank you</div>
        <div style={{ color: '#8a8780', fontSize: '13px' }}>The artist has been notified. See you at the show.</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#070706', color: '#f0ebe2', fontFamily: 'DM Mono, monospace', padding: '48px 24px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ color: '#b08d57', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '8px' }}>NIGHT MANOEUVRES — ADVANCE FORM</div>
        <div style={{ fontSize: '28px', fontWeight: 300, marginBottom: '8px' }}>Show advance</div>
        <div style={{ color: '#8a8780', fontSize: '13px', marginBottom: '48px' }}>Please complete all sections. Takes around 5 minutes.</div>
        {SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: '40px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#b08d57', textTransform: 'uppercase', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid #2e2c29' }}>
              {section.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {section.fields.map(field => (
                <div key={field.key}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#8a8780', textTransform: 'uppercase', marginBottom: '8px' }}>{field.label}</div>
                  <input value={form[field.key] || ''} onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{ width: '100%', background: '#0e0d0b', border: '1px solid #2e2c29', color: '#f0ebe2', fontFamily: 'DM Mono, monospace', fontSize: '13px', padding: '12px 16px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <button onClick={submit} disabled={submitting} style={{
          width: '100%', background: '#b08d57', color: '#070706', border: 'none',
          fontFamily: 'DM Mono, monospace', fontSize: '11px', letterSpacing: '0.2em',
          textTransform: 'uppercase', padding: '16px', cursor: 'pointer', opacity: submitting ? 0.6 : 1,
        }}>
          {submitting ? 'Submitting...' : 'Submit advance →'}
        </button>
      </div>
    </div>
  )
}
