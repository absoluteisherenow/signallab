'use client'

import { useState, useEffect } from 'react'
import SocialConnect from '@/components/social/SocialConnect'
import { PageHeader } from '@/components/ui/PageHeader'

interface ConnectedAccount {
  id: string
  email: string
  label: string
}

export default function Settings() {
  const [profile, setProfile] = useState({ name: '', genre: '', country: '', bio: '' })
  const [team, setTeam] = useState([
    { id: '1', role: 'Photographer', name: '', email: '', phone: '' },
    { id: '2', role: 'Tour Manager', name: '', email: '', phone: '' },
    { id: '3', role: 'Driver', name: '', email: '', phone: '' },
    { id: '4', role: 'Videographer', name: '', email: '', phone: '' },
  ])
  const [advance, setAdvance] = useState({ sender_name: '', reply_email: '' })
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'integrations' | 'advance'>('profile')
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])
  const [newAccountLabel, setNewAccountLabel] = useState('')
  const [showAddAccount, setShowAddAccount] = useState(false)

  useEffect(() => {
    fetch('/api/gmail/accounts')
      .then(r => r.json())
      .then(d => { if (d.accounts) setConnectedAccounts(d.accounts) })
      .catch(() => {})
  }, [])

  async function disconnectAccount(id: string) {
    await fetch(`/api/gmail/accounts?id=${id}`, { method: 'DELETE' })
    setConnectedAccounts(prev => prev.filter(a => a.id !== id))
  }

  // Load settings from Supabase
  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.settings) {
        if (data.settings.profile) setProfile(data.settings.profile)
        if (data.settings.team) setTeam(data.settings.team)
        if (data.settings.advance) setAdvance(data.settings.advance)
      }
    } catch {
      // Settings load failed silently — empty state will show
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setIsSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, team, advance }),
      })
      const data = await res.json()
      if (data.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      // Save failed silently
    } finally {
      setIsSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)',
    color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px',
    padding: '12px 16px', outline: 'none', boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  }

  const labelStyle = {
    fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)',
    textTransform: 'uppercase' as const, marginBottom: '8px', display: 'block',
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>

      <PageHeader
        section="Settings"
        title="Settings"
        tabs={(['profile', 'team', 'integrations', 'advance'] as const).map(tab => ({
          label: tab === 'advance' ? 'Advance form' : tab,
          active: activeTab === tab,
          onClick: () => setActiveTab(tab),
        }))}
      />

      <div style={{ padding: '40px 48px' }}>

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <div className="card" style={{ maxWidth: '640px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '28px' }}>Artist profile</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {[
              { label: 'Artist / act name', key: 'name', placeholder: 'NIGHT manoeuvres' },
              { label: 'Genre', key: 'genre', placeholder: 'Electronic' },
              { label: 'Country', key: 'country', placeholder: 'Australia' },
            ].map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                <input value={profile[f.key as keyof typeof profile]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Bio</label>
              <textarea value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} />
            </div>
          </div>
          <button onClick={save} disabled={isSaving} className="btn-primary" style={{ marginTop: '24px', opacity: isSaving ? 0.6 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
            {saved ? 'Saved ✓' : isSaving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      )}

      {/* TEAM TAB */}
      {activeTab === 'team' && (
        <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px', lineHeight: '1.7' }}>
            Your team contacts appear automatically in advance request forms. Add your regular photographer, driver, and tour manager once — they'll be available on every gig.
          </div>
          {team.map((member, i) => (
            <div key={member.id} className="card">
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '20px' }}>{member.role}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {[
                  { label: 'Name', key: 'name', placeholder: 'Full name' },
                  { label: 'Email', key: 'email', placeholder: 'email@example.com' },
                  { label: 'Phone', key: 'phone', placeholder: '+44 7700 000000' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>{f.label}</label>
                    <input value={member[f.key as keyof typeof member]} onChange={e => setTeam(prev => prev.map((m, j) => j === i ? { ...m, [f.key]: e.target.value } : m))}
                      placeholder={f.placeholder} style={inputStyle} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={save} disabled={isSaving} className="btn-primary" style={{ alignSelf: 'flex-start', opacity: isSaving ? 0.6 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
            {saved ? 'Saved ✓' : isSaving ? 'Saving...' : 'Save team'}
          </button>
        </div>
      )}

      {/* INTEGRATIONS TAB */}
      {activeTab === 'integrations' && (
        <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Gmail — Connected Accounts */}
          <div className="card">
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '4px' }}>Gmail</div>
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '20px', lineHeight: '1.7' }}>
              Scanned for bookings, invoice requests, and expenses. Add as many accounts as you need.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {connectedAccounts.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>No accounts connected yet.</div>
              )}
              {connectedAccounts.map(account => (
                <div key={account.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dim)' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text)' }}>{account.email}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', letterSpacing: '0.08em', marginTop: '2px' }}>{account.label}</div>
                  </div>
                  <button onClick={() => disconnectAccount(account.id)}
                    style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.borderColor = '#ef4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' }}>
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
            {!showAddAccount ? (
              <button onClick={() => setShowAddAccount(true)}
                style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 18px', cursor: 'pointer' }}>
                + Connect account
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...labelStyle, marginBottom: '6px' }}>Label</div>
                  <input value={newAccountLabel} onChange={e => setNewAccountLabel(e.target.value)}
                    placeholder="e.g. Management, Bookings, Personal"
                    style={inputStyle} />
                </div>
                <a href={`/api/gmail/auth?label=${encodeURIComponent(newAccountLabel || 'Primary')}`}
                  style={{ background: 'var(--gold)', color: '#070706', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '13px 18px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Connect Gmail →
                </a>
                <button onClick={() => { setShowAddAccount(false); setNewAccountLabel('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '8px', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Social accounts — direct OAuth, no third-party */}
          <div className="card">
            <SocialConnect />
          </div>

          {/* Rekordbox */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '4px' }}>Rekordbox</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', lineHeight: '1.7' }}>Import your full DJ library via XML export into Set Lab.</div>
              </div>
              <button onClick={() => window.location.href = '/setlab/rekordbox'}
                style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer', flexShrink: 0, marginLeft: '24px' }}>
                Import →
              </button>
            </div>
          </div>

          {/* Instagram Insights */}
          <div className="card" style={{ opacity: 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '4px' }}>Instagram Insights</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', lineHeight: '1.7' }}>Real engagement data to sharpen caption intelligence — coming in v2.</div>
              </div>
              <span style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', flexShrink: 0, marginLeft: '24px' }}>Soon</span>
            </div>
          </div>

        </div>
      )}

      {/* ADVANCE FORM TAB */}
      {activeTab === 'advance' && (
        <div className="card" style={{ maxWidth: '640px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '8px' }}>Advance form settings</div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '28px', lineHeight: '1.7' }}>
            These details appear on advance request emails sent to promoters. Use your management company name and email for a professional appearance.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Sender name</label>
              <input value={advance.sender_name} onChange={e => setAdvance(p => ({ ...p, sender_name: e.target.value }))}
                placeholder="NIGHT manoeuvres Management" style={inputStyle} />
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '6px' }}>Appears as "From: [name]" in the email</div>
            </div>
            <div>
              <label style={labelStyle}>Reply-to email</label>
              <input value={advance.reply_email} onChange={e => setAdvance(p => ({ ...p, reply_email: e.target.value }))}
                placeholder="bookings@yourmanagement.com" style={inputStyle} />
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '6px' }}>Promoters reply to this address</div>
            </div>
          </div>
          <button onClick={save} disabled={isSaving} className="btn-primary" style={{ marginTop: '24px', opacity: isSaving ? 0.6 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
            {saved ? 'Saved ✓' : isSaving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      )}

      </div>{/* end inner padding */}
    </div>
  )
}
