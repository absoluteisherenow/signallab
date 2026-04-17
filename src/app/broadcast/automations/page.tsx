'use client'

import { useState, useEffect } from 'react'
import { SignalLabHeader } from '@/components/broadcast/SignalLabHeader'

interface Automation {
  id: string
  campaign_name: string
  campaign_slug: string
  trigger_keyword: string
  dm_message: string
  platform_post_id: string | null
  follow_required: boolean
  reward_type: string
  reward_url: string | null
  claim_url: string
  enabled: boolean
  sent_count: number
  lead_count: number
  created_at: string
}

interface Lead {
  id: string
  username: string | null
  email: string | null
  follower_count: number | null
  biography: string | null
  comment_text: string | null
  triggered_at: string
  dm_sent: boolean
  campaign_name: string | null
}

const REWARD_TYPES = ['stream', 'buy', 'download', 'discount', 'tickets', 'presave', 'other']

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Create form state
  const [form, setForm] = useState({
    campaign_name: '',
    trigger_keyword: '',
    dm_message: '',
    platform_post_id: '',
    follow_required: false,
    reward_type: 'download',
    reward_url: '',
  })

  useEffect(() => { loadAutomations() }, [])

  async function loadAutomations() {
    setLoading(true)
    try {
      const res = await fetch('/api/social/instagram/dm')
      const d = await res.json()
      setAutomations(d.automations || [])
    } finally {
      setLoading(false)
    }
  }

  async function loadLeads(automationId: string) {
    setLoadingLeads(true)
    setSelectedId(automationId)
    try {
      const res = await fetch(`/api/leads?automation_id=${automationId}`)
      const d = await res.json()
      setLeads(d.leads || [])
    } finally {
      setLoadingLeads(false)
    }
  }

  async function createAutomation() {
    if (!form.campaign_name || !form.dm_message) return
    setSaving(true)
    try {
      const res = await fetch('/api/social/instagram/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: form.campaign_name,
          trigger_keyword: form.trigger_keyword,
          dm_message: form.dm_message,
          platform_post_id: form.platform_post_id || null,
          follow_required: form.follow_required,
          reward_type: form.reward_type,
          reward_url: form.reward_url || null,
        }),
      })
      const d = await res.json()
      if (d.automation) {
        await loadAutomations()
        setCreating(false)
        setForm({ campaign_name: '', trigger_keyword: '', dm_message: '', platform_post_id: '', follow_required: false, reward_type: 'download', reward_url: '' })
        setSelectedId(d.automation.id)
        setLeads([])
      }
    } finally {
      setSaving(false)
    }
  }

  async function toggleAutomation(id: string, enabled: boolean) {
    await fetch('/api/social/instagram/dm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    })
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled } : a))
  }

  async function deleteAutomation(id: string) {
    if (!window.confirm('Delete this campaign? Leads will be kept.')) return
    await fetch('/api/social/instagram/dm', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setAutomations(prev => prev.filter(a => a.id !== id))
    if (selectedId === id) { setSelectedId(null); setLeads([]) }
  }

  function copyLink(url: string, id: string) {
    navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function exportCSV() {
    if (!leads.length) return
    const headers = ['username', 'email', 'follower_count', 'campaign', 'comment', 'triggered_at']
    const rows = leads.map(l => [
      l.username || '',
      l.email || '',
      l.follower_count || '',
      l.campaign_name || '',
      (l.comment_text || '').replace(/,/g, ' '),
      l.triggered_at ? new Date(l.triggered_at).toLocaleDateString('en-GB') : '',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${selectedId?.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectedAuto = automations.find(a => a.id === selectedId)

  return (
    <div className="min-h-screen bg-[#050505] text-[#f2f2f2] font-mono">
      <SignalLabHeader />

      <div className="flex h-[calc(100vh-52px)]">

        {/* LEFT: Automations list */}
        <div className="w-80 border-r border-white/7 flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/7">
            <div className="text-[9px] tracking-[.25em] uppercase text-[#ff2a1a]">Campaigns</div>
            <button onClick={() => setCreating(true)}
              className="text-[9px] tracking-[.16em] uppercase text-[#909090] hover:text-[#ff2a1a] transition-colors">
              + New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-24">
                <div className="flex gap-1">
                  {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full bg-[#ff2a1a] animate-pulse" style={{ animationDelay: `${i*0.2}s` }} />)}
                </div>
              </div>
            ) : automations.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <div className="text-[10px] tracking-[.08em] text-[#909090] mb-3">No campaigns yet</div>
                <button onClick={() => setCreating(true)} className="text-[9px] tracking-[.16em] uppercase text-[#ff2a1a] hover:opacity-70 transition-opacity">
                  Create your first →
                </button>
              </div>
            ) : automations.map(a => (
              <div key={a.id}
                onClick={() => loadLeads(a.id)}
                className={`px-5 py-4 border-b border-white/5 cursor-pointer hover:bg-white/3 transition-colors ${selectedId === a.id ? 'bg-white/5 border-l-2 border-l-[#ff2a1a]' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="text-[11px] tracking-[.05em] leading-snug flex-1">{a.campaign_name}</div>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${a.enabled ? 'bg-[#3d6b4a]' : 'bg-[#3a3830]'}`} />
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  {a.trigger_keyword && (
                    <span className="text-[9px] tracking-[.1em] text-[#909090] bg-white/5 px-1.5 py-0.5">"{a.trigger_keyword}"</span>
                  )}
                  <span className="text-[9px] tracking-[.06em] text-[#909090]">{a.sent_count || 0} sent · {a.lead_count || 0} leads</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail panel */}
        <div className="flex-1 overflow-y-auto">

          {/* Create form */}
          {creating && (
            <div className="p-8 border-b border-white/7">
              <div className="flex items-center justify-between mb-6">
                <div className="text-[10px] tracking-[.22em] uppercase text-[#ff2a1a]">New campaign</div>
                <button onClick={() => setCreating(false)} className="text-[#909090] hover:text-[#909090] transition-colors text-sm">×</button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-[9px] tracking-[.2em] uppercase text-[#909090] mb-2">Campaign name</label>
                  <input value={form.campaign_name} onChange={e => setForm(p => ({ ...p, campaign_name: e.target.value }))}
                    placeholder="EP Launch — Free Download"
                    className="w-full bg-[#0e0e0e] border border-white/10 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors placeholder-[#222222]" />
                </div>
                <div>
                  <label className="block text-[9px] tracking-[.2em] uppercase text-[#909090] mb-2">
                    Trigger keyword <span className="text-[#222222] normal-case">leave blank = any comment</span>
                  </label>
                  <input value={form.trigger_keyword} onChange={e => setForm(p => ({ ...p, trigger_keyword: e.target.value }))}
                    placeholder="send / free / download"
                    className="w-full bg-[#0e0e0e] border border-white/10 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors placeholder-[#222222]" />
                </div>
                <div>
                  <label className="block text-[9px] tracking-[.2em] uppercase text-[#909090] mb-2">Reward type</label>
                  <select value={form.reward_type} onChange={e => setForm(p => ({ ...p, reward_type: e.target.value }))}
                    className="w-full bg-[#0e0e0e] border border-white/10 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors">
                    {REWARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[9px] tracking-[.2em] uppercase text-[#909090] mb-2">
                    Opening DM <span className="text-[#222222] normal-case tracking-normal">— leave blank to use default. email collected in DM reply automatically.</span>
                  </label>
                  <textarea value={form.dm_message} onChange={e => setForm(p => ({ ...p, dm_message: e.target.value }))}
                    rows={3}
                    placeholder="hey 🖤 just reply with your email address and i'll send the free download straight to your inbox"
                    className="w-full bg-[#0e0e0e] border border-white/10 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors placeholder-[#222222] resize-none" />
                </div>
                <div>
                  <label className="block text-[9px] tracking-[.2em] uppercase text-[#909090] mb-2">
                    Reward URL <span className="text-[#222222] normal-case">shown after email submitted</span>
                  </label>
                  <input value={form.reward_url} onChange={e => setForm(p => ({ ...p, reward_url: e.target.value }))}
                    placeholder="https://bandcamp.com/..."
                    className="w-full bg-[#0e0e0e] border border-white/10 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors placeholder-[#222222]" />
                </div>
                <div>
                  <label className="block text-[9px] tracking-[.2em] uppercase text-[#909090] mb-2">
                    Specific post URL <span className="text-[#222222] normal-case">leave blank = any post</span>
                  </label>
                  <input value={form.platform_post_id} onChange={e => setForm(p => ({ ...p, platform_post_id: e.target.value }))}
                    placeholder="instagram.com/p/..."
                    className="w-full bg-[#0e0e0e] border border-white/10 text-[#f2f2f2] font-mono text-[11px] px-3 py-2.5 outline-none focus:border-[#ff2a1a] transition-colors placeholder-[#222222]" />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => setForm(p => ({ ...p, follow_required: !p.follow_required }))}
                      className={`w-8 h-4 rounded-full transition-colors relative ${form.follow_required ? 'bg-[#ff2a1a]' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.follow_required ? 'left-4' : 'left-0.5'}`} />
                    </div>
                    <span className="text-[10px] tracking-[.08em] text-[#909090]">Require follow before download</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={createAutomation} disabled={saving || !form.campaign_name || !form.dm_message}
                  className="text-[10px] tracking-[.16em] uppercase bg-[#ff2a1a] text-[#050505] px-6 py-2.5 hover:bg-[#ff2a1a] transition-colors disabled:opacity-40 flex items-center gap-2">
                  {saving && <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
                  {saving ? 'Creating...' : 'Create campaign →'}
                </button>
                <button onClick={() => setCreating(false)} className="text-[10px] tracking-[.16em] uppercase border border-white/13 text-[#909090] px-6 py-2.5 hover:border-white/25 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Selected automation detail */}
          {selectedAuto && !creating && (
            <div className="p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="text-[13px] tracking-[.05em] mb-1">{selectedAuto.campaign_name}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-[9px] tracking-[.14em] uppercase px-2 py-0.5 ${selectedAuto.enabled ? 'bg-[#3d6b4a]/20 text-[#3d6b4a]' : 'bg-white/5 text-[#909090]'}`}>
                      {selectedAuto.enabled ? 'live' : 'paused'}
                    </span>
                    <span className="text-[10px] text-[#909090]">{selectedAuto.sent_count || 0} DMs sent · {selectedAuto.lead_count || 0} leads</span>
                    {selectedAuto.follow_required && (
                      <span className="text-[9px] tracking-[.1em] uppercase text-[#ff2a1a]/60">follow-gated</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleAutomation(selectedAuto.id, !selectedAuto.enabled)}
                    className="text-[9px] tracking-[.14em] uppercase text-[#909090] hover:text-[#909090] transition-colors border border-white/10 px-3 py-1.5">
                    {selectedAuto.enabled ? 'Pause' : 'Activate'}
                  </button>
                  <button onClick={() => deleteAutomation(selectedAuto.id)}
                    className="text-[9px] tracking-[.14em] uppercase text-red-400/50 hover:text-red-400 transition-colors">
                    Delete
                  </button>
                </div>
              </div>

              {/* Campaign details */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-[#0e0e0e] border border-white/7 p-4">
                  <div className="text-[9px] tracking-[.18em] uppercase text-[#909090] mb-2">Trigger keyword</div>
                  <div className="text-[12px] text-[#f2f2f2]">{selectedAuto.trigger_keyword || <span className="text-[#909090] italic">any comment</span>}</div>
                </div>
                <div className="bg-[#0e0e0e] border border-white/7 p-4">
                  <div className="text-[9px] tracking-[.18em] uppercase text-[#909090] mb-2">Reward type</div>
                  <div className="text-[12px] text-[#f2f2f2] capitalize">{selectedAuto.reward_type}</div>
                </div>
                <div className="bg-[#0e0e0e] border border-white/7 p-4 col-span-2">
                  <div className="text-[9px] tracking-[.18em] uppercase text-[#909090] mb-2">DM message</div>
                  <div className="text-[11px] text-[#909090] leading-relaxed">{selectedAuto.dm_message}</div>
                </div>
                <div className="bg-[#0e0e0e] border border-white/7 p-4 col-span-2">
                  <div className="text-[9px] tracking-[.18em] uppercase text-[#909090] mb-2">Flow</div>
                  <div className="text-[10px] text-[#909090] leading-relaxed">
                    Comment trigger → auto DM → reply with email → {selectedAuto.reward_url ? 'reward link sent in DM' : 'email captured, reward sent manually'}
                    {selectedAuto.follow_required && ' · follow-gated'}
                  </div>
                </div>
              </div>

              {/* Leads table */}
              <div className="border-t border-white/7 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] tracking-[.22em] uppercase text-[#ff2a1a]">Leads captured — {leads.length}</div>
                  {leads.length > 0 && (
                    <button onClick={exportCSV} className="text-[9px] tracking-[.14em] uppercase text-[#909090] hover:text-[#909090] transition-colors border border-white/10 px-3 py-1.5">
                      Export CSV →
                    </button>
                  )}
                </div>

                {loadingLeads ? (
                  <div className="flex items-center gap-2 py-6 text-[10px] tracking-[.1em] text-[#909090]">
                    <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full bg-[#ff2a1a] animate-pulse" style={{ animationDelay: `${i*0.2}s` }} />)}</div>
                    Loading leads...
                  </div>
                ) : leads.length === 0 ? (
                  <div className="border border-dashed border-white/10 p-8 text-center">
                    <div className="text-[10px] tracking-[.08em] text-[#909090]">No leads yet — activate the campaign and post</div>
                  </div>
                ) : (
                  <div className="border border-white/7">
                    <div className="grid grid-cols-5 gap-0 border-b border-white/7 px-4 py-2 bg-white/3">
                      {['Instagram', 'Email', 'Followers', 'Comment', 'Date'].map(h => (
                        <div key={h} className="text-[8px] tracking-[.2em] uppercase text-[#909090]">{h}</div>
                      ))}
                    </div>
                    {leads.map(lead => (
                      <div key={lead.id} className="grid grid-cols-5 gap-0 border-b border-white/5 px-4 py-3 hover:bg-white/3 transition-colors last:border-0">
                        <div className="text-[10px] tracking-[.04em]">{lead.username ? `@${lead.username}` : <span className="text-[#909090]">—</span>}</div>
                        <div className="text-[10px] tracking-[.04em] text-[#909090] truncate">{lead.email || <span className="text-[#909090]">—</span>}</div>
                        <div className="text-[10px] text-[#909090]">{lead.follower_count ? lead.follower_count.toLocaleString() : '—'}</div>
                        <div className="text-[9px] text-[#909090] truncate italic">"{(lead.comment_text || '').slice(0, 30)}"</div>
                        <div className="text-[9px] text-[#909090]">
                          {lead.triggered_at ? new Date(lead.triggered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!selectedAuto && !creating && (
            <div className="flex items-center justify-center h-full text-center px-8">
              <div>
                <div className="text-[10px] tracking-[.1em] text-[#909090] mb-4">
                  Comment → DM → email capture → leads database
                </div>
                <button onClick={() => setCreating(true)}
                  className="text-[10px] tracking-[.18em] uppercase text-[#ff2a1a] hover:opacity-70 transition-opacity">
                  Create first campaign →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
