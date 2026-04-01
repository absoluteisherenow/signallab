'use client'

import { useState, useEffect } from 'react'
import SocialConnect from '@/components/social/SocialConnect'
import { PageHeader } from '@/components/ui/PageHeader'

interface ConnectedAccount {
  id: string
  email: string
  label: string
}

interface BankAccount {
  id: string
  currency: string
  account_name: string
  bank_name: string
  is_default: boolean
  // UK
  sort_code?: string
  account_number?: string
  // International
  iban?: string
  swift_bic?: string
  intermediary_bic?: string
  // Addresses (required for some international transfers)
  recipient_address?: string
  bank_address?: string
}

interface PaymentSettings {
  legal_name: string
  address: string
  vat_number: string
  payment_terms: string
  bank_accounts: BankAccount[]
}

interface Alias {
  id: string
  name: string
  genre: string
  social_accounts: string[]
  payment: {
    bank_accounts: BankAccount[]
    vat_number: string
  }
  voice_profile: Record<string, unknown>
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
  const [payment, setPayment] = useState<PaymentSettings>({
    legal_name: '', address: '', vat_number: '', payment_terms: '30',
    bank_accounts: [],
  })
  const [aliases, setAliases] = useState<Alias[]>([])
  const [newAlias, setNewAlias] = useState({ name: '', genre: '' })
  const [tier, setTier] = useState<'free' | 'pro'>('free')
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'integrations' | 'advance' | 'payment' | 'aliases'>('profile')
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])
  const [newAccountLabel, setNewAccountLabel] = useState('')
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ processed: number; results: any[] } | null>(null)

  useEffect(() => {
    fetch('/api/gmail/accounts')
      .then(r => r.json())
      .then(d => { if (d.accounts) setConnectedAccounts(d.accounts) })
      .catch(() => {})
    // Check for ?gmail=connected success redirect
    const params = new URLSearchParams(window.location.search)
    if (params.get('gmail') === 'connected') {
      setGmailConnected(true)
      setActiveTab('integrations')
      window.history.replaceState({}, '', '/business/settings')
    }
  }, [])

  async function scanGmail() {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch('/api/gmail/process', { method: 'POST' })
      const data = await res.json()
      setScanResult(data)
    } catch {
      setScanResult({ processed: 0, results: [{ error: 'Scan failed' }] })
    } finally {
      setScanning(false)
    }
  }

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
        if (data.settings.payment) setPayment(data.settings.payment)
        if (data.settings.aliases) setAliases(data.settings.aliases)
        if (data.settings.tier) setTier(data.settings.tier)
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
        body: JSON.stringify({ profile, team, advance, payment, aliases }),
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
        tabs={([...(['profile', 'team', 'integrations', 'advance', 'payment'] as const), ...(tier === 'pro' ? ['aliases' as const] : [])]).map(tab => ({
          label: tab === 'advance' ? 'Advance form' : tab === 'payment' ? 'Payment details' : tab === 'aliases' ? 'Aliases' : tab,
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
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px', lineHeight: '1.7' }}>
            Add anyone you work with regularly. These contacts auto-fill across the platform — advance forms, content crew briefs, gig debriefs.
          </div>

          {team.map((member, i) => (
            <div key={member.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: member.name ? 'var(--green)' : 'var(--border)' }} />
                  <div>
                    <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>{member.role}</div>
                    {member.name && <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                      Used in: advance forms{member.role === 'Photographer' || member.role === 'Videographer' ? ', content crew briefs' : member.role === 'Driver' ? ', tonight mode' : ', gig logistics'}
                    </div>}
                  </div>
                </div>
                {!['Photographer', 'Tour Manager', 'Driver', 'Videographer'].includes(member.role) && (
                  <button onClick={() => setTeam(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.borderColor = '#ef4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' }}>
                    Remove
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: !['Photographer', 'Tour Manager', 'Driver', 'Videographer'].includes(member.role) ? '120px 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '12px' }}>
                {!['Photographer', 'Tour Manager', 'Driver', 'Videographer'].includes(member.role) && (
                  <div>
                    <label style={labelStyle}>Role</label>
                    <input value={member.role} onChange={e => setTeam(prev => prev.map((m, j) => j === i ? { ...m, role: e.target.value } : m))}
                      placeholder="Role" style={inputStyle} />
                  </div>
                )}
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

          <button onClick={() => setTeam(prev => [...prev, { id: crypto.randomUUID(), role: '', name: '', email: '', phone: '' }])}
            style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '10px 18px', cursor: 'pointer', alignSelf: 'flex-start' }}>
            + Add team member
          </button>

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Gmail</div>
              {connectedAccounts.length > 0 && (
                <button onClick={scanGmail} disabled={scanning}
                  style={{ background: scanning ? 'rgba(176,141,87,0.1)' : 'rgba(176,141,87,0.15)', border: '1px solid rgba(176,141,87,0.4)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 16px', cursor: scanning ? 'not-allowed' : 'pointer', opacity: scanning ? 0.7 : 1 }}>
                  {scanning ? 'Scanning...' : 'Scan inbox'}
                </button>
              )}
            </div>
            {gmailConnected && (
              <div style={{ padding: '10px 14px', background: 'rgba(61,107,74,0.12)', border: '1px solid rgba(61,107,74,0.3)', marginBottom: '16px', fontSize: '12px', color: 'var(--green)' }}>
                Gmail connected successfully. Run Scan inbox to process your emails.
              </div>
            )}
            {scanResult && (
              <div style={{ padding: '10px 14px', background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.2)', marginBottom: '16px', fontSize: '11px', color: 'var(--text-dim)' }}>
                {scanResult.processed > 0
                  ? `Found and processed ${scanResult.processed} email${scanResult.processed !== 1 ? 's' : ''}`
                  : 'No new emails to process'}
                {scanResult.results?.filter(r => r.type).map((r, i) => (
                  <div key={i} style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-dimmer)' }}>
                    · {r.subject || r.type} → {r.type}
                  </div>
                ))}
              </div>
            )}
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

      {/* PAYMENT TAB */}
      {activeTab === 'payment' && (
        <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Legal details */}
          <div className="card">
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '20px' }}>Invoice details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={labelStyle}>Legal / trading name</label>
                <input value={payment.legal_name} onChange={e => setPayment(p => ({ ...p, legal_name: e.target.value }))}
                  placeholder="Your full legal or trading name" style={inputStyle} />
                <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '6px' }}>Appears as the invoicing party on all invoices</div>
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <textarea value={payment.address} onChange={e => setPayment(p => ({ ...p, address: e.target.value }))}
                  rows={3} placeholder="Street, City, Postcode, Country" style={{ ...inputStyle, resize: 'vertical' as const }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>VAT / ABN / Tax number</label>
                  <input value={payment.vat_number} onChange={e => setPayment(p => ({ ...p, vat_number: e.target.value }))}
                    placeholder="Optional" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Payment terms (days)</label>
                  <input type="number" min="1" value={payment.payment_terms} onChange={e => setPayment(p => ({ ...p, payment_terms: e.target.value }))}
                    placeholder="30" style={inputStyle} />
                  <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '6px' }}>Default days for invoice due date</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bank accounts */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Bank accounts</div>
              {tier !== 'pro' && (
                <span style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', background: 'rgba(255,192,0,0.12)', color: 'var(--gold)', padding: '3px 8px', border: '1px solid rgba(255,192,0,0.2)' }}>Pro — multi-currency</span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '20px', lineHeight: '1.7' }}>
              {tier === 'pro'
                ? 'Add accounts in different currencies. The matching currency account is used automatically on each invoice.'
                : 'One bank account on Free. Upgrade to Pro to add multiple currencies.'}
            </div>

            {/* Completeness check */}
            {(() => {
              const missingCurrencies = ['EUR', 'GBP', 'USD'].filter(
                c => !payment.bank_accounts.some((acc: BankAccount) => acc.currency === c && (acc.iban || acc.account_number))
              )
              if (missingCurrencies.length === 0) return null
              return (
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(192,64,64,0.06)',
                  border: '1px solid rgba(192,64,64,0.2)',
                  marginBottom: '20px',
                  fontSize: '11px',
                  color: '#c06060',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  <span>●</span>
                  <span>Missing bank details for: {missingCurrencies.join(', ')} — invoices in these currencies will send without payment info</span>
                </div>
              )
            })()}

            {payment.bank_accounts.length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '16px' }}>No bank accounts added yet.</div>
            )}

            {payment.bank_accounts.map((acct, i) => (
              <div key={acct.id} style={{ border: '1px solid var(--border-dim)', padding: '16px', marginBottom: '12px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{acct.currency || 'Currency'}</span>
                    {acct.is_default && (
                      <span style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>Default</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!acct.is_default && (
                      <button onClick={() => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => ({ ...a, is_default: j === i })) }))}
                        style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer' }}>
                        Set default
                      </button>
                    )}
                    <button onClick={() => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.filter((_, j) => j !== i) }))}
                      style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.borderColor = '#ef4444' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' }}>
                      Remove
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Currency</label>
                    <input value={acct.currency} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, currency: e.target.value.toUpperCase() } : a) }))}
                      placeholder="GBP / EUR / AUD / USD" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Account name</label>
                    <input value={acct.account_name} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, account_name: e.target.value } : a) }))}
                      placeholder="Name on account" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Bank name</label>
                    <input value={acct.bank_name} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, bank_name: e.target.value } : a) }))}
                      placeholder="Monzo, Barclays, etc." style={inputStyle} />
                  </div>
                </div>

                {/* UK fields */}
                {(acct.currency === 'GBP' || (!acct.currency && !acct.iban)) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div>
                      <label style={labelStyle}>Sort code</label>
                      <input value={acct.sort_code || ''} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, sort_code: e.target.value } : a) }))}
                        placeholder="00-00-00" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Account number</label>
                      <input value={acct.account_number || ''} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, account_number: e.target.value } : a) }))}
                        placeholder="00000000" style={inputStyle} />
                    </div>
                  </div>
                )}

                {/* International fields */}
                {acct.currency && acct.currency !== 'GBP' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div>
                      <label style={labelStyle}>IBAN</label>
                      <input value={acct.iban || ''} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, iban: e.target.value } : a) }))}
                        placeholder="GB00 XXXX 0000 0000 0000 00" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>SWIFT / BIC</label>
                      <input value={acct.swift_bic || ''} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, swift_bic: e.target.value } : a) }))}
                        placeholder="XXXXGB2L" style={inputStyle} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Intermediary BIC <span style={{ color: 'var(--text-dimmer)', fontWeight: 400 }}>(if required)</span></label>
                      <input value={acct.intermediary_bic || ''} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, intermediary_bic: e.target.value } : a) }))}
                        placeholder="Intermediary / correspondent BIC" style={inputStyle} />
                    </div>
                  </div>
                )}

                {/* Addresses — shown for all non-GBP or explicitly needed */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <div>
                    <label style={labelStyle}>Account holder address <span style={{ color: 'var(--text-dimmer)', fontWeight: 400 }}>(international)</span></label>
                    <textarea value={acct.recipient_address || ''} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, recipient_address: e.target.value } : a) }))}
                      placeholder="Street, City, Country" rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Bank address <span style={{ color: 'var(--text-dimmer)', fontWeight: 400 }}>(international)</span></label>
                    <textarea value={acct.bank_address || ''} onChange={e => setPayment(p => ({ ...p, bank_accounts: p.bank_accounts.map((a, j) => j === i ? { ...a, bank_address: e.target.value } : a) }))}
                      placeholder="Bank street, City, Country" rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} />
                  </div>
                </div>
              </div>
            ))}

            {(tier === 'pro' || payment.bank_accounts.length === 0) ? (
              <button onClick={() => setPayment(p => ({
                ...p,
                bank_accounts: [...p.bank_accounts, {
                  id: crypto.randomUUID(),
                  currency: '', account_name: '', bank_name: '',
                  is_default: p.bank_accounts.length === 0,
                }]
              }))}
                style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 18px', cursor: 'pointer' }}>
                + Add bank account
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button disabled style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 18px', cursor: 'not-allowed', opacity: 0.4 }}>
                  + Add bank account
                </button>
                <span style={{ fontSize: '10px', color: 'var(--text-dimmer)', letterSpacing: '0.08em' }}>Upgrade to Pro for multiple currencies</span>
              </div>
            )}
          </div>

          <button onClick={save} disabled={isSaving} className="btn-primary" style={{ alignSelf: 'flex-start', opacity: isSaving ? 0.6 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
            {saved ? 'Saved ✓' : isSaving ? 'Saving...' : 'Save payment details'}
          </button>
        </div>
      )}

      {/* ALIASES TAB (Pro only) */}
      {activeTab === 'aliases' && tier === 'pro' && (
        <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Active alias selector */}
          {aliases.length > 0 && (
            <div className="card">
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>Active alias</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => { localStorage.removeItem('activeAliasId'); window.location.reload() }}
                  style={{
                    background: !localStorage.getItem('activeAliasId') ? 'rgba(176,141,87,0.15)' : 'transparent',
                    border: `1px solid ${!localStorage.getItem('activeAliasId') ? 'rgba(176,141,87,0.5)' : 'var(--border-dim)'}`,
                    color: !localStorage.getItem('activeAliasId') ? 'var(--gold)' : 'var(--text-dimmer)',
                    fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.08em',
                    padding: '8px 16px', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {profile.name || 'Primary'}
                </button>
                {aliases.map(alias => {
                  const isActive = typeof window !== 'undefined' && localStorage.getItem('activeAliasId') === alias.id
                  return (
                    <button
                      key={alias.id}
                      onClick={() => { localStorage.setItem('activeAliasId', alias.id); window.location.reload() }}
                      style={{
                        background: isActive ? 'rgba(176,141,87,0.15)' : 'transparent',
                        border: `1px solid ${isActive ? 'rgba(176,141,87,0.5)' : 'var(--border-dim)'}`,
                        color: isActive ? 'var(--gold)' : 'var(--text-dimmer)',
                        fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.08em',
                        padding: '8px 16px', cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {alias.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Existing aliases */}
          {aliases.map((alias, i) => (
            <div key={alias.id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>{alias.name}</div>
                <button
                  onClick={() => {
                    setAliases(prev => prev.filter(a => a.id !== alias.id))
                    if (localStorage.getItem('activeAliasId') === alias.id) {
                      localStorage.removeItem('activeAliasId')
                    }
                  }}
                  style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.borderColor = '#ef4444' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' }}
                >
                  Delete
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Alias name</label>
                  <input
                    value={alias.name}
                    onChange={e => setAliases(prev => prev.map((a, j) => j === i ? { ...a, name: e.target.value } : a))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Genre</label>
                  <input
                    value={alias.genre}
                    onChange={e => setAliases(prev => prev.map((a, j) => j === i ? { ...a, genre: e.target.value } : a))}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Social accounts (comma-separated)</label>
                <input
                  value={alias.social_accounts.join(', ')}
                  onChange={e => setAliases(prev => prev.map((a, j) => j === i ? { ...a, social_accounts: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : a))}
                  placeholder="@alias_instagram, @alias_twitter"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>VAT / Tax number</label>
                  <input
                    value={alias.payment.vat_number}
                    onChange={e => setAliases(prev => prev.map((a, j) => j === i ? { ...a, payment: { ...a.payment, vat_number: e.target.value } } : a))}
                    placeholder="Optional"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Alias bank accounts */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '12px' }}>Bank accounts</div>
                {alias.payment.bank_accounts.map((acct, bi) => (
                  <div key={acct.id} style={{ border: '1px solid var(--border-dim)', padding: '12px', marginBottom: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: '4px' }}>Currency</label>
                        <input
                          value={acct.currency}
                          onChange={e => {
                            const newBanks = [...alias.payment.bank_accounts]
                            newBanks[bi] = { ...newBanks[bi], currency: e.target.value.toUpperCase() }
                            setAliases(prev => prev.map((a, j) => j === i ? { ...a, payment: { ...a.payment, bank_accounts: newBanks } } : a))
                          }}
                          placeholder="GBP"
                          style={{ ...inputStyle, padding: '8px 10px', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: '4px' }}>Account name</label>
                        <input
                          value={acct.account_name}
                          onChange={e => {
                            const newBanks = [...alias.payment.bank_accounts]
                            newBanks[bi] = { ...newBanks[bi], account_name: e.target.value }
                            setAliases(prev => prev.map((a, j) => j === i ? { ...a, payment: { ...a.payment, bank_accounts: newBanks } } : a))
                          }}
                          placeholder="Name on account"
                          style={{ ...inputStyle, padding: '8px 10px', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: '4px' }}>IBAN / Account no.</label>
                        <input
                          value={acct.iban || acct.account_number || ''}
                          onChange={e => {
                            const newBanks = [...alias.payment.bank_accounts]
                            newBanks[bi] = { ...newBanks[bi], iban: e.target.value }
                            setAliases(prev => prev.map((a, j) => j === i ? { ...a, payment: { ...a.payment, bank_accounts: newBanks } } : a))
                          }}
                          style={{ ...inputStyle, padding: '8px 10px', fontSize: '12px' }}
                        />
                      </div>
                      <button
                        onClick={() => {
                          const newBanks = alias.payment.bank_accounts.filter((_, bj) => bj !== bi)
                          setAliases(prev => prev.map((a, j) => j === i ? { ...a, payment: { ...a.payment, bank_accounts: newBanks } } : a))
                        }}
                        style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '8px 10px', cursor: 'pointer' }}
                      >
                        x
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const newBank: BankAccount = { id: crypto.randomUUID(), currency: '', account_name: '', bank_name: '', is_default: alias.payment.bank_accounts.length === 0 }
                    setAliases(prev => prev.map((a, j) => j === i ? { ...a, payment: { ...a.payment, bank_accounts: [...a.payment.bank_accounts, newBank] } } : a))
                  }}
                  style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '6px 14px', cursor: 'pointer' }}
                >
                  + Add bank account
                </button>
              </div>
            </div>
          ))}

          {/* Add new alias form */}
          <div className="card" style={{ border: '1px solid rgba(176,141,87,0.2)' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '20px' }}>Add alias</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Alias name</label>
                <input
                  value={newAlias.name}
                  onChange={e => setNewAlias(p => ({ ...p, name: e.target.value }))}
                  placeholder="ABSOLUTE."
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Genre</label>
                <input
                  value={newAlias.genre}
                  onChange={e => setNewAlias(p => ({ ...p, genre: e.target.value }))}
                  placeholder="Electronic"
                  style={inputStyle}
                />
              </div>
            </div>
            <button
              onClick={() => {
                if (!newAlias.name.trim()) return
                const alias: Alias = {
                  id: crypto.randomUUID(),
                  name: newAlias.name.trim(),
                  genre: newAlias.genre.trim(),
                  social_accounts: [],
                  payment: { bank_accounts: [], vat_number: '' },
                  voice_profile: {},
                }
                setAliases(prev => [...prev, alias])
                setNewAlias({ name: '', genre: '' })
              }}
              className="btn-primary"
              style={{ padding: '10px 20px', fontSize: '10px' }}
            >
              + Add alias
            </button>
          </div>

          <button onClick={save} disabled={isSaving} className="btn-primary" style={{ alignSelf: 'flex-start', opacity: isSaving ? 0.6 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
            {saved ? 'Saved ✓' : isSaving ? 'Saving...' : 'Save aliases'}
          </button>
        </div>
      )}

      </div>{/* end inner padding */}
    </div>
  )
}
