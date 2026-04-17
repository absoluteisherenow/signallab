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
  const [searchQuery, setSearchQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [form, setForm] = useState({ name: '', instagram_handle: '', email: '', genre: '', tier: 'standard', notes: '' })

  useEffect(() => { loadContacts() }, [])

  // Load draft from localStorage
  useEffect(() => {
    const draft = localStorage.getItem('nm_blast_draft')
    if (draft) {
      try {
        const d = JSON.parse(draft)
        if (d.message) setBlastMessage(d.message)
        if (d.url) setBlastUrl(d.url)
      } catch {}
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
    const names = contacts.filter(c => selected.has(c.id)).map(c => c.name)
    const preview = names.slice(0, 3).join(', ') + (names.length > 3 ? ` + ${names.length - 3} more` : '')
    if (!window.confirm(`Send DM to ${selected.size} contacts?\n\n${preview}`)) return
    setBlasting(true)
    setBlastResult(null)
    try {
      const d = await fetch('/api/promo-blast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selected), message: blastMessage, promo_url: blastUrl || null }),
      }).then(r => r.json())
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

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function selectAll() {
    const ids = filtered.map(c => c.id)
    setSelected(prev => prev.size === ids.length ? new Set() : new Set(ids))
  }

  const filtered = contacts.filter(c => {
    if (filterTier !== 'all' && c.tier !== filterTier) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return c.name.toLowerCase().includes(q) || (c.instagram_handle || '').toLowerCase().includes(q) || (c.genre || '').toLowerCase().includes(q)
    }
    return true
  })
  const input = "w-full bg-[#1d1d1d] border border-white/7 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors placeholder-[#4a4845]"

  return (
    <div className="min-h-screen bg-[#050505] text-[#f2f2f2] font-mono flex flex-col">
      <SignalLabHeader right={
        <a href="/releases" style={{
          display: 'inline-flex', alignItems: 'center', height: '32px', padding: '0 16px',
          background: 'transparent', color: '#6a6862',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: '2px',
          fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", textDecoration: 'none',
        }}>Release planner →</a>
      } />

      <div className="flex flex-1 h-[calc(100vh-52px)]">

        {/* Contacts list */}
        <div className="flex-1 overflow-y-auto p-8">

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-5">
              <div className="text-[10px] tracking-[.22em] uppercase text-[#ff2a1a]">
                DJ / Promoter contacts
              </div>
              <div className="flex gap-1.5">
                {(['all', ...TIERS] as const).map(t => (
                  <button key={t} onClick={() => setFilterTier(t)}
                    className={`text-[9px] tracking-[.12em] uppercase px-2.5 py-1 border transition-colors ${filterTier === t ? 'border-[#ff2a1a]/50 text-[#ff2a1a]' : 'border-white/10 text-[#6a6862] hover:border-white/20'}`}>
                    {t}
                  </button>
                ))}
              </div>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                className="bg-transparent border border-white/10 text-[#f2f2f2] font-mono text-[10px] px-3 py-1.5 outline-none focus:border-[#ff2a1a]/50 transition-colors placeholder-[#4a4845] w-40"
              />
            </div>
            <div className="flex items-center gap-3">
              {selected.size > 0 && (
                <button onClick={() => setShowBlast(true)}
                  className="text-[10px] tracking-[.16em] uppercase bg-[#ff2a1a] text-[#050505] px-5 py-2 hover:bg-[#ff2a1a] transition-colors">
                  Send promo to {selected.size} →
                </button>
              )}
              <button onClick={() => setAdding(true)}
                className="text-[9px] tracking-[.16em] uppercase text-[#6a6862] hover:text-[#ff2a1a] border border-white/10 px-3 py-2 transition-colors">
                + Add contact
              </button>
              <label className="text-[9px] tracking-[.16em] uppercase text-[#6a6862] hover:text-[#ff2a1a] border border-white/10 px-3 py-2 transition-colors cursor-pointer">
                {importing ? 'Importing...' : '↑ Import CSV'}
                <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
              </label>
            </div>
          </div>

          {/* Add form */}
          {adding && (
            <div className="bg-[#0e0e0e] border border-white/7 p-6 mb-5">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Name', key: 'name', placeholder: 'DJ Name', required: true },
                  { label: 'Instagram handle', key: 'instagram_handle', placeholder: '@handle' },
                  { label: 'Email', key: 'email', placeholder: 'dj@email.com' },
                  { label: 'Genre', key: 'genre', placeholder: 'Techno / House / Electronica' },
                  { label: 'Notes', key: 'notes', placeholder: 'Fabric resident, supports our stuff...' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-[9px] tracking-[.18em] uppercase text-[#6a6862] mb-2">{f.label}</label>
                    <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder} className={input} />
                  </div>
                ))}
                <div>
                  <label className="block text-[9px] tracking-[.18em] uppercase text-[#6a6862] mb-2">Tier</label>
                  <select value={form.tier} onChange={e => setForm(p => ({ ...p, tier: e.target.value }))} className={input}>
                    {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={addContact} disabled={saving || !form.name}
                  className="text-[10px] tracking-[.16em] uppercase bg-[#ff2a1a] text-[#050505] px-5 py-2 hover:bg-[#ff2a1a] disabled:opacity-40 transition-colors flex items-center gap-2">
                  {saving && <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Saving...' : 'Add →'}
                </button>
                <button onClick={() => setAdding(false)}
                  className="text-[10px] tracking-[.16em] uppercase border border-white/13 text-[#6a6862] px-5 py-2 hover:border-white/25 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full bg-[#ff2a1a] animate-pulse" style={{ animationDelay: `${i*0.2}s` }} />)}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="border border-dashed border-white/10 p-16 text-center">
              <div className="text-[11px] text-[#6a6862] mb-4">No contacts yet</div>
              <div className="text-[10px] text-[#5a5850] mb-5">Add DJs, promoters and labels you want to send promos to</div>
              <button onClick={() => setAdding(true)} className="text-[9px] tracking-[.18em] uppercase text-[#ff2a1a]">Add first contact →</button>
            </div>
          ) : (
            <div className="border border-white/7">
              <div className="grid grid-cols-6 px-4 py-2.5 bg-white/3 border-b border-white/7">
                <div className="flex items-center gap-2.5 col-span-2">
                  <button onClick={selectAll}
                    className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center transition-colors ${selected.size === filtered.length && filtered.length > 0 ? 'border-[#ff2a1a] bg-[#ff2a1a]' : 'border-white/20 hover:border-white/40'}`}>
                    {selected.size === filtered.length && filtered.length > 0 && <div className="w-1.5 h-1.5 bg-[#050505]" />}
                  </button>
                  <span className="text-[8px] tracking-[.2em] uppercase text-[#6a6862]">Name</span>
                </div>
                {['Instagram', 'Genre', 'Tier', 'Last promo', ''].map((h, i) => (
                  <div key={i} className="text-[8px] tracking-[.2em] uppercase text-[#6a6862]">{h}</div>
                ))}
              </div>
              {filtered.map(c => (
                <div key={c.id}
                  className={`grid grid-cols-6 px-4 py-3.5 border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors group ${selected.has(c.id) ? 'bg-[#ff2a1a]/5' : ''}`}>
                  <div className="flex items-center gap-2.5 col-span-2">
                    <button onClick={() => toggleSelect(c.id)}
                      className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center transition-colors ${selected.has(c.id) ? 'border-[#ff2a1a] bg-[#ff2a1a]' : 'border-white/20 hover:border-white/40'}`}>
                      {selected.has(c.id) && <div className="w-1.5 h-1.5 bg-[#050505]" />}
                    </button>
                    <div>
                      <div className="text-[11px] tracking-[.04em]">{c.name}</div>
                      {c.notes && <div className="text-[9px] text-[#5a5850] truncate max-w-[150px]">{c.notes}</div>}
                    </div>
                  </div>
                  <div className="text-[10px] text-[#909090] flex items-center">{c.instagram_handle ? `@${c.instagram_handle}` : '—'}</div>
                  <div className="text-[10px] text-[#909090] flex items-center">{c.genre || '—'}</div>
                  <div className="flex items-center">
                    <span className={`text-[8px] tracking-[.12em] uppercase px-1.5 py-0.5 ${c.tier === 'priority' ? 'text-[#ff2a1a] bg-[#ff2a1a]/10' : c.tier === 'new' ? 'text-[#3d6b4a] bg-[#3d6b4a]/10' : 'text-[#6a6862] bg-white/5'}`}>
                      {c.tier}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-[#6a6862]">
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
              <div className="text-[9px] tracking-[.22em] uppercase text-[#ff2a1a]">Send promo — {selected.size} selected</div>
              <button onClick={() => { setShowBlast(false); setBlastResult(null) }} className="text-[#6a6862] hover:text-white/60 text-sm">×</button>
            </div>
            <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
              <div>
                <label className="block text-[9px] tracking-[.18em] uppercase text-[#6a6862] mb-2">Private SoundCloud URL</label>
                <input value={blastUrl} onChange={e => setBlastUrl(e.target.value)}
                  placeholder="https://soundcloud.com/..."
                  className="w-full bg-[#1d1d1d] border border-white/7 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors placeholder-[#4a4845]" />
              </div>
              <div>
                <label className="block text-[9px] tracking-[.18em] uppercase text-[#6a6862] mb-2">Message</label>
                <textarea value={blastMessage} onChange={e => setBlastMessage(e.target.value)} rows={6}
                  placeholder={"hey — new EP out on fabric Records April 17. private link below, would love your support 🖤"}
                  className="w-full bg-[#1d1d1d] border border-white/7 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors placeholder-[#4a4845] resize-none" />
                <div className="text-right text-[9px] text-[#5a5850] mt-1">
                  <span className={blastMessage.length > 1000 ? 'text-red-400' : ''}>{blastMessage.length}</span>/1000
                </div>
              </div>

              {blastResult && blastResult.failed > 0 && (
                <button onClick={() => {
                  const failedIds = contacts.filter(c =>
                    blastResult.results?.some(r => !r.sent && (r.handle === c.instagram_handle || r.name === c.name))
                  ).map(c => c.id)
                  setSelected(new Set(failedIds))
                }}
                  className="text-[9px] tracking-[.16em] uppercase text-[#ff2a1a] border border-[#ff2a1a]/30 px-4 py-2 hover:border-[#ff2a1a]/60 transition-colors">
                  Select {blastResult.failed} failed to retry →
                </button>
              )}

              {blastResult && (
                <div className={`p-4 border text-[10px] leading-relaxed ${blastResult.failed === 0 ? 'bg-[#3d6b4a]/10 border-[#3d6b4a]/30 text-[#3d6b4a]' : 'bg-[#ff2a1a]/10 border-[#ff2a1a]/30 text-[#ff2a1a]'}`}>
                  <div className="mb-2 font-medium">{blastResult.sent} sent · {blastResult.failed} failed</div>
                  {blastResult.results?.filter(r => !r.sent).map((r, i) => (
                    <div key={i} className="text-[9px] text-[#909090]">× {r.name}: {r.error}</div>
                  ))}
                </div>
              )}

              <button onClick={sendBlast} disabled={blasting || !blastMessage || selected.size === 0}
                className="text-[10px] tracking-[.18em] uppercase bg-[#ff2a1a] text-[#050505] px-5 py-3 hover:bg-[#ff2a1a] disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {blasting && <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />}
                {blasting ? 'Sending...' : 'Send via Instagram DM →'}
              </button>
              <div className="text-[9px] text-[#5a5850] leading-relaxed">Only reaches contacts who follow you on Instagram</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
