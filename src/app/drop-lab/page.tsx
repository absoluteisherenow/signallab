'use client'

import { useState, useEffect } from 'react'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'

interface Contact {
  id: string
  name: string
  instagram_handle: string | null
  email: string | null
  genre: string | null
  tier: string
  notes: string | null
  last_sent_at: string | null
  total_promos_sent: number
}

const TIERS = ['priority', 'standard', 'new']

export default function DropLab() {
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
  const [filterTier, setFilterTier] = useState<string>('all')
  const [form, setForm] = useState({ name: '', instagram_handle: '', email: '', genre: '', tier: 'standard', notes: '' })

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
      const d = await fetch('/api/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then(r => r.json())
      if (d.contact) {
        setContacts(prev => [...prev, d.contact].sort((a, b) => a.name.localeCompare(b.name)))
        setAdding(false)
        setForm({ name: '', instagram_handle: '', email: '', genre: '', tier: 'standard', notes: '' })
      }
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
    setBlasting(true)
    setBlastResult(null)
    try {
      const d = await fetch('/api/promo-blast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selected), message: blastMessage, promo_url: blastUrl || null }),
      }).then(r => r.json())
      setBlastResult(d)
      if (d.ok) { await loadContacts(); setSelected(new Set()); setBlastMessage(''); setBlastUrl('') }
    } finally { setBlasting(false) }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function selectAll() {
    const ids = filtered.map(c => c.id)
    setSelected(prev => prev.size === ids.length ? new Set() : new Set(ids))
  }

  const filtered = filterTier === 'all' ? contacts : contacts.filter(c => c.tier === filterTier)
  const input = "w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors placeholder-[#2e2c29]"

  return (
    <div className="min-h-screen bg-[#070706] text-[#f0ebe2] font-mono flex flex-col">
      <SignalLabHeader right={
        <a href="/releases" style={{
          display: 'inline-flex', alignItems: 'center', height: '32px', padding: '0 16px',
          background: 'transparent', color: '#52504c',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: '2px',
          fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase',
          fontFamily: "'DM Mono', monospace", textDecoration: 'none',
        }}>Release planner →</a>
      } />

      <div className="flex flex-1 h-[calc(100vh-52px)]">

        {/* Contacts list */}
        <div className="flex-1 overflow-y-auto p-8">

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-5">
              <div className="text-[10px] tracking-[.22em] uppercase text-[#b08d57]">
                DJ / Promoter contacts
              </div>
              <div className="flex gap-1.5">
                {(['all', ...TIERS] as const).map(t => (
                  <button key={t} onClick={() => setFilterTier(t)}
                    className={`text-[9px] tracking-[.12em] uppercase px-2.5 py-1 border transition-colors ${filterTier === t ? 'border-[#b08d57]/50 text-[#b08d57]' : 'border-white/10 text-[#52504c] hover:border-white/20'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {selected.size > 0 && (
                <button onClick={() => setShowBlast(true)}
                  className="text-[10px] tracking-[.16em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2 hover:bg-[#c9a46e] transition-colors">
                  Send promo to {selected.size} →
                </button>
              )}
              <button onClick={() => setAdding(true)}
                className="text-[9px] tracking-[.16em] uppercase text-[#52504c] hover:text-[#b08d57] border border-white/10 px-3 py-2 transition-colors">
                + Add contact
              </button>
            </div>
          </div>

          {/* Add form */}
          {adding && (
            <div className="bg-[#0e0d0b] border border-white/7 p-6 mb-5">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Name', key: 'name', placeholder: 'DJ Name', required: true },
                  { label: 'Instagram handle', key: 'instagram_handle', placeholder: '@handle' },
                  { label: 'Email', key: 'email', placeholder: 'dj@email.com' },
                  { label: 'Genre', key: 'genre', placeholder: 'Techno / House / Electronica' },
                  { label: 'Notes', key: 'notes', placeholder: 'Fabric resident, supports our stuff...' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-2">{f.label}</label>
                    <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder} className={input} />
                  </div>
                ))}
                <div>
                  <label className="block text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-2">Tier</label>
                  <select value={form.tier} onChange={e => setForm(p => ({ ...p, tier: e.target.value }))} className={input}>
                    {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={addContact} disabled={saving || !form.name}
                  className="text-[10px] tracking-[.16em] uppercase bg-[#b08d57] text-[#070706] px-5 py-2 hover:bg-[#c9a46e] disabled:opacity-40 transition-colors flex items-center gap-2">
                  {saving && <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : 'Add →'}
                </button>
                <button onClick={() => setAdding(false)}
                  className="text-[10px] tracking-[.16em] uppercase border border-white/13 text-[#52504c] px-5 py-2 hover:border-white/25 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full bg-[#b08d57] animate-pulse" style={{ animationDelay: `${i*0.2}s` }} />)}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="border border-dashed border-white/10 p-16 text-center">
              <div className="text-[11px] text-[#52504c] mb-4">No contacts yet</div>
              <div className="text-[10px] text-[#3a3830] mb-5">Add DJs, promoters and labels you want to send promos to</div>
              <button onClick={() => setAdding(true)} className="text-[9px] tracking-[.18em] uppercase text-[#b08d57]">Add first contact →</button>
            </div>
          ) : (
            <div className="border border-white/7">
              <div className="grid grid-cols-6 px-4 py-2.5 bg-white/3 border-b border-white/7">
                <div className="flex items-center gap-2.5 col-span-2">
                  <button onClick={selectAll}
                    className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center transition-colors ${selected.size === filtered.length && filtered.length > 0 ? 'border-[#b08d57] bg-[#b08d57]' : 'border-white/20 hover:border-white/40'}`}>
                    {selected.size === filtered.length && filtered.length > 0 && <div className="w-1.5 h-1.5 bg-[#070706]" />}
                  </button>
                  <span className="text-[8px] tracking-[.2em] uppercase text-[#52504c]">Name</span>
                </div>
                {['Instagram', 'Genre', 'Tier', 'Last promo', ''].map((h, i) => (
                  <div key={i} className="text-[8px] tracking-[.2em] uppercase text-[#52504c]">{h}</div>
                ))}
              </div>
              {filtered.map(c => (
                <div key={c.id}
                  className={`grid grid-cols-6 px-4 py-3.5 border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors group ${selected.has(c.id) ? 'bg-[#b08d57]/5' : ''}`}>
                  <div className="flex items-center gap-2.5 col-span-2">
                    <button onClick={() => toggleSelect(c.id)}
                      className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center transition-colors ${selected.has(c.id) ? 'border-[#b08d57] bg-[#b08d57]' : 'border-white/20 hover:border-white/40'}`}>
                      {selected.has(c.id) && <div className="w-1.5 h-1.5 bg-[#070706]" />}
                    </button>
                    <div>
                      <div className="text-[11px] tracking-[.04em]">{c.name}</div>
                      {c.notes && <div className="text-[9px] text-[#3a3830] truncate max-w-[150px]">{c.notes}</div>}
                    </div>
                  </div>
                  <div className="text-[10px] text-[#8a8780] flex items-center">{c.instagram_handle ? `@${c.instagram_handle}` : '—'}</div>
                  <div className="text-[10px] text-[#8a8780] flex items-center">{c.genre || '—'}</div>
                  <div className="flex items-center">
                    <span className={`text-[8px] tracking-[.12em] uppercase px-1.5 py-0.5 ${c.tier === 'priority' ? 'text-[#b08d57] bg-[#b08d57]/10' : c.tier === 'new' ? 'text-[#3d6b4a] bg-[#3d6b4a]/10' : 'text-[#52504c] bg-white/5'}`}>
                      {c.tier}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-[#52504c]">
                      {c.last_sent_at ? new Date(c.last_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                    </span>
                    <button onClick={() => removeContact(c.id)}
                      className="text-red-400/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs px-1">×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Blast panel — slides in when contacts selected */}
        {showBlast && (
          <div className="w-80 border-l border-white/7 flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/7">
              <div className="text-[9px] tracking-[.22em] uppercase text-[#b08d57]">Send promo — {selected.size} selected</div>
              <button onClick={() => { setShowBlast(false); setBlastResult(null) }} className="text-[#52504c] hover:text-white/60 text-sm">×</button>
            </div>
            <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
              <div>
                <label className="block text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-2">Private SoundCloud URL</label>
                <input value={blastUrl} onChange={e => setBlastUrl(e.target.value)}
                  placeholder="https://soundcloud.com/..."
                  className="w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors placeholder-[#2e2c29]" />
              </div>
              <div>
                <label className="block text-[9px] tracking-[.18em] uppercase text-[#52504c] mb-2">Message</label>
                <textarea value={blastMessage} onChange={e => setBlastMessage(e.target.value)} rows={6}
                  placeholder={"hey — new EP out on fabric Records April 17. private link below, would love your support 🖤"}
                  className="w-full bg-[#1a1917] border border-white/7 text-[#f0ebe2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#b08d57] transition-colors placeholder-[#2e2c29] resize-none" />
              </div>

              {blastResult && (
                <div className={`p-4 border text-[10px] leading-relaxed ${blastResult.failed === 0 ? 'bg-[#3d6b4a]/10 border-[#3d6b4a]/30 text-[#3d6b4a]' : 'bg-[#b08d57]/10 border-[#b08d57]/30 text-[#b08d57]'}`}>
                  <div className="mb-2 font-medium">{blastResult.sent} sent · {blastResult.failed} failed</div>
                  {blastResult.results?.filter(r => !r.sent).map((r, i) => (
                    <div key={i} className="text-[9px] text-[#8a8780]">× {r.name}: {r.error}</div>
                  ))}
                </div>
              )}

              <button onClick={sendBlast} disabled={blasting || !blastMessage || selected.size === 0}
                className="text-[10px] tracking-[.18em] uppercase bg-[#b08d57] text-[#070706] px-5 py-3 hover:bg-[#c9a46e] disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {blasting && <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />}
                {blasting ? 'Sending...' : 'Send via Instagram DM →'}
              </button>
              <div className="text-[9px] text-[#3a3830] leading-relaxed">Only reaches contacts who follow you on Instagram</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
