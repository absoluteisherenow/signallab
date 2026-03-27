'use client'

import { useState, useEffect } from 'react'

export default function Settings() {
  const [profile, setProfile] = useState({ name: 'NIGHT manoeuvres', genre: 'Electronic', country: 'Australia', bio: 'Electronic music artist based in Melbourne.' })
  const [team, setTeam] = useState([
    { id: '1', role: 'Photographer', name: 'Alex Smith', email: 'alex@example.com', phone: '+44 7700 900000' },
    { id: '2', role: 'Tour Manager', name: '', email: '', phone: '' },
    { id: '3', role: 'Driver', name: '', email: '', phone: '' },
    { id: '4', role: 'Videographer', name: '', email: '', phone: '' },
  ])
  const [advance, setAdvance] = useState({ sender_name: 'NIGHT manoeuvres Management', reply_email: 'bookings@nightmanoeuvres.com' })
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'integrations' | 'advance'>('profile')
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

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
    } catch (err) {
      console.error('Failed to load settings:', err)
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
    } catch (err) {
      console.error('Failed to save settings:', err)
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
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh', padding: '40px 48px' }}>

      {/* HEADER */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: 'var(--gold)' }} />
          Tour Lab — Settings
        </div>
        <div className="display" style={{ fontSize: '28px', letterSpacing: '0.04em' }}>Settings</div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '32px' }}>
        {(['profile', 'team', 'integrations', 'advance'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: activeTab === tab ? 'var(--panel)' : 'transparent',
            border: `1px solid ${activeTab === tab ? 'rgba(176, 141, 87, 0.25)' : 'var(--border-dim)'}`,
            color: activeTab === tab ? 'var(--gold)' : 'var(--text-dimmer)',
            fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.15em',
            textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            {tab === 'advance' ? 'Advance form' : tab}
          </button>
        ))}
      </div>

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
        <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { name: 'Buffer', desc: 'Publishing to Instagram, TikTok, Threads', status: 'connected', color: 'var(--green)', action: null },
            { name: 'Supabase', desc: 'Data persistence — artist profiles, sets, posts', status: 'connected', color: 'var(--green)', action: null },
            { name: 'Vercel Blob', desc: 'Media storage — photos and video clips', status: 'connected', color: 'var(--green)', action: null },
            { name: 'Resend', desc: 'Advance request emails', status: 'connected', color: 'var(--green)', action: null },
            { name: 'Rekordbox', desc: 'Import your DJ library via XML export', status: 'ready', color: '#b08d57', action: '/setlab/rekordbox' },
            { name: 'Instagram Insights', desc: 'Engagement data for caption intelligence — coming in v2', status: 'coming soon', color: 'var(--text-dimmer)', action: null },
          ].map(integration => (
            <div key={integration.name} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>{integration.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', letterSpacing: '0.04em' }}>{integration.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: integration.color }}>{integration.status}</span>
                  {integration.action && (
                    <button onClick={() => window.location.href = integration.action!} className="btn-secondary" style={{ fontSize: '10px', padding: '6px 14px' }}>
                      {integration.status === 'ready' ? 'Import →' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="card" style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '12px' }}>Subscription</div>
            <div className="display" style={{ fontSize: '20px', color: 'var(--gold)', marginBottom: '4px' }}>Pro</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>£59/month · All features unlocked</div>
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
    </div>
  )
}
