'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

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
}

interface GigDetailProps {
  gigId: string
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
  const [deleting, setDeleting] = useState(false)

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
      .then(d => { if (d.gig) setGig(d.gig) })
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
    const updates = Object.fromEntries(fd.entries())
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

  async function handleSendAdvance() {
    if (!gig?.promoter_email) { showToast('Add a promoter email first'); return }
    setSendingAdvance(true)
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
        }),
      })
      setAdvanceStatus('sent')
      showToast('Advance sent to promoter')
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
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '12px' }}>
              {gig.status === 'confirmed' ? '● Confirmed' : gig.status === 'cancelled' ? '○ Cancelled' : '◎ Pending'}
            </div>
            <div className="display" style={{ fontSize: 'clamp(28px, 3.5vw, 46px)', lineHeight: 1.0, marginBottom: '10px' }}>{gig.title}</div>
            <div style={{ fontSize: '14px', color: 'var(--text-dim)' }}>{gig.venue} · {gig.location}</div>
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
            { label: 'Fee', value: `${gig.currency === 'GBP' ? '£' : gig.currency === 'USD' ? '$' : gig.currency === 'EUR' ? '€' : gig.currency === 'CHF' ? 'CHF ' : gig.currency || ''}${(gig.fee || 0).toLocaleString()}` },
            { label: 'Capacity', value: (gig.audience || 0).toLocaleString() },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>{stat.label}</div>
              <div className="display" style={{ fontSize: '26px', lineHeight: 1, color: 'var(--text)' }}>{stat.value}</div>
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
                  <Field label="Currency" value={gig.currency} edit={editing} name="currency" options={['EUR', 'GBP', 'USD', 'CHF']} />
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                {gig.promoter_email ? `Send advance form to ${gig.promoter_email}` : 'Add a promoter email above, then send the advance form.'}
              </div>
              <button onClick={handleSendAdvance} disabled={sendingAdvance || !gig.promoter_email}
                style={{ background: 'linear-gradient(180deg, #1e2e1e 0%, #141f14 100%)', border: '1px solid rgba(61,107,74,0.4)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '12px 22px', cursor: gig.promoter_email ? 'pointer' : 'not-allowed', opacity: sendingAdvance || !gig.promoter_email ? 0.5 : 1 }}>
                {sendingAdvance ? 'Sending…' : 'Send advance'}
              </button>
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
          <Link href="/business/finances"
            style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dimmer)', border: '1px solid var(--border-dim)', padding: '12px 20px', textDecoration: 'none' }}>
            Finances
          </Link>
        </div>
      </div>
    </div>
  )
}
