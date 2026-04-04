'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMobile } from '@/hooks/useMobile'

type Release = {
  id: string; title: string; artist?: string; type: string
  release_date: string; label?: string; streaming_url?: string; artwork_url?: string; notes?: string; created_at: string
}

interface Contact {
  id: string; name: string; instagram_handle: string | null; email: string | null
  genre: string | null; tier: string; notes: string | null; last_sent_at: string | null; total_promos_sent: number
}

const TYPE_LABELS: Record<string, string> = { single: 'Single', ep: 'EP', album: 'Album', remix: 'Remix', compilation: 'Compilation' }
const TIERS = ['priority', 'standard', 'new']

export default function DropLabPage() {
  const mobile = useMobile()
  const [tab, setTab] = useState<'releases' | 'promo'>('releases')
  const [initialPromoUrl, setInitialPromoUrl] = useState('')

  const s = {
    bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border-dim)', borderMid: 'var(--border)',
    gold: 'var(--gold)', goldBright: 'var(--gold-bright)', text: 'var(--text)', dim: 'var(--text-dim)', dimmer: 'var(--text-dimmer)',
    font: 'var(--font-mono)',
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: mobile ? '20px 16px 0' : '40px 48px 0', borderBottom: `1px solid ${s.border}` }}>
        <div style={{ display: 'flex', alignItems: mobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', flexDirection: mobile ? 'column' : 'row', gap: mobile ? '16px' : '0', paddingBottom: '0', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />Drop Lab
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(36px, 4vw, 56px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {tab === 'releases' ? 'Your catalogue' : 'DJ Promo'}
            </div>
          </div>
          {tab === 'releases' && (
            <Link href="/releases/new" style={{ background: s.gold, color: '#070706', textDecoration: 'none', padding: '0 24px', height: '36px', display: 'inline-flex', alignItems: 'center', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: mobile ? '0' : '4px' }}>
              + New release
            </Link>
          )}
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0' }}>
          {(['releases', 'promo'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: s.font,
              color: tab === t ? s.gold : s.dimmer,
              borderBottom: tab === t ? `1px solid ${s.gold}` : '1px solid transparent',
              marginBottom: '-1px',
            }}>
              {t === 'releases' ? 'Releases' : 'DJ Promo'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'releases' ? <ReleasesTab s={s} mobile={mobile} onSendPromo={(url) => { setInitialPromoUrl(url); setTab('promo') }} /> : <DJPromoTab s={s} initialUrl={initialPromoUrl} onUrlConsumed={() => setInitialPromoUrl('')} />}
    </div>
  )
}

// ─── Releases tab ─────────────────────────────────────────────────────────────

function ReleasesTab({ s, mobile, onSendPromo }: { s: any; mobile: boolean; onSendPromo: (url: string) => void }) {
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/releases').then(r => r.json()).then(d => { setReleases(d.releases || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const now = new Date()
  const upcoming = releases.filter(r => new Date(r.release_date) >= now).sort((a, b) => a.release_date.localeCompare(b.release_date))
  const past = releases.filter(r => new Date(r.release_date) < now).sort((a, b) => b.release_date.localeCompare(a.release_date))

  function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }

  function ReleaseRow({ release }: { release: Release }) {
    const isPast = new Date(release.release_date) < now
    if (mobile) return (
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
          {release.artwork_url && <img src={release.artwork_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', color: s.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{release.title}</div>
            <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '2px' }}>{release.artist && `${release.artist} · `}{TYPE_LABELS[release.type] || release.type} · {formatDate(release.release_date)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          {release.streaming_url && (
            <button onClick={() => onSendPromo(release.streaming_url!)} style={{ fontSize: '9px', color: s.gold, background: 'transparent', border: `1px solid ${s.gold}40`, padding: '4px 10px', fontFamily: s.font, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Promo →
            </button>
          )}
          <Link href={`/releases/${release.id}/edit`} style={{ fontSize: '9px', color: s.dimmer, textDecoration: 'none', flexShrink: 0 }}>Edit</Link>
        </div>
      </div>
    )
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 120px 1fr auto', alignItems: 'center', gap: '16px', padding: '18px 24px', borderBottom: `1px solid ${s.border}` }}>
        <div style={{ fontSize: '12px', color: isPast ? s.dimmer : s.text, fontVariantNumeric: 'tabular-nums' }}>{formatDate(release.release_date)}</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {release.artwork_url && <img src={release.artwork_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }} />}
          <div>
            <div style={{ fontSize: '14px', color: s.text }}>{release.title}</div>
            <div style={{ fontSize: '10px', color: s.dimmer, marginTop: '3px', display: 'flex', gap: '8px' }}>
              {release.artist && <span>{release.artist}</span>}
              {release.artist && release.label && <span style={{ color: s.border }}>·</span>}
              {release.label && <span>{release.label}</span>}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.gold, background: `${s.gold}18`, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', width: 'fit-content' }}>
          {TYPE_LABELS[release.type] || release.type}
        </div>
        <div>
          {release.streaming_url ? (
            <a href={release.streaming_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: isPast ? s.goldBright : s.dimmer, textDecoration: 'none', letterSpacing: '0.1em' }}>
              {isPast ? '→ Stream / Buy' : '→ Private preview'}
            </a>
          ) : <span style={{ fontSize: '10px', color: s.dimmer }}>{isPast ? 'No link' : '—'}</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link href={`/releases/${release.id}/campaign`} style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.gold, border: `1px solid ${s.gold}40`, padding: '5px 12px', textDecoration: 'none', display: 'inline-block' }}>
            Build campaign →
          </Link>
          {release.streaming_url && (
            <button onClick={() => onSendPromo(release.streaming_url!)} style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dim, border: `1px solid ${s.border}`, padding: '5px 12px', background: 'transparent', fontFamily: s.font, cursor: 'pointer' }}>
              Send promo →
            </button>
          )}
        </div>
        <div>
          <Link href={`/releases/${release.id}/edit`} style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: s.dimmer, textDecoration: 'none', padding: '5px 8px' }}>Edit</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: mobile ? '16px' : '32px 48px' }}>
      {loading && <div style={{ color: s.dimmer, fontSize: '12px', padding: '40px 0' }}>Loading…</div>}
      {!loading && releases.length === 0 && (
        <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '48px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: s.dim, marginBottom: '16px' }}>No releases yet</div>
          <Link href="/releases/new" style={{ background: s.gold, color: '#070706', textDecoration: 'none', padding: '0 28px', height: '40px', display: 'inline-flex', alignItems: 'center', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            + Add your first release
          </Link>
        </div>
      )}
      {!loading && upcoming.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Upcoming</div>
          <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
            {!mobile && (
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 120px 1fr auto', gap: '16px', padding: '12px 24px', borderBottom: `1px solid ${s.borderMid}`, fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase' }}>
                <div>Date</div><div>Title</div><div>Type</div><div>Links</div><div>Campaign</div><div></div>
              </div>
            )}
            {upcoming.map(r => <ReleaseRow key={r.id} release={r} />)}
          </div>
        </div>
      )}
      {!loading && past.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '16px' }}>Past releases</div>
          <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
            {!mobile && (
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 120px 1fr auto', gap: '16px', padding: '12px 24px', borderBottom: `1px solid ${s.borderMid}`, fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase' }}>
                <div>Date</div><div>Title</div><div>Type</div><div>Links</div><div>Campaign</div><div></div>
              </div>
            )}
            {past.map(r => <ReleaseRow key={r.id} release={r} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DJ Promo tab ─────────────────────────────────────────────────────────────

interface TrackMeta { title: string | null; author: string | null; description: string | null; artwork: string | null }

function DJPromoTab({ s, initialUrl, onUrlConsumed }: { s: any; initialUrl?: string; onUrlConsumed?: () => void }) {
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
  const [form, setForm] = useState({ name: '', instagram_handle: '', email: '', genre: '', tier: 'standard', notes: '' })
  const [trackMeta, setTrackMeta] = useState<TrackMeta | null>(null)
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [writingPromo, setWritingPromo] = useState(false)
  const [blastHistory, setBlastHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [reactions, setReactions] = useState<Record<string, string>>({})

  const inp = `width: 100%; background: var(--panel); border: 1px solid var(--border-dim); color: var(--text); font-family: var(--font-mono); font-size: 11px; padding: 8px 12px; outline: none;`

  useEffect(() => { loadContacts() }, [])

  // Pre-fill URL when coming from a release row
  useEffect(() => {
    if (initialUrl) {
      setBlastUrl(initialUrl)
      setShowBlast(true)
      onUrlConsumed?.()
    }
  }, [initialUrl])

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
      const d = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).then(r => r.json())
      if (d.contact) { setContacts(prev => [...prev, d.contact].sort((a, b) => a.name.localeCompare(b.name))); setAdding(false); setForm({ name: '', instagram_handle: '', email: '', genre: '', tier: 'standard', notes: '' }) }
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
    const names = contacts.filter(c => selected.has(c.id)).map(c => c.name)
    const preview = names.slice(0, 3).join(', ') + (names.length > 3 ? ` + ${names.length - 3} more` : '')
    if (!window.confirm(`Send DM to ${selected.size} contacts?\n\n${preview}`)) return
    setBlasting(true); setBlastResult(null)
    try {
      const d = await fetch('/api/promo-blast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_ids: Array.from(selected), message: blastMessage, promo_url: blastUrl || null, track_title: trackMeta?.title || null, track_artist: trackMeta?.author || null }) }).then(r => r.json())
      setBlastResult(d)
      if (d.ok) { await loadContacts(); setSelected(new Set()); setBlastMessage(''); setBlastUrl(''); localStorage.removeItem('nm_blast_draft') }
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
            {selected.size > 0 && (
              <button onClick={() => setShowBlast(true)} style={{ background: s.gold, color: '#070706', border: 'none', cursor: 'pointer', padding: '0 20px', height: '32px', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font }}>
                Send promo to {selected.size} →
              </button>
            )}
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
              <button onClick={addContact} disabled={saving || !form.name} style={{ background: s.gold, color: '#070706', border: 'none', cursor: 'pointer', padding: '0 20px', height: '34px', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: s.font, opacity: saving || !form.name ? 0.4 : 1 }}>
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
                {selected.size === filtered.length && filtered.length > 0 && <div style={{ width: '6px', height: '6px', background: '#070706' }} />}
              </button>
              <div>Name</div><div>Instagram</div><div>Genre</div><div>Tier</div><div>Last promo</div><div />
            </div>
            {filtered.map(c => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 140px 120px 80px 100px 20px', gap: '16px', padding: '14px 20px', borderBottom: `1px solid ${s.border}`, alignItems: 'center', background: selected.has(c.id) ? `${s.gold}08` : 'transparent' }}
                onMouseEnter={e => { if (!selected.has(c.id)) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected.has(c.id) ? `${s.gold}08` : 'transparent' }}>
                <button onClick={() => toggleSelect(c.id)} style={{ width: '14px', height: '14px', border: `1px solid ${selected.has(c.id) ? s.gold : s.border}`, background: selected.has(c.id) ? s.gold : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected.has(c.id) && <div style={{ width: '6px', height: '6px', background: '#070706' }} />}
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
              <input value={blastUrl} onChange={e => { setBlastUrl(e.target.value); setTrackMeta(null) }} placeholder="https://soundcloud.com/..."
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
            <button onClick={sendBlast} disabled={blasting || !blastMessage || selected.size === 0}
              style={{ background: s.gold, color: '#070706', border: 'none', cursor: 'pointer', padding: '12px 20px', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: s.font, opacity: blasting || !blastMessage || selected.size === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {blasting ? 'Sending...' : 'Send via Instagram DM →'}
            </button>
            <div style={{ fontSize: '9px', color: s.dimmer, lineHeight: 1.6 }}>Only reaches contacts who follow you on Instagram</div>
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
