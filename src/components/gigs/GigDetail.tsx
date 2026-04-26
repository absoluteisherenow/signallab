'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BlurredAmount } from '@/components/ui/BlurredAmount'
import { PulseLoader } from '@/components/ui/PulseLoader'
import { tierAllowsMultiCurrency, type SupportedCurrency } from '@/lib/currency'
import type { Tier } from '@/lib/stripe'

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
  ticket_url: string | null
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
  label: { fontSize: '10px', letterSpacing: '0.22em', fontWeight: 700, color: 'var(--text-dimmer)', textTransform: 'uppercase' as const, marginBottom: '6px' },
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
  const [advanceRiderType, setAdvanceRiderType] = useState<string | null>(null)
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
  const [tier, setTier] = useState<Tier>('free')
  const [defaultCurrency, setDefaultCurrency] = useState<SupportedCurrency | null>(null)
  const multiCurrency = tierAllowsMultiCurrency(tier)

  // Guest list state
  const [glSlug, setGlSlug] = useState<string | null>(null)
  const [glResponses, setGlResponses] = useState<any[]>([])
  const [glLoading, setGlLoading] = useState(false)
  const [glCreating, setGlCreating] = useState(false)
  const [glCopied, setGlCopied] = useState(false)

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
    // Tier + default currency for multi-currency gating
    Promise.all([
      fetch('/api/billing/status').then(r => r.json()).catch(() => ({})),
      fetch('/api/settings').then(r => r.json()).catch(() => ({})),
    ]).then(([billing, settings]) => {
      if (billing?.tier) setTier(billing.tier as Tier)
      const dc = settings?.settings?.default_currency
      if (dc) setDefaultCurrency(dc as SupportedCurrency)
    })

    fetch(`/api/gigs/${gigId}`)
      .then(r => r.json())
      .then(d => {
        if (d.gig) {
          const g = d.gig
          // Pro+ may keep what's saved (multi-currency); locked tiers fall back to default or location-derived
          if (!multiCurrency) {
            g.currency = defaultCurrency || (g.location ? currencyFromLocation(g.location) : g.currency)
          }
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
          setAdvanceRiderType(d.requests[0].rider_type || null)
        }
      })
      .catch(() => {})

    fetch(`/api/gigs/${gigId}/travel`)
      .then(r => r.json())
      .then(d => setTravelBookings(d.bookings || []))
      .catch(() => {})

    // Check for existing guest list invite
    fetch('/api/guest-list')
      .then(r => r.json())
      .then(d => {
        const invite = (d.invites || []).find((i: any) => i.gig_id === gigId)
        if (invite) {
          setGlSlug(invite.slug)
          // Fetch responses
          fetch(`/api/guest-list/${invite.slug}/responses`)
            .then(r => r.json())
            .then(rd => setGlResponses(rd.responses || []))
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [gigId])

  // Once tier + default_currency settle, lock currency for non-multi-currency tiers
  useEffect(() => {
    if (!gig || multiCurrency || !defaultCurrency) return
    if (gig.currency !== defaultCurrency) {
      setGig({ ...gig, currency: defaultCurrency })
    }
  }, [tier, defaultCurrency, multiCurrency, gig])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function createGuestList() {
    setGlCreating(true)
    try {
      const res = await fetch('/api/guest-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gig_id: gigId }),
      })
      const data = await res.json()
      if (data.success && data.invite) {
        setGlSlug(data.invite.slug)
        showToast('Guest list created')
      }
    } catch { showToast('Failed to create guest list') }
    finally { setGlCreating(false) }
  }

  async function toggleGlConfirmed(responseId: string, confirmed: boolean) {
    try {
      await fetch(`/api/guest-list/${glSlug}/responses`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: responseId, confirmed }),
      })
      setGlResponses(prev => prev.map(r => r.id === responseId ? { ...r, confirmed } : r))
    } catch {}
  }

  function copyGlLink() {
    if (!glSlug) return
    const url = `${window.location.origin}/gl/${glSlug}`
    navigator.clipboard.writeText(url)
    setGlCopied(true)
    setTimeout(() => setGlCopied(false), 2000)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!gig) return
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const updates = Object.fromEntries(fd.entries()) as Record<string, any>
    // Locked tiers: force default_currency (or fall back to location); Pro+ keeps user pick
    if (!multiCurrency) {
      updates.currency = defaultCurrency || (updates.location ? currencyFromLocation(updates.location) : updates.currency)
    }
    // Strip @ from handle fields
    for (const k of ['venue_handle', 'promoter_handle', 'photographer_handle']) {
      if (typeof updates[k] === 'string') updates[k] = updates[k].replace(/^@/, '').trim() || null
    }
    // Convert lineup_csv → lineup jsonb
    if ('lineup_csv' in updates) {
      const csv = String(updates.lineup_csv || '')
      updates.lineup = csv.split(',').map(x => x.trim()).filter(Boolean).map(entry => {
        const m = entry.match(/^(.+?)\s*[@(]\s*@?([\w._]+)\s*\)?$/)
        if (m) return { name: m[1].trim(), handle: m[2].replace(/^@/, '') }
        if (entry.startsWith('@')) return { name: entry.slice(1), handle: entry.slice(1) }
        return { name: entry }
      })
      delete updates.lineup_csv
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
    <div style={{ padding: '120px 56px', display: 'flex', justifyContent: 'center' }}>
      <PulseLoader size="lg" label="Loading gig" />
    </div>
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
    <div className="detail-page" style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>

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
              <img src={artworkPreview} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-dim)', borderRadius: 0 }} />
            )}
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '12px' }}>
                {gig.status === 'confirmed' ? '● Confirmed' : gig.status === 'cancelled' ? '○ Cancelled' : '◎ Pending'}
              </div>
              <div className="display" style={{ fontSize: 'clamp(28px, 3.5vw, 46px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.035em', lineHeight: 0.9, marginBottom: '10px' }}>{gig.title}</div>
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
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', fontWeight: 700, color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>{stat.label}</div>
              <div className="display" style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 0.9, color: 'var(--text)' }}>{stat.blur ? <BlurredAmount>{stat.value}</BlurredAmount> : stat.value}</div>
            </div>
          ))}
        </div>

        {/* Ticket stats — only render when the hourly cron has actually
            written data. Never show fake sold counts. */}
        {((gig as any).ra_attending != null || ((gig as any).dice_tiers as any[] | null)?.length) && (
          <div className="card" style={{ padding: '32px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Ticket stats</div>
              {(gig as any).ticket_stats_checked_at && (
                <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>
                  Updated {new Date((gig as any).ticket_stats_checked_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {(gig as any).ra_attending != null && (
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>RA · Going</div>
                  <div className="display" style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 0.9 }}>
                    {(gig as any).ra_attending}
                    {(gig as any).ra_capacity ? <span style={{ fontSize: '14px', color: 'var(--text-dimmer)', fontWeight: 500 }}> / {(gig as any).ra_capacity}</span> : null}
                  </div>
                </div>
              )}
              {(((gig as any).dice_tiers as Array<{ name: string; status: string; price?: number; currency?: string }> | null) || []).length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Dice · Tiers</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {((gig as any).dice_tiers as Array<{ name: string; status: string; price?: number; currency?: string }>).map((t, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: t.status === 'sold-out' ? 'var(--text-dimmer)' : 'var(--text)' }}>
                        <span>{t.name}{typeof t.price === 'number' ? ` · £${t.price.toFixed(2)}` : ''}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: t.status === 'sold-out' ? '#8a4a3a' : t.status === 'on-sale' ? 'var(--green)' : 'var(--text-dimmer)' }}>
                          {t.status.replace('-', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
                <Field label="Ticket URL" value={gig.ticket_url || ''} edit={editing} name="ticket_url" />
              </div>
            </div>

            {/* Financials & contact */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card" style={{ padding: '32px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '24px' }}>Financials</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Field label="Fee" value={gig.fee} edit={editing} name="fee" type="number" />
                  {multiCurrency ? (
                    <Field label="Currency" value={gig.currency} edit={editing} name="currency" options={['EUR', 'GBP', 'USD', 'CHF', 'AUD', 'CAD', 'JPY']} />
                  ) : (
                    <Field label="Currency" value={gig.currency} edit={false} name="currency" />
                  )}
                  <Field label="Capacity" value={gig.audience} edit={editing} name="audience" type="number" />
                </div>
              </div>

              <div className="card" style={{ padding: '32px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '24px' }}>Promoter</div>
                <Field label="Email" value={gig.promoter_email || ''} edit={editing} name="promoter_email" type="email" />
              </div>
            </div>
          </div>

          {/* TAGS & CONTENT */}
          <div className="card" style={{ padding: '32px', marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '6px' }}>Tags & content</div>
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '20px', lineHeight: 1.6 }}>
              Auto-suggests tags, collaborators and locations on every post for this gig.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <Field label="Venue Instagram" value={(gig as any).venue_handle || ''} edit={editing} name="venue_handle" />
              <Field label="Promoter Instagram" value={(gig as any).promoter_handle || ''} edit={editing} name="promoter_handle" />
              <Field label="Photographer name" value={(gig as any).photographer_name || ''} edit={editing} name="photographer_name" />
              <Field label="Photographer Instagram" value={(gig as any).photographer_handle || ''} edit={editing} name="photographer_handle" />
            </div>
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Line-up (other artists)</div>
              {editing ? (
                <input
                  name="lineup_csv"
                  defaultValue={Array.isArray((gig as any).lineup) ? (gig as any).lineup.map((l: any) => l.handle ? `${l.name} @${l.handle}` : l.name).join(', ') : ''}
                  placeholder="Artist One @artistone, Artist Two @artisttwo"
                  style={{ ...s.input, display: 'block', width: '100%' }}
                />
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                  {Array.isArray((gig as any).lineup) && (gig as any).lineup.length > 0
                    ? (gig as any).lineup.map((l: any) => l.handle ? `${l.name} (@${l.handle})` : l.name).join(' · ')
                    : '—'}
                </div>
              )}
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
              <div className="card" style={{ padding: '32px', marginBottom: '20px', borderColor: rider.confirmed ? 'rgba(242,242,242,0.3)' : 'rgba(255,42,26,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Rider</div>
                  {rider.confirmed ? (
                    <span style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--green)', background: 'rgba(242,242,242,0.1)', padding: '4px 12px' }}>✓ Confirmed</span>
                  ) : (
                    <button onClick={confirmRider}
                      style={{ background: 'linear-gradient(180deg, #1e2e1e 0%, #141f14 100%)', border: '1px solid rgba(242,242,242,0.4)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer' }}>
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
                        <span style={{ fontSize: '13px', color: 'var(--text)', letterSpacing: '0.05em', flex: 1 }}>
                          {b.flight_number && <span style={{ color: 'var(--gold)', marginRight: '8px' }}>{b.flight_number}</span>}
                          {b.name || 'Flight'}
                        </span>
                        {b.flight_number && (
                          <a
                            href={`https://flightaware.com/live/flight/${encodeURIComponent(b.flight_number.replace(/\s+/g, ''))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '10px',
                              letterSpacing: '0.15em',
                              textTransform: 'uppercase',
                              color: 'var(--gold)',
                              textDecoration: 'none',
                              border: '1px solid var(--gold)',
                              padding: '6px 12px',
                              borderRadius: 0,
                              fontWeight: 700,
                            }}
                          >
                            Track live →
                          </a>
                        )}
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
              <span style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: advanceStatus === 'complete' ? 'var(--green)' : 'var(--gold)', background: advanceStatus === 'complete' ? 'rgba(242,242,242,0.1)' : 'rgba(255,42,26,0.1)', padding: '4px 12px' }}>
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
                    style={{ background: 'linear-gradient(180deg, #1e2e1e 0%, #141f14 100%)', border: '1px solid rgba(242,242,242,0.4)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '12px 22px', cursor: gig.promoter_email ? 'pointer' : 'not-allowed', opacity: sendingAdvance || !gig.promoter_email ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                    {sendingAdvance ? 'Sending…' : 'Send advance'}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '14px' }}>Preview — confirm before sending</div>
                  {(() => {
                    const isLondon = (gig.location || '').toLowerCase().includes('london')
                    const riderType = isLondon ? 'Hometown' : 'Touring'
                    const appUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://signal-lab-os.absoluteishere.workers.dev')
                    const formUrl = `${appUrl}/advance/${gigId}`
                    const gigDate = gig.date ? new Date(gig.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''
                    return (
                  <div>
                    {/* Email headers */}
                    <div style={{ background: '#0a0a09', border: '1px solid var(--border-dim)', padding: '16px 20px', marginBottom: '0', fontSize: '11px', lineHeight: '1.8' }}>
                      <div style={{ color: 'var(--text-dimmer)' }}>From: <span style={{ color: 'var(--text-dim)' }}>NIGHT manoeuvres &lt;bookings@signallabos.com&gt;</span></div>
                      <div style={{ color: 'var(--text-dimmer)' }}>To: <span style={{ color: 'var(--text-dim)' }}>{gig.promoter_email}</span></div>
                      <div style={{ color: 'var(--text-dimmer)' }}>Subject: <span style={{ color: 'var(--text-dim)' }}>Advance sheet request — {gig.title} at {gig.venue}</span></div>
                      <div style={{ color: 'var(--text-dimmer)' }}>Rider preset: <span style={{ color: 'var(--gold)' }}>{riderType}</span></div>
                    </div>

                    {/* Actual rendered email body — matches /api/advance POST html exactly */}
                    <div style={{ border: '1px solid var(--border-dim)', borderTop: 'none', marginBottom: '12px', background: '#050505' }}>
                      <div style={{ fontFamily: 'monospace', color: '#f2f2f2', padding: '32px' }}>
                        <div style={{ color: '#ff2a1a', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '20px' }}>NIGHT manoeuvres — ADVANCE REQUEST</div>
                        <div style={{ fontSize: '20px', marginBottom: '6px', color: '#f2f2f2' }}>{gig.title}</div>
                        <div style={{ color: '#909090', fontSize: '13px', marginBottom: '18px' }}>{gig.venue} · {gigDate}</div>
                        <div style={{ color: '#d4d0c7', fontSize: '13px', marginBottom: '22px', lineHeight: '1.6' }}>Please complete the advance form for this show.</div>
                        <div style={{ display: 'inline-block', background: '#ff2a1a', color: '#050505', padding: '14px 28px', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 500 }}>Complete advance form</div>
                        <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #1d1d1d', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6a6760', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <svg width="12" height="12" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#ff2a1a" strokeWidth="1.5" opacity="0.4"/>
                            <polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#ff2a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                          </svg>
                          Powered by Signal Lab OS
                        </div>
                      </div>
                    </div>

                    {/* Link footer — exact URL the promoter clicks */}
                    <div style={{ background: '#0a0a09', border: '1px solid var(--border-dim)', padding: '12px 16px', marginBottom: '16px', fontSize: '10px', lineHeight: '1.6' }}>
                      <div style={{ color: 'var(--text-dimmer)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px', fontSize: '9px' }}>Button links to</div>
                      <div style={{ color: 'var(--gold)', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '11px' }}>{formUrl}</div>
                      <a href={formUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '8px', color: 'var(--text-dimmer)', fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', textDecoration: 'underline' }}>Test the link →</a>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setShowRiderPicker(false)}
                        style={{ flex: 1, background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 16px', cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button onClick={() => { handleSendAdvance(riderType); setShowRiderPicker(false) }}
                        disabled={sendingAdvance}
                        style={{ flex: 1, background: 'linear-gradient(180deg, #1e2e1e 0%, #141f14 100%)', border: '1px solid rgba(242,242,242,0.4)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 16px', cursor: 'pointer' }}>
                        {sendingAdvance ? 'Sending…' : 'Confirm & send'}
                      </button>
                    </div>
                  </div>
                  ); })()}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                {advanceStatus === 'complete' ? 'All advance information received from promoter.' : 'Advance form sent — waiting for promoter to complete.'}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => {
                    const rt = advanceRiderType || ((gig?.location || '').toLowerCase().includes('london') ? 'Hometown' : 'Touring')
                    handleSendAdvance(rt)
                    setAdvanceStatus('sent')
                  }}
                  disabled={sendingAdvance}
                  style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 18px', cursor: 'pointer', opacity: sendingAdvance ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  {sendingAdvance ? 'Sending…' : 'Resend advance'}
                </button>
                <Link href={`/advance/${gigId}`} style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '10px 18px', textDecoration: 'none' }}>
                  View form →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Guest List */}
        <div style={{ marginBottom: '24px' }}>
          <div style={s.label}>Guest List</div>
          {!glSlug ? (
            <button onClick={createGuestList} disabled={glCreating}
              style={{ marginTop: '8px', background: 'none', border: '1px solid var(--border-dim)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 20px', cursor: 'pointer', opacity: glCreating ? 0.5 : 1 }}>
              {glCreating ? 'Creating...' : 'Create guest list'}
            </button>
          ) : (
            <div style={{ marginTop: '8px' }}>
              {/* Share link */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                <button onClick={copyGlLink}
                  style={{ background: 'none', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 16px', cursor: 'pointer' }}>
                  {glCopied ? 'Copied' : 'Copy link'}
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(`You're invited! ${window.location.origin}/gl/${glSlug}`)}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '10px 16px', textDecoration: 'none' }}>
                  Share via WhatsApp
                </a>
                <Link href={`/gl/${glSlug}`}
                  style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '10px 16px', textDecoration: 'none' }}>
                  View page
                </Link>
              </div>

              {/* Response counts */}
              {glResponses.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                    {glResponses.length} response{glResponses.length !== 1 ? 's' : ''} &middot;{' '}
                    {glResponses.filter(r => r.response === 'coming').length} coming &middot;{' '}
                    {glResponses.filter(r => r.response === 'guestlist').length} guest list &middot;{' '}
                    {glResponses.reduce((sum: number, r: any) => sum + (r.plus_ones || 0), 0)} +1s &middot;{' '}
                    {glResponses.filter(r => r.confirmed).length} confirmed
                  </div>
                </div>
              )}

              {/* Response list */}
              {glResponses.length > 0 && (
                <div style={{ border: '1px solid var(--border-dim)' }}>
                  {glResponses.map((r, i) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < glResponses.length - 1 ? '1px solid var(--border-dim)' : 'none', background: r.confirmed ? 'rgba(74,122,58,0.08)' : 'transparent' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                          {r.name}{r.plus_ones > 0 ? ` +${r.plus_ones}` : ''}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '2px' }}>
                          {r.response === 'guestlist' ? 'GL' : r.response} &middot; {r.instagram ? `@${r.instagram}` : r.phone || r.email}
                          {r.notes ? ` · ${r.notes}` : ''}
                        </div>
                      </div>
                      <button onClick={() => toggleGlConfirmed(r.id, !r.confirmed)}
                        style={{ background: 'none', border: `1px solid ${r.confirmed ? 'var(--green)' : 'var(--border-dim)'}`, color: r.confirmed ? 'var(--green)' : 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 12px', cursor: 'pointer' }}>
                        {r.confirmed ? 'Confirmed' : 'Confirm'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {glResponses.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', fontStyle: 'italic' }}>
                  No responses yet. Share the link with your mates.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link href={`/broadcast?gig=${gig.id}&title=${encodeURIComponent(gig.title)}&date=${gig.date}`}
            style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--green)', border: '1px solid rgba(242,242,242,0.25)', padding: '12px 20px', textDecoration: 'none' }}>
            Create post
          </Link>
          <a href={`/api/gigs/${gig.id}/wallet`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid rgba(255,42,26,0.25)', padding: '12px 20px', textDecoration: 'none' }}>
            Add to Wallet
          </a>
          <Link href={`/gig-pass/${gig.id}`}
            style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid rgba(255,42,26,0.25)', padding: '12px 20px', textDecoration: 'none' }}>
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
