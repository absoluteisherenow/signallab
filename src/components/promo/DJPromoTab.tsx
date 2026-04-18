'use client'

// DJ Promo tab for the /promo hub (contacts + blast composer).
// Extracted verbatim from src/app/releases/page.tsx during Phase 1 of the
// promo-hub migration. No behavior changes — gold token drift and `any` on `s`
// are carried over intentionally. See docs/plans/promo-hub-migration.md.

import { useEffect, useState } from 'react'
import { useGatedSend } from '@/lib/outbound'
import type { Contact, TrackMeta, PromoStyles } from './types'
import { TIERS } from './types'

export function DJPromoTab({ s, initialUrl, initialReleaseId, onUrlConsumed }: { s: PromoStyles; initialUrl?: string; initialReleaseId?: string | null; onUrlConsumed?: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [blasting, setBlasting] = useState(false)
  const [blastMessage, setBlastMessage] = useState('')
  const [blastUrl, setBlastUrl] = useState('')
  const [blastResult, setBlastResult] = useState<{ sent: number; failed: number; results: any[]; blast_id?: string } | null>(null)
  const [showBlast, setShowBlast] = useState(false)
  const [filterTier, setFilterTier] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [form, setForm] = useState({ name: '', instagram_handle: '', email: '', phone: '', genre: '', tier: 'standard', notes: '' })
  const [trackMeta, setTrackMeta] = useState<TrackMeta | null>(null)
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [writingPromo, setWritingPromo] = useState(false)
  const [blastHistory, setBlastHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [reactions, setReactions] = useState<Record<string, string>>({})
  const [blastChannel, setBlastChannel] = useState<'instagram' | 'whatsapp' | 'email'>('instagram')
  // Tracks which release (if any) this blast belongs to. Set when the user
  // lands here via ReleasesTab's "Send promo" button; cleared when they edit
  // the URL manually (that's a generic blast, not tied to the release row).
  const [releaseId, setReleaseId] = useState<string | null>(null)
  const gatedSend = useGatedSend()

  useEffect(() => { loadContacts() }, [])

  // Pre-fill URL + release link when coming from a release row
  useEffect(() => {
    if (initialUrl) {
      setBlastUrl(initialUrl)
      setReleaseId(initialReleaseId ?? null)
      setShowBlast(true)
      onUrlConsumed?.()
    }
  }, [initialUrl, initialReleaseId])

  // Load draft from localStorage
  useEffect(() => {
    const draft = localStorage.getItem('nm_blast_draft')
    if (draft) {
      try { const d = JSON.parse(draft); if (d.message) setBlastMessage(d.message); if (d.url) setBlastUrl(d.url) } catch {}
    }
  }, [])

  // Save draft to localStorage
  useEffect(() => {
    if (blastMessage || blastUrl) {
      localStorage.setItem('nm_blast_draft', JSON.stringify({ message: blastMessage, url: blastUrl }))
    } else {
      localStorage.removeItem('nm_blast_draft')
    }
  }, [blastMessage, blastUrl])

  // Auto-fetch SoundCloud metadata when URL changes
  useEffect(() => {
    if (!blastUrl || !blastUrl.includes('soundcloud.com')) { setTrackMeta(null); return }
    const t = setTimeout(async () => {
      setFetchingMeta(true)
      try {
        const d = await fetch(`/api/soundcloud/preview?url=${encodeURIComponent(blastUrl)}`).then(r => r.json())
        setTrackMeta(d.error ? null : d)
      } catch { setTrackMeta(null) }
      finally { setFetchingMeta(false) }
    }, 600)
    return () => clearTimeout(t)
  }, [blastUrl])

  async function writePromo() {
    setWritingPromo(true)
    try {
      const selectedContacts = contacts.filter(c => selected.has(c.id)).map(c => ({ name: c.name, genre: c.genre, tier: c.tier }))
      const d = await fetch('/api/promo-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: trackMeta, contacts: selectedContacts }),
      }).then(r => r.json())
      if (d.message) setBlastMessage(d.message)
    } finally { setWritingPromo(false) }
  }

  async function loadContacts() {
    setLoading(true)
    const d = await fetch('/api/contacts').then(r => r.json())
    setContacts(d.contacts || [])
    setLoading(false)
  }

  async function loadBlastHistory() {
    const d = await fetch('/api/promo-stats').then(r => r.json())
    setBlastHistory(d.blasts || [])
  }

  async function addContact() {
    if (!form.name) return
    setSaving(true)
    try {
      const { phone, ...rest } = form
      const d = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, whatsapp: phone }) }).then(r => r.json())
      if (d.contact) { setContacts(prev => [...prev, d.contact].sort((a, b) => a.name.localeCompare(b.name))); setAdding(false); setForm({ name: '', instagram_handle: '', email: '', phone: '', genre: '', tier: 'standard', notes: '' }) }
    } finally { setSaving(false) }
  }

  async function removeContact(id: string) {
    if (!window.confirm('Remove contact?')) return
    await fetch('/api/contacts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setContacts(prev => prev.filter(c => c.id !== id))
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function sendBlast() {
    if (!blastMessage || selected.size === 0) return
    const selectedContacts = contacts.filter(c => selected.has(c.id))
    const names = selectedContacts.map(c => c.name)
    const preview = names.slice(0, 3).join(', ') + (names.length > 3 ? ` + ${names.length - 3} more` : '')
    const channelLabel = blastChannel === 'instagram' ? 'Instagram DM' : blastChannel === 'whatsapp' ? 'WhatsApp' : 'email'

    // WhatsApp: open pre-filled links (can't bulk-send via API without Business API)
    // Still gate it so Anthony gets a final preview before N tabs open.
    if (blastChannel === 'whatsapp') {
      const result = await gatedSend<Record<string, never>, Record<string, never>>({
        endpoint: '/api/noop', // unused — skipServerPreview + we handle sending client-side
        previewBody: {},
        skipServerPreview: true,
        buildConfig: () => ({
          kind: 'dm',
          summary: `WhatsApp blast to ${selected.size} contacts`,
          text: blastMessage + (blastUrl ? `\n\n${blastUrl}` : ''),
          platform: 'WhatsApp',
          meta: [
            { label: 'Recipients', value: `${selected.size} contacts` },
            { label: 'Preview', value: preview },
            { label: 'Mode', value: 'Opens wa.me tabs — one per contact' },
          ],
        }),
      })
      if (!result.confirmed) return
      const siteUrl = window.location.origin
      let opened = 0, failed = 0
      const results: any[] = []
      for (const c of selectedContacts) {
        const phone = c.whatsapp?.replace(/\D/g, '')
        if (!phone) { results.push({ name: c.name, sent: false, error: 'No phone number' }); failed++; continue }
        const msg = encodeURIComponent(blastMessage + (blastUrl ? `\n\n${siteUrl}/go/${blastUrl.split('/').pop()}` : ''))
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
        results.push({ name: c.name, sent: true }); opened++
      }
      setBlastResult({ sent: opened, failed, results })
      return
    }

    // Email + Instagram DM — share the same API shape
    const body = {
      contact_ids: Array.from(selected),
      message: blastMessage,
      promo_url: blastUrl || null,
      track_title: trackMeta?.title || null,
      track_artist: trackMeta?.author || null,
      channel: blastChannel,
      release_id: releaseId,
    }
    setBlasting(true); setBlastResult(null)
    try {
      const result = await gatedSend<typeof body, { ok?: boolean; sent?: number; failed?: number; results?: any[]; blast_id?: string }>({
        endpoint: '/api/promo-blast',
        previewBody: body,
        skipServerPreview: true,
        buildConfig: () => ({
          kind: 'dm',
          summary: `${channelLabel} blast to ${selected.size} contacts`,
          text: blastMessage + (blastUrl ? `\n\n${blastUrl}` : ''),
          platform: channelLabel,
          meta: [
            { label: 'Recipients', value: `${selected.size} contacts` },
            { label: 'Preview', value: preview },
            ...(trackMeta?.title ? [{ label: 'Track', value: `${trackMeta.title} — ${trackMeta.author || ''}` }] : []),
            ...(blastUrl ? [{ label: 'Promo URL', value: blastUrl }] : []),
          ],
        }),
      })
      if (!result.confirmed) return
      const d = result.data || {}
      setBlastResult(d as { sent: number; failed: number; results: any[]; blast_id?: string })
      if ((d as any).ok) { await loadContacts(); setSelected(new Set()); setBlastMessage(''); setBlastUrl(''); setReleaseId(null); localStorage.removeItem('nm_blast_draft') }
    } finally { setBlasting(false) }
  }

  function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string
        const lines = text.split('\n').filter(l => l.trim())
        if (lines.length < 2) { setImporting(false); return }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
        const nameIdx = headers.findIndex(h => h === 'name')
        const igIdx = headers.findIndex(h => h.includes('instagram') || h === 'ig' || h === 'handle')
        const emailIdx = headers.findIndex(h => h.includes('email'))
        const genreIdx = headers.findIndex(h => h.includes('genre'))
        const tierIdx = headers.findIndex(h => h.includes('tier'))
        const notesIdx = headers.findIndex(h => h.includes('notes'))
        if (nameIdx === -1) { alert('CSV must have a "name" column'); setImporting(false); return }

        let imported = 0
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^['"]|['"]$/g, ''))
          const name = cols[nameIdx]
          if (!name) continue
          await fetch('/api/contacts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              instagram_handle: igIdx >= 0 ? cols[igIdx] : '',
              email: emailIdx >= 0 ? cols[emailIdx] : '',
              genre: genreIdx >= 0 ? cols[genreIdx] : '',
              tier: tierIdx >= 0 && ['priority','standard','new'].includes(cols[tierIdx]?.toLowerCase()) ? cols[tierIdx].toLowerCase() : 'standard',
              notes: notesIdx >= 0 ? cols[notesIdx] : '',
            }),
          })
          imported++
        }
        await loadContacts()
        alert(`${imported} contacts imported`)
      } catch (err) { alert('Import failed — check CSV format') }
      finally { setImporting(false); e.target.value = '' }
    }
    reader.readAsText(file)
  }

  function toggleSelect(id: string) { setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }
  function selectAll() { const ids = filtered.map(c => c.id); setSelected(prev => prev.size === ids.length ? new Set() : new Set(ids)) }

  const filtered = contacts.filter(c => {
    if (filterTier !== 'all' && c.tier !== filterTier) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return c.name.toLowerCase().includes(q) || (c.instagram_handle || '').toLowerCase().includes(q) || (c.genre || '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 140px)' }}>
      {/* Main contacts area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase' }}>Contacts — {contacts.length}</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', ...TIERS]).map(t => (
                <button key={t} onClick={() => setFilterTier(t)} style={{
                  fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 10px',
                  background: 'transparent', border: `1px solid ${filterTier === t ? `${s.gold}60` : s.border}`,
                  color: filterTier === t ? s.gold : s.dimmer, cursor: 'pointer', fontFamily: s.font,
                }}>{t}</button>
              ))}
            </div>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '10px', padding: '4px 12px', outline: 'none', width: '160px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setShowBlast(true)} style={{ background: selected.size > 0 ? s.gold : 'transparent', color: selected.size > 0 ? '#050505' : s.gold, border: selected.size > 0 ? 'none' : `1px solid ${s.gold}60`, cursor: 'pointer', padding: '0 20px', height: '32px', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font }}>
              {selected.size > 0 ? `Send promo to ${selected.size} →` : '+ New blast'}
            </button>
            <button onClick={() => setAdding(true)} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, cursor: 'pointer', padding: '0 14px', height: '32px', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font }}>
              + Add contact
            </button>
            <label style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, cursor: 'pointer', padding: '0 14px', height: '32px', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font, display: 'inline-flex', alignItems: 'center' }}>
              {importing ? 'Importing...' : '↑ Import CSV'}
              <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Add form */}
        {adding && (
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
              {[
                { label: 'Name', key: 'name', placeholder: 'DJ / Promoter name' },
                { label: 'Instagram handle', key: 'instagram_handle', placeholder: '@handle' },
                { label: 'Email', key: 'email', placeholder: 'email@domain.com' },
                { label: 'Phone (WhatsApp)', key: 'phone', placeholder: '+44 7700 900000' },
                { label: 'Genre', key: 'genre', placeholder: 'Techno / House / Electronica' },
                { label: 'Notes', key: 'notes', placeholder: 'Fabric resident, plays our stuff...' },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '6px' }}>{f.label}</div>
                  <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${s.borderMid}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '6px' }}>Tier</div>
                <select value={form.tier} onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${s.borderMid}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px 12px', outline: 'none' }}>
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={addContact} disabled={saving || !form.name} style={{ background: s.gold, color: '#050505', border: 'none', cursor: 'pointer', padding: '0 20px', height: '34px', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font, opacity: saving || !form.name ? 0.4 : 1 }}>
                {saving ? 'Saving...' : 'Add →'}
              </button>
              <button onClick={() => setAdding(false)} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, cursor: 'pointer', padding: '0 16px', height: '34px', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: s.font }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ color: s.dimmer, fontSize: '12px', padding: '40px 0' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', color: s.dim, marginBottom: '8px' }}>No contacts yet</div>
            <div style={{ fontSize: '10px', color: s.dimmer, marginBottom: '20px' }}>Add the DJs, promoters and labels you send promos to</div>
            <button onClick={() => setAdding(true)} style={{ background: 'transparent', border: `1px solid ${s.gold}40`, color: s.gold, cursor: 'pointer', padding: '0 20px', height: '34px', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: s.font }}>
              Add first contact →
            </button>
          </div>
        ) : (
          <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 140px 120px 80px 100px 20px', gap: '16px', padding: '10px 20px', borderBottom: `1px solid ${s.borderMid}`, fontSize: '8px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase', alignItems: 'center' }}>
              <button onClick={selectAll} style={{ width: '14px', height: '14px', border: `1px solid ${selected.size === filtered.length && filtered.length > 0 ? s.gold : s.border}`, background: selected.size === filtered.length && filtered.length > 0 ? s.gold : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {selected.size === filtered.length && filtered.length > 0 && <div style={{ width: '6px', height: '6px', background: '#050505' }} />}
              </button>
              <div>Name</div><div>Instagram</div><div>Genre</div><div>Tier</div><div>Last promo</div><div />
            </div>
            {filtered.map(c => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 140px 120px 80px 100px 20px', gap: '16px', padding: '14px 20px', borderBottom: `1px solid ${s.border}`, alignItems: 'center', background: selected.has(c.id) ? `${s.gold}08` : 'transparent' }}
                onMouseEnter={e => { if (!selected.has(c.id)) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected.has(c.id) ? `${s.gold}08` : 'transparent' }}>
                <button onClick={() => toggleSelect(c.id)} style={{ width: '14px', height: '14px', border: `1px solid ${selected.has(c.id) ? s.gold : s.border}`, background: selected.has(c.id) ? s.gold : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected.has(c.id) && <div style={{ width: '6px', height: '6px', background: '#050505' }} />}
                </button>
                <div>
                  <div style={{ fontSize: '13px' }}>{c.name}</div>
                  {c.notes && <div style={{ fontSize: '9px', color: s.dimmer, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{c.notes}</div>}
                </div>
                <div style={{ fontSize: '11px', color: s.dim }}>{c.instagram_handle ? `@${c.instagram_handle}` : '—'}</div>
                <div style={{ fontSize: '11px', color: s.dim }}>{c.genre || '—'}</div>
                <div>
                  <span style={{ fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 6px', background: c.tier === 'priority' ? `${s.gold}15` : c.tier === 'new' ? 'rgba(61,107,74,0.15)' : 'rgba(255,255,255,0.05)', color: c.tier === 'priority' ? s.gold : c.tier === 'new' ? '#3d6b4a' : s.dimmer }}>
                    {c.tier}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: s.dimmer }}>{c.last_sent_at ? new Date(c.last_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</div>
                <button onClick={() => removeContact(c.id)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,100,100,0.3)', cursor: 'pointer', fontSize: '14px', padding: '0', fontFamily: s.font }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Blast panel */}
      {showBlast && (
        <div style={{ width: '380px', borderLeft: `1px solid ${s.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${s.border}` }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.gold }}>Send promo — {selected.size} selected</div>
            <button onClick={() => { setShowBlast(false); setBlastResult(null) }} style={{ background: 'transparent', border: 'none', color: s.dimmer, cursor: 'pointer', fontSize: '16px', fontFamily: s.font }}>×</button>
          </div>
          <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>

            {/* SoundCloud URL */}
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '8px' }}>
                Private SoundCloud URL
                {fetchingMeta && <span style={{ marginLeft: '8px', color: s.dimmer, fontStyle: 'italic' }}>loading…</span>}
              </div>
              <input value={blastUrl} onChange={e => { setBlastUrl(e.target.value); setTrackMeta(null); setReleaseId(null) }} placeholder="https://soundcloud.com/..."
                style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${trackMeta ? s.gold + '60' : s.borderMid}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }} />
            </div>

            {/* Track preview card */}
            {trackMeta && (
              <div style={{ background: 'var(--bg)', border: `1px solid ${s.border}`, display: 'flex', gap: '12px', padding: '12px' }}>
                {trackMeta.artwork && (
                  <img src={trackMeta.artwork} alt="" style={{ width: '64px', height: '64px', objectFit: 'cover', flexShrink: 0, borderRadius: '2px' }} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '12px', color: s.text, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trackMeta.title || 'Untitled'}</div>
                  <div style={{ fontSize: '10px', color: s.dimmer, marginBottom: '8px' }}>{trackMeta.author || '—'}</div>
                  {trackMeta.description && (
                    <div style={{ fontSize: '9px', color: s.dimmer, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                      {trackMeta.description}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Write with Signal button */}
            {trackMeta && (
              <button onClick={writePromo} disabled={writingPromo}
                style={{ background: 'transparent', border: `1px solid ${s.gold}60`, color: s.gold, cursor: writingPromo ? 'default' : 'pointer', padding: '10px 16px', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: s.font, opacity: writingPromo ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {writingPromo ? 'Writing…' : '✦ Write promo with Signal'}
              </button>
            )}

            {/* Message */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer }}>Message</div>
                {blastMessage && (
                  <button onClick={() => setBlastMessage('')} style={{ background: 'transparent', border: 'none', color: s.dimmer, cursor: 'pointer', fontSize: '9px', fontFamily: s.font, letterSpacing: '0.1em' }}>clear</button>
                )}
              </div>
              <textarea value={blastMessage} onChange={e => setBlastMessage(e.target.value)} rows={7}
                placeholder={"hey — new EP out on Fabric Records April 17. private link below, would love your support 🖤"}
                style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${s.borderMid}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px 12px', outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
              <div style={{ textAlign: 'right', fontSize: '9px', color: blastMessage.length > 1000 ? '#f87171' : s.dimmer, marginTop: '4px' }}>
                {blastMessage.length}/1000
              </div>
            </div>

            {/* Save / Send */}
            {(blastMessage || blastUrl) && !blastResult && (
              <button onClick={() => { setShowBlast(false) }}
                style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, cursor: 'pointer', padding: '10px 16px', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font, width: '100%' }}>
                Save draft and close
              </button>
            )}

            {blastResult && (
              <div style={{ padding: '12px 16px', border: `1px solid ${blastResult.failed === 0 ? 'rgba(61,107,74,0.4)' : `${s.gold}40`}`, background: blastResult.failed === 0 ? 'rgba(61,107,74,0.1)' : `${s.gold}10`, fontSize: '10px' }}>
                <div style={{ color: blastResult.failed === 0 ? '#3d6b4a' : s.gold, marginBottom: '6px' }}>{blastResult.sent} sent · {blastResult.failed} failed</div>
                {blastResult.results?.filter(r => !r.sent).map((r, i) => <div key={i} style={{ fontSize: '9px', color: s.dim }}>× {r.name}: {r.error}</div>)}
              </div>
            )}
            {blastResult && blastResult.failed > 0 && (
              <button onClick={() => {
                const failedIds = contacts.filter(c =>
                  blastResult.results?.some(r => !r.sent && (r.handle === c.instagram_handle || r.name === c.name))
                ).map(c => c.id)
                setSelected(new Set(failedIds))
              }}
                style={{ background: 'transparent', border: `1px solid ${s.gold}40`, color: s.gold, cursor: 'pointer', padding: '8px 16px', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font }}>
                Select {blastResult.failed} failed to retry →
              </button>
            )}
            {blastResult && blastResult.sent > 0 && (
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '8px', marginTop: '8px' }}>DJ Reactions</div>
                {blastResult.results?.filter((r: any) => r.sent).map((r: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${s.border}` }}>
                    <div style={{ fontSize: '10px', color: s.text }}>{r.name}</div>
                    <select
                      value={reactions[r.contact_id] || 'none'}
                      onChange={async (e) => {
                        const reaction = e.target.value
                        setReactions(prev => ({ ...prev, [r.contact_id]: reaction }))
                        if (blastResult.blast_id) {
                          await fetch('/api/promo-reactions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ blast_id: blastResult.blast_id, contact_id: r.contact_id, reaction }),
                          })
                        }
                      }}
                      style={{ background: 'var(--bg)', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '9px', padding: '3px 8px', outline: 'none' }}
                    >
                      <option value="none">—</option>
                      <option value="playing">🔥 Playing it</option>
                      <option value="liked">👍 Liked it</option>
                      <option value="replied">💬 Replied</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
            {/* Channel selector */}
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '8px' }}>Send via</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {([
                  { key: 'instagram' as const, label: 'Instagram DM' },
                  { key: 'whatsapp' as const, label: 'WhatsApp' },
                  { key: 'email' as const, label: 'Email' },
                ]).map(ch => (
                  <button key={ch.key} onClick={() => setBlastChannel(ch.key)}
                    style={{
                      flex: 1, padding: '8px 4px', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase',
                      background: blastChannel === ch.key ? `${s.gold}15` : 'transparent',
                      border: `1px solid ${blastChannel === ch.key ? s.gold : s.border}`,
                      color: blastChannel === ch.key ? s.gold : s.dimmer,
                      cursor: 'pointer', fontFamily: s.font, transition: 'all 0.15s',
                    }}>
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            {selected.size === 0 && (
              <button onClick={selectAll}
                style={{ background: 'transparent', border: `1px solid ${s.gold}40`, color: s.gold, cursor: 'pointer', padding: '10px 16px', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font, width: '100%' }}>
                Select all {filtered.length} contacts →
              </button>
            )}
            <button onClick={sendBlast} disabled={blasting || !blastMessage || selected.size === 0}
              style={{ background: s.gold, color: '#050505', border: 'none', cursor: 'pointer', padding: '12px 20px', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: s.font, opacity: blasting || !blastMessage || selected.size === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
              {blasting ? 'Sending...' : selected.size === 0 ? 'Select contacts to send' : `Send to ${selected.size} via ${blastChannel === 'instagram' ? 'Instagram DM' : blastChannel === 'whatsapp' ? 'WhatsApp' : 'Email'} →`}
            </button>
            <div style={{ fontSize: '9px', color: s.dimmer, lineHeight: 1.6 }}>
              {blastChannel === 'instagram' ? 'Only reaches contacts who follow you on Instagram' :
               blastChannel === 'whatsapp' ? 'Opens WhatsApp with pre-filled message for each contact' :
               'Sends personalised email to each contact'}
            </div>
            {/* Blast history */}
            <div style={{ borderTop: `1px solid ${s.border}`, marginTop: '8px', paddingTop: '16px' }}>
              <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadBlastHistory() }}
                style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, cursor: 'pointer', padding: '8px 16px', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font, width: '100%' }}>
                {showHistory ? 'Hide history' : 'Blast history →'}
              </button>
              {showHistory && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {blastHistory.length === 0 && <div style={{ fontSize: '10px', color: s.dimmer }}>No blasts yet</div>}
                  {blastHistory.map((b: any) => (
                    <div key={b.id} style={{ background: 'var(--bg)', border: `1px solid ${s.border}`, padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ fontSize: '10px', color: s.text }}>{b.track_title || 'Untitled'}</div>
                        <div style={{ fontSize: '9px', color: s.dimmer }}>{new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '9px', color: s.dim }}>
                        <span>{b.sent_count}/{b.contact_count} sent</span>
                        {b.totalClicks !== undefined && <span>{b.uniqueOpens} opened</span>}
                        {b.reactionCount > 0 && <span>{b.reactionCount} reactions</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
