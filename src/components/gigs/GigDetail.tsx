'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BlurredAmount } from '@/components/ui/BlurredAmount'

interface Gig {
  id: string
  title: string
  venue: string
  location: string
  date: string
  time: string
  fee: number
  currency: string
  audience: number
  status: string
  promoter_email: string | null
  notes: string | null
  artwork_url: string | null
  ra_url: string | null
}

interface TravelBooking {
  id: string
  type: 'flight' | 'train' | 'hotel'
  name: string | null
  flight_number: string | null
  from_location: string | null
  to_location: string | null
  departure_at: string | null
  arrival_at: string | null
  check_in: string | null
  check_out: string | null
  reference: string | null
  cost: number | null
  currency: string
  notes: string | null
  source: string
}

interface GigDetailProps {
  gigId: string
}

function currencySymbol(c: string): string {
  const map: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CHF: 'CHF ', AUD: 'A$', CAD: 'C$', JPY: '¥' }
  return map[c] || c + ' '
}

function currencyFromLocation(location: string): string {
  const loc = location.toLowerCase()
  if (/australia|melbourne|sydney|brisbane|perth|adelaide|hobart/.test(loc)) return 'AUD'
  if (/\buk\b|united kingdom|england|scotland|wales|london|manchester|glasgow|bristol|edinburgh|leeds|birmingham|liverpool|nottingham|brighton|belfast|cardiff|sheffield|newcastle/.test(loc)) return 'GBP'
  if (/\busa\b|\bus\b|united states|new york|los angeles|chicago|miami|san francisco|las vegas|detroit|brooklyn|boston|seattle|portland|denver|atlanta|austin|nashville|philadelphia|washington/.test(loc)) return 'USD'
  if (/switzerland|zurich|zürich|geneva|basel|bern/.test(loc)) return 'CHF'
  if (/japan|tokyo|osaka|kyoto/.test(loc)) return 'JPY'
  if (/canada|toronto|montreal|vancouver/.test(loc)) return 'CAD'
  return 'EUR'
}

const s = {
  label: { fontSize: '10px', letterSpacing: '0.22em', color: 'var(--text-dimmer)', textTransform: 'uppercase' as const, marginBottom: '6px' },
  value: { fontSize: '14px', color: 'var(--text)', lineHeight: 1.4 },
  input: {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)',
    fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)',
    fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none',
  },
}

function Field({ label, value, edit, name, type = 'text', options }: {
  label: string; value: string | number; edit: boolean; name: string; type?: string; options?: string[]
}) {
  if (!edit) return (
    <div>
      <div style={s.label}>{label}</div>
      <div style={s.value}>{value || '—'}</div>
    </div>
  )
  if (options) return (
    <div>
      <div style={s.label}>{label}</div>
      <select name={name} defaultValue={String(value)} style={s.select}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
  return (
    <div>
      <div style={s.label}>{label}</div>
      <input name={name} defaultValue={String(value || '')} type={type} style={s.input} />
    </div>
  )
}

export function GigDetail({ gigId }: GigDetailProps) {
  const searchParams = useSearchParams()
  const startInEdit = searchParams.get('edit') === 'true'
  const [gig, setGig] = useState<Gig | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(startInEdit)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [advanceStatus, setAdvanceStatus] = useState<string | null>(null)
  const [sendingAdvance, setSendingAdvance] = useState(false)
  const [showRiderPicker, setShowRiderPicker] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [artworkTab, setArtworkTab] = useState<'ra' | 'upload'>('upload')
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null)
  const [uploadingArtwork, setUploadingArtwork] = useState(false)
  const [fetchingArtwork, setFetchingArtwork] = useState(false)
  const [raInput, setRaInput] = useState('')
  const [artworkError, setArtworkError] = useState('')
  const [travelBookings, setTravelBookings] = useState<TravelBooking[]>([])
  const [showAddTravel, setShowAddTravel] = useState(false)
  const [addingTravel, setAddingTravel] = useState(false)
  const [travelType, setTravelType] = useState<'flight' | 'hotel' | 'train'>('flight')

  // Parse rider sections from notes
  function parseRider(notes: string | null): { tech: string | null; hospitality: string | null; confirmed: boolean } | null {
    if (!notes || !notes.includes('RIDER STATUS:')) return null
    const techMatch = notes.match(/TECH RIDER:\n([\s\S]*?)(?=\nHOSPITALITY:|\nRIDER STATUS:|$)/)
    const hospMatch = notes.match(/HOSPITALITY:\n([\s\S]*?)(?=\nRIDER STATUS:|$)/)
    const confirmed = notes.includes('RIDER STATUS: confirmed')
    return {
      tech: techMatch ? techMatch[1].trim() : null,
      hospitality: hospMatch ? hospMatch[1].trim() : null,
      confirmed,
    }
  }

  useEffect(() => {
    fetch(`/api/gigs/${gigId}`)
      .then(r => r.json())
      .then(d => {
        if (d.gig) {
          const g = d.gig
          // Auto-correct currency from location on load
          if (g.location) g.currency = currencyFromLocation(g.location)
          setGig(g)
          if (g.artwork_url) setArtworkPreview(g.artwork_url)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    fetch(`/api/advance?gigId=${gigId}`)
      .then(r => r.json())
      .then(d => {
        if (d.requests?.length > 0) {
          setAdvanceStatus(d.requests[0].completed ? 'complete' : 'sent')
        }
      })
      .catch(() => {})

    fetch(`/api/gigs/${gigId}/travel`)
      .then(r => r.json())
      .then(d => setTravelBookings(d.bookings || []))
      .catch(() => {})
  }, [gigId])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!gig) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const updates = Object.fromEntries(fd.entries()) as Record<string, string>
    // Auto-detect currency from location — always override
    if (updates.location) {
      updates.currency = currencyFromLocation(updates.location)
    }
    try {
      const res = await fetch(`/api/gigs/${gigId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const d = await res.json()
      if (d.gig) {
        setGig(d.gig)
        setEditing(false)
        showToast('Saved')
      }
    } catch {
      showToast('Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleSendAdvance(riderType: string) {
    if (!gig?.promoter_email) { showToast('Add a promoter email first'); return }
    setSendingAdvance(true)
    setShowRiderPicker(false)
    try {
      await fetch('/api/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gigId: gig.id,
          gigTitle: gig.title,
          venue: gig.venue,
          date: gig.date,
          promoterEmail: gig.promoter_email,
          riderType,
        }),
      })
      setAdvanceStatus('sent')
      showToast(`Advance sent (${riderType})`)
    } catch {
      showToast('Failed to send advance')
    } finally {
      setSendingAdvance(false)
    }
  }

  async function confirmRider() {
    if (!gig) return
    const updatedNotes = (gig.notes || '').replace('RIDER STATUS: needs confirmation', 'RIDER STATUS: confirmed')
    const res = await fetch(`/api/gigs/${gig.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: updatedNotes }),
    })
    if (res.ok) {
      setGig(prev => prev ? { ...prev, notes: updatedNotes } : prev)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this gig? This cannot be undone.')) return
    setDeleting(true)
    try {
      await fetch(`/api/gigs/${gigId}`, { method: 'DELETE' })
      window.location.href = '/gigs'
    } catch {
      showToast('Delete failed')
      setDeleting(false)
    }
  }

  async function handleDeleteTravel(bookingId: string) {
    try {
      await fetch(`/api/gigs/${gigId}/travel?bookingId=${bookingId}`, { method: 'DELETE' })
      setTravelBookings(prev => prev.filter(b => b.id !== bookingId))
      showToast('Booking removed')
    } catch {
      showToast('Failed to remove booking')
    }
  }

  async function handleAddTravel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddingTravel(true)
    const fd = new FormData(e.currentTarget)
    const data: Record<string, any> = { type: travelType }
    fd.forEach((v, k) => { if (v) data[k] = v })
    try {
      const res = await fetch(`/api/gigs/${gigId}/travel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const d = await res.json()
      if (d.booking) {
        setTravelBookings(prev => [...prev, d.booking])
        setShowAddTravel(false)
        showToast('Travel added')
      }
    } catch {
      showToast('Failed to add travel')
    } finally {
      setAddingTravel(false)
    }
  }

  function formatDateTime(dt: string | null): string {
    if (!dt) return '—'
    const d = new Date(dt)
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(dt: string | null): string {
    if (!dt) return '—'
    const d = new Date(dt)
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Debounced RA fetch
  useEffect(() => {
    if (!raInput || !raInput.includes('ra.co')) { setArtworkError(''); return }
    const t = setTimeout(async () => {
      setFetchingArtwork(true); setArtworkError('')
      try {
        const d = await fetch(`/api/ra/artwork?url=${encodeURIComponent(raInput)}`).then(r => r.json())
        if (d.artwork) setArtworkPreview(d.artwork)
        else setArtworkError(d.error || 'No artwork found')
      } catch { setArtworkError('Could not fetch') }
      finally { setFetchingArtwork(false) }
    }, 700)
    return () => clearTimeout(t)
  }, [raInput])

  async function handleArtworkUpload(file: File) {
    setUploadingArtwork(true); setArtworkError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const d = await fetch('/api/upload/artwork', { method: 'POST', body: fd }).then(r => r.json())
      if (d.url) setArtworkPreview(d.url)
      else setArtworkError(d.error || 'Upload failed')
    } catch { setArtworkError('Upload failed') }
    finally { setUploadingArtwork(false) }
  }

  if (loading) return (
    <div style={{ padding: '80px 56px', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.1em' }}>Loading…</div>
  )

  if (!gig) return (
    <div style={{ padding: '80px 56px', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ fontSize: '12px', letterSpacing: '0.1em', marginBottom: '16px' }}>Gig not found.</div>
      <Link href="/gigs" style={{ fontSize: '11px', color: 'var(--gold)', textDecoration: 'none' }}>← Back to gigs</Link>
    </div>
  )

  const gigDate = new Date(gig.date)
  const daysTo = Math.ceil((gigDate.getTime() - Date.now()) / 86400000)

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', right: '32px', background: '#1a1811', border: '1px solid var(--gold)', color: 'var(--gold)', padding: '12px 20px', fontSize: '11px', letterSpacing: '0.15em', zIndex: 100 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '52px 56px 44px', borderBottom: '1px solid var(--border-dim)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
          <Link href="/gigs" style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-dimmer)', textDecoration: 'none', textTransform: 'uppercase' }}>← Gigs</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            {artworkPreview && !editing && (
              <img src={artworkPreview} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-dim)', borderRadius: '2px' }} />
            )}
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '12px' }}>
                {gig.status === 'confirmed' ? '● Confirmed' : gig.status === 'cancelled' ? '○ Cancelled' : '◎ Pending'}
              </div>
              <div className="display" style={{ fontSize: 'clamp(28px, 3.5vw, 46px)', lineHeight: 1.0, marginBottom: '10px' }}>{gig.title}</div>
              <div style={{ fontSize: '14px', color: 'var(--text-dim)' }}>{gig.venue} · {gig.location}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!editing && (
              <button onClick={() => setEditing(true)}
                style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '12px 22px', cursor: 'pointer', transition: 'all 0.15s' }}>
                Edit gig
              </button>
            )}
            <button onClick={handleDelete} disabled={deleting}
              style={{ background: 'transparent', border: '1px solid rgba(138, 74, 58, 0.3)', color: '#8a4a3a', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '12px 22px', cursor: 'pointer', opacity: deleting ? 0.5 : 1 }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '44px 56px' }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginBottom: '44px' }}>
          {[
            { label: 'Date', value: gigDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) },
            { label: 'Days away', value: daysTo >= 0 ? `${daysTo}d` : 'Past' },
            { label: 'Fee', value: `${currencySymbol(gig.currency)}${(gig.fee || 0).toLocaleString()}`, blur: true },
            { label: 'Capacity', value: (gig.audience || 0).toLocaleString() },
          ].map((stat: any) => (
            <div key={stat.label} style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>{stat.label}</div>
              <div className="display" style={{ fontSize: '26px', lineHeight: 1, color: 'var(--text)' }}>{stat.blur ? <BlurredAmount>{stat.value}</BlurredAmount> : stat.value}</div>
            </div>
          ))}
        </div>

        {/* Main edit/view form */}
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

            {/* Gig details */}
            <div className="card" style={{ padding: '32px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '24px' }}>Gig details</div>
              <div style={{ display: 'grid', gap: '20px' }}>
                <Field label="Title" value={gig.title} edit={editing} name="title" />
                <Field label="Venue" value={gig.venue} edit={editing} name="venue" />
                <Field label="Location" value={gig.location} edit={editing} name="location" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Field label="Date" value={gig.date} edit={editing} name="date" type="date" />
                  <Field label="Set time" value={gig.time} edit={editing} name="time" type="time" />
                </div>
                <Field label="Status" value={gig.status} edit={editing} name="status" options={['confirmed', 'pending', 'cancelled']} />
              </div>
            </div>

            {/* Financials & contact */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card" style={{ padding: '32px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '24px' }}>Financials</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Field label="Fee" value={gig.fee} edit={editing} name="fee" type="number" />
                  <Field label="Currency" value={gig.currency} edit={editing} name="currency" options={['EUR', 'GBP', 'USD', 'CHF', 'AUD', 'CAD', 'JPY']} />
                  <Field label="Capacity" value={gig.audience} edit={editing} name="audience" type="number" />
                </div>
              </div>

              <div className="card" style={{ padding: '32px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '24px' }}>Promoter</div>
                <Field label="Email" value={gig.promoter_email || ''} edit={editing} name="promoter_email" type="email" />
              </div>
            </div>
          </div>

          {/* Notes — strip rider sections for display */}
          <div className="card" style={{ padding: '32px', marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '24px' }}>Notes</div>
            {editing ? (
              <textarea name="notes" defaultValue={gig.notes || ''} rows={5}
                style={{ ...s.input, resize: 'vertical', display: 'block' }} />
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {(gig.notes || '').split('\nTECH RIDER:')[0].split('\nHOSPITALITY:')[0].trim() || 'No notes yet.'}
              </div>
            )}
          </div>

          {/* Rider — shown when extracted from booking email */}
          {(() => {
            const rider = parseRider(gig.notes)
            if (!rider) return null
            return (
              <div className="card" style={{ padding: '32px', marginBottom: '20px', borderColor: rider.confirmed ? 'rgba(61,107,74,0.3)' : 'rgba(176,141,87,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Rider</div>
                  {rider.confirmed ? (
                    <span style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--green)', background: 'rgba(61,107,74,0.1)', padding: '4px 12px' }}>✓ Confirmed</span>
                  ) : (
                    <button onClick={confirmRider}
                      style={{ background: 'linear-gradient(180deg, #1e2e1e 0%, #141f14 100%)', border: '1px solid rgba(61,107,74,0.4)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer' }}>
                      Confirm rider →
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: rider.tech && rider.hospitality ? '1fr 1fr' : '1fr', gap: '24px' }}>
                  {rider.tech && (
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '12px' }}>Tech</div>
                      {rider.tech.split('\n').map((line, i) => (
                        <div key={i} style={{ fontSize: '13px', color: 'var(--text-dim)', padding: '8px 0', borderBottom: '1px solid var(--border-dim)', lineHeight: 1.5 }}>{line}</div>
                      ))}
                    </div>
                  )}
                  {rider.hospitality && (
                    <div>
                      <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '12px' }}>Hospitality</div>
                      {rider.hospitality.split('\n').map((line, i) => (
                        <div key={i} style={{ fontSize: '13px', color: 'var(--text-dim)', padding: '8px 0', borderBottom: '1px solid var(--border-dim)', lineHeight: 1.5 }}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
                {!rider.confirmed && (
                  <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginTop: '16px' }}>
                    Extracted from booking email — confirm once you&#39;ve reviewed
                  </div>
                )}
              </div>
            )
          })()}

          {/* Artwork */}
          {editing && (
            <div className="card" style={{ padding: '32px', marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '20px' }}>Artwork</div>

              {/* Hidden input so artwork_url is included in FormData */}
              <input type="hidden" name="artwork_url" value={artworkPreview || ''} readOnly />
              <input type="hidden" name="ra_url" value={raInput || gig.ra_url || ''} readOnly />

              <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: '1px solid var(--border-dim)' }}>
                {(['upload', 'ra'] as const).map(t => (
                  <button key={t} type="button" onClick={() => { setArtworkTab(t); setArtworkError('') }} style={{
                    padding: '8px 18px', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase',
                    background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    color: artworkTab === t ? 'var(--gold)' : 'var(--text-dimmer)',
                    borderBottom: artworkTab === t ? '1px solid var(--gold)' : '1px solid transparent',
                    marginBottom: '-1px',
                  }}>
                    {t === 'ra' ? 'From RA' : 'Upload'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  {artworkTab === 'upload' ? (
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '72px', border: `1px dashed ${artworkPreview ? 'var(--gold)' : 'var(--border-dim)'}`, cursor: 'pointer', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', background: 'transparent', boxSizing: 'border-box' as const }}>
                        {uploadingArtwork ? 'Uploading…' : artworkPreview ? '✓ Uploaded — click to replace' : '+ Choose file'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleArtworkUpload(f) }} />
                      </label>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '8px' }}>
                        Resident Advisor URL {fetchingArtwork && <span style={{ fontStyle: 'italic' }}>fetching…</span>}
                      </div>
                      <input value={raInput} onChange={e => setRaInput(e.target.value)} placeholder="https://ra.co/events/..."
                        style={{ ...s.input, borderColor: artworkPreview && raInput ? 'var(--gold)' : undefined }} />
                    </div>
                  )}
                  {artworkError && <div style={{ fontSize: '10px', color: '#8a4a3a', marginTop: '6px' }}>{artworkError}</div>}
                </div>

                {artworkPreview ? (
                  <div style={{ flexShrink: 0, position: 'relative' }}>
                    <img src={artworkPreview} alt="" style={{ width: '100px', height: '100px', objectFit: 'cover', display: 'block', border: '1px solid var(--border-dim)' }} />
                    <button type="button" onClick={() => { setArtworkPreview(null); setRaInput('') }}
                      style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(7,7,6,0.85)', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: '12px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>
                ) : (
                  <div style={{ width: '100px', height: '100px', border: '1px dashed var(--border-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: '9px', color: 'var(--text-dimmer)', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.6 }}>No<br/>artwork</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {editing && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '44px' }}>
              <button type="submit" disabled={saving}
                style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '14px 28px', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => setEditing(false)}
                style={{ background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '14px 28px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}
        </form>

        {/* Travel & Logistics */}
        <div className="card" style={{ padding: '32px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Travel & Logistics</div>
            {travelBookings.length > 0 && !showAddTravel && (
              <button type="button" onClick={() => setShowAddTravel(true)}
                style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '10px 18px', cursor: 'pointer' }}>
                + Add
              </button>
            )}
          </div>

          {travelBookings.length === 0 && !showAddTravel && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>No travel booked</div>
              <button type="button" onClick={() => setShowAddTravel(true)}
                style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '12px 22px', cursor: 'pointer' }}>
                Add travel
              </button>
            </div>
          )}

          {travelBookings.length > 0 && (
            <div style={{ display: 'grid', gap: '12px', marginBottom: showAddTravel ? '24px' : 0 }}>
              {travelBookings.map(b => (
                <div key={b.id} style={{ position: 'relative', background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '20px 24px' }}>
                  <button type="button" onClick={() => handleDeleteTravel(b.id)}
                    style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: '14px', fontFamily: 'var(--font-mono)', padding: '4px 8px', lineHeight: 1 }}>
                    x
                  </button>

                  {b.type === 'flight' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <span style={{ fontSize: '14px' }}>✈</span>
                        <span style={{ fontSize: '13px', color: 'var(--text)', letterSpacing: '0.05em' }}>
                          {b.flight_number && <span style={{ color: 'var(--gold)', marginRight: '8px' }}>{b.flight_number}</span>}
                          {b.name || 'Flight'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {(b.from_location || b.to_location) && (
                          <div>
                            <div style={s.label}>Route</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{b.from_location || '—'} → {b.to_location || '—'}</div>
                          </div>
                        )}
                        {b.departure_at && (
                          <div>
                            <div style={s.label}>Departure</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{formatDateTime(b.departure_at)}</div>
                          </div>
                        )}
                        {b.arrival_at && (
                          <div>
                            <div style={s.label}>Arrival</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{formatDateTime(b.arrival_at)}</div>
                          </div>
                        )}
                        {b.reference && (
                          <div>
                            <div style={s.label}>Reference</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{b.reference}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {b.type === 'hotel' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <span style={{ fontSize: '14px' }}>🏨</span>
                        <span style={{ fontSize: '13px', color: 'var(--text)' }}>{b.name || 'Hotel'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {b.from_location && (
                          <div>
                            <div style={s.label}>Address</div>
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.from_location)}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '13px', color: 'var(--gold)', textDecoration: 'none' }}>{b.from_location}</a>
                          </div>
                        )}
                        {b.check_in && (
                          <div>
                            <div style={s.label}>Check-in</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{formatDate(b.check_in)}</div>
                          </div>
                        )}
                        {b.check_out && (
                          <div>
                            <div style={s.label}>Check-out</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{formatDate(b.check_out)}</div>
                          </div>
                        )}
                        {b.reference && (
                          <div>
                            <div style={s.label}>Reference</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{b.reference}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {b.type === 'train' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <span style={{ fontSize: '14px' }}>🚂</span>
                        <span style={{ fontSize: '13px', color: 'var(--text)' }}>{b.name || 'Train'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {(b.from_location || b.to_location) && (
                          <div>
                            <div style={s.label}>Route</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{b.from_location || '—'} → {b.to_location || '—'}</div>
                          </div>
                        )}
                        {b.departure_at && (
                          <div>
                            <div style={s.label}>Departure</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{formatDateTime(b.departure_at)}</div>
                          </div>
                        )}
                        {b.reference && (
                          <div>
                            <div style={s.label}>Reference</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{b.reference}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {b.cost != null && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-dim)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-dimmer)', letterSpacing: '0.1em' }}><BlurredAmount>{currencySymbol(b.currency)}{b.cost.toLocaleString()}</BlurredAmount></span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAddTravel && (
            <form onSubmit={handleAddTravel}>
              <div style={{ display: 'flex', gap: '0', marginBottom: '20px' }}>
                {(['flight', 'hotel', 'train'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setTravelType(t)}
                    style={{
                      flex: 1, padding: '10px 16px', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase',
                      background: travelType === t ? 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)' : 'transparent',
                      border: travelType === t ? '1px solid var(--gold)' : '1px solid var(--border-dim)',
                      color: travelType === t ? 'var(--gold)' : 'var(--text-dimmer)',
                      cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    }}>
                    {t === 'flight' ? '✈ Flight' : t === 'hotel' ? '🏨 Hotel' : '🚂 Train'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {travelType === 'flight' && (
                  <>
                    <div>
                      <div style={s.label}>Airline</div>
                      <input name="name" placeholder="e.g. Ryanair" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Flight number</div>
                      <input name="flight_number" placeholder="e.g. FR1234" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>From</div>
                      <input name="from_location" placeholder="e.g. Dublin" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>To</div>
                      <input name="to_location" placeholder="e.g. Berlin" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Departure</div>
                      <input name="departure_at" type="datetime-local" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Arrival</div>
                      <input name="arrival_at" type="datetime-local" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Reference</div>
                      <input name="reference" placeholder="Booking ref" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Cost</div>
                      <input name="cost" type="number" step="0.01" placeholder="0.00" style={s.input} />
                    </div>
                  </>
                )}

                {travelType === 'hotel' && (
                  <>
                    <div>
                      <div style={s.label}>Hotel name</div>
                      <input name="name" placeholder="e.g. Hotel Amano" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Address</div>
                      <input name="from_location" placeholder="Full address" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Check-in</div>
                      <input name="check_in" type="date" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Check-out</div>
                      <input name="check_out" type="date" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Reference</div>
                      <input name="reference" placeholder="Booking ref" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Cost</div>
                      <input name="cost" type="number" step="0.01" placeholder="0.00" style={s.input} />
                    </div>
                  </>
                )}

                {travelType === 'train' && (
                  <>
                    <div>
                      <div style={s.label}>Operator</div>
                      <input name="name" placeholder="e.g. Eurostar" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>From</div>
                      <input name="from_location" placeholder="e.g. London St Pancras" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>To</div>
                      <input name="to_location" placeholder="e.g. Brussels Midi" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Departure</div>
                      <input name="departure_at" type="datetime-local" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Reference</div>
                      <input name="reference" placeholder="Booking ref" style={s.input} />
                    </div>
                    <div>
                      <div style={s.label}>Cost</div>
                      <input name="cost" type="number" step="0.01" placeholder="0.00" style={s.input} />
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={addingTravel}
                  style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '12px 22px', cursor: 'pointer', opacity: addingTravel ? 0.7 : 1 }}>
                  {addingTravel ? 'Saving…' : 'Save booking'}
                </button>
                <button type="button" onClick={() => setShowAddTravel(false)}
                  style={{ background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '12px 22px', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Advance section */}
        <div className="card" style={{ padding: '32px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Advance</div>
            {advanceStatus && (
              <span style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: advanceStatus === 'complete' ? 'var(--green)' : 'var(--gold)', background: advanceStatus === 'complete' ? 'rgba(61,107,74,0.1)' : 'rgba(176,141,87,0.1)', padding: '4px 12px' }}>
                {advanceStatus === 'complete' ? '✓ Complete' : '⟳ Sent'}
              </span>
            )}
          </div>
          {!advanceStatus ? (
            <div>
              {!showRiderPicker ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                    {gig.promoter_email ? `Send advance form to ${gig.promoter_email}` : 'Add a promoter email above, then send the advance form.'}
                  </div>
                  <button onClick={() => { if (!gig.promoter_email) { showToast('Add a promoter email first'); return } setShowRiderPicker(true) }}
                    disabled={sendingAdvance || !gig.promoter_email}
                    style={{ background: 'linear-gradient(180deg, #1e2e1e 0%, #141f14 100%)', border: '1px solid rgba(61,107,74,0.4)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '12px 22px', cursor: gig.promoter_email ? 'pointer' : 'not-allowed', opacity: sendingAdvance || !gig.promoter_email ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                    {sendingAdvance ? 'Sending…' : 'Send advance'}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '12px' }}>Which rider for this show?</div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => handleSendAdvance('DJ Set')}
                      style={{ flex: 1, background: 'linear-gradient(180deg, #1e2e1e 0%, #141f14 100%)', border: '1px solid rgba(61,107,74,0.4)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '14px 16px', cursor: 'pointer' }}>
                      DJ Set
                    </button>
                    <button onClick={() => handleSendAdvance('Hybrid Live')}
                      style={{ flex: 1, background: 'linear-gradient(180deg, #1e2e1e 0%, #141f14 100%)', border: '1px solid rgba(61,107,74,0.4)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '14px 16px', cursor: 'pointer' }}>
                      Hybrid Live
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                {advanceStatus === 'complete' ? 'All advance information received from promoter.' : 'Advance form sent — waiting for promoter to complete.'}
              </div>
              <Link href={`/advance/${gigId}`} style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '10px 18px', textDecoration: 'none' }}>
                View form →
              </Link>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&date=${gig.date}`}
            style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--green)', border: '1px solid rgba(61,107,74,0.25)', padding: '12px 20px', textDecoration: 'none' }}>
            Create post
          </Link>
          <a href={`/api/gigs/${gig.id}/wallet`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid rgba(176,141,87,0.25)', padding: '12px 20px', textDecoration: 'none' }}>
            Wallet pass
          </a>
          <Link href={`/gig-pass/${gig.id}`}
            style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid rgba(176,141,87,0.25)', padding: '12px 20px', textDecoration: 'none' }}>
            Gig pass
          </Link>
          <Link href="/business/finances"
            style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '12px 20px', textDecoration: 'none' }}>
            Finances
          </Link>
        </div>
      </div>
    </div>
  )
}
