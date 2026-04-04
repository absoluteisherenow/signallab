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

      {tab === 'releases' ? <ReleasesTab s={s} mobile={mobile} /> : <DJPromoTab s={s} />}
    </div>
  )
}

// ─── Releases tab ─────────────────────────────────────────────────────────────

function ReleasesTab({ s, mobile }: { s: any; mobile: boolean }) {
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
        <Link href={`/releases/${release.id}/edit`} style={{ fontSize: '9px', color: s.dimmer, textDecoration: 'none', flexShrink: 0 }}>Edit</Link>
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
        <div>
          <Link href={`/releases/${release.id}/campaign`} style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: s.gold, border: `1px solid ${s.gold}40`, padding: '5px 12px', textDecoration: 'none', display: 'inline-block' }}>
            Build campaign →
          </Link>
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

function DJPromoTab({ s }: { s: any }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [blasting, setBlasting] = useState(false)
  const [blastMessage, setBlastMessage] = useState('')
  const [blastUrl, setBlastUrl] = useState('')
  const [blastResult, setBlastResult] = useState<{ sent: number; failed: number; results: any[] } | null>(null)
  const [showBlast, setShowBlast] = useState(false)
  const [filterTier, setFilterTier] = useState('all')
  const [form, setForm] = useState({ name: '', instagram_handle: '', email: '', genre: '', tier: 'standard', notes: '' })

  const inp = `width: 100%; background: var(--panel); border: 1px solid var(--border-dim); color: var(--text); font-family: var(--font-mono); font-size: 11px; padding: 8px 12px; outline: none;`

  useEffect(() => { loadContacts() }, [])

  async function loadContacts() {
    setLoading(true)
    const d = await fetch('/api/contacts').then(r => r.json())
    setContacts(d.contacts || [])
    setLoading(false)
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
    setBlasting(true); setBlastResult(null)
    try {
      const d = await fetch('/api/promo-blast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_ids: Array.from(selected), message: blastMessage, promo_url: blastUrl || null }) }).then(r => r.json())
      setBlastResult(d)
      if (d.ok) { await loadContacts(); setSelected(new Set()); setBlastMessage(''); setBlastUrl('') }
    } finally { setBlasting(false) }
  }

  function toggleSelect(id: string) { setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }
  function selectAll() { const ids = filtered.map(c => c.id); setSelected(prev => prev.size === ids.length ? new Set() : new Set(ids)) }

  const filtered = filterTier === 'all' ? contacts : contacts.filter(c => c.tier === filterTier)

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
        <div style={{ width: '320px', borderLeft: `1px solid ${s.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${s.border}` }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: s.gold }}>Send promo — {selected.size} selected</div>
            <button onClick={() => { setShowBlast(false); setBlastResult(null) }} style={{ background: 'transparent', border: 'none', color: s.dimmer, cursor: 'pointer', fontSize: '16px', fontFamily: s.font }}>×</button>
          </div>
          <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '8px' }}>Private SoundCloud URL</div>
              <input value={blastUrl} onChange={e => setBlastUrl(e.target.value)} placeholder="https://soundcloud.com/..."
                style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${s.borderMid}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '8px' }}>Message</div>
              <textarea value={blastMessage} onChange={e => setBlastMessage(e.target.value)} rows={6}
                placeholder={"hey — new EP out on fabric Records April 17. private link below, would love your support 🖤"}
                style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${s.borderMid}`, color: s.text, fontFamily: s.font, fontSize: '11px', padding: '8px 12px', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
            </div>
            {blastResult && (
              <div style={{ padding: '12px 16px', border: `1px solid ${blastResult.failed === 0 ? 'rgba(61,107,74,0.4)' : `${s.gold}40`}`, background: blastResult.failed === 0 ? 'rgba(61,107,74,0.1)' : `${s.gold}10`, fontSize: '10px' }}>
                <div style={{ color: blastResult.failed === 0 ? '#3d6b4a' : s.gold, marginBottom: '6px' }}>{blastResult.sent} sent · {blastResult.failed} failed</div>
                {blastResult.results?.filter(r => !r.sent).map((r, i) => <div key={i} style={{ fontSize: '9px', color: s.dim }}>× {r.name}: {r.error}</div>)}
              </div>
            )}
            <button onClick={sendBlast} disabled={blasting || !blastMessage || selected.size === 0}
              style={{ background: s.gold, color: '#070706', border: 'none', cursor: 'pointer', padding: '12px 20px', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: s.font, opacity: blasting || !blastMessage || selected.size === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {blasting ? 'Sending...' : 'Send via Instagram DM →'}
            </button>
            <div style={{ fontSize: '9px', color: s.dimmer, lineHeight: 1.6 }}>Only reaches contacts who follow you on Instagram</div>
          </div>
        </div>
      )}
    </div>
  )
}
