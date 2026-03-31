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
}

interface PaymentSettings {
  legal_name: string
  address: string
  vat_number: string
  payment_terms: string
  bank_accounts: BankAccount[]
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
  const [tier, setTier] = useState<'free' | 'pro'>('free')
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'integrations' | 'advance' | 'payment'>('profile')
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
        if (data.settings.payment) setPayment(data.settings.payment)
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
        body: JSON.stringify({ profile, team, advance, payment }),
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
        tabs={(['profile', 'team', 'integrations', 'advance', 'payment'] as const).map(tab => ({
          label: tab === 'advance' ? 'Advance form' : tab === 'payment' ? 'Payment details' : tab,
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
                  </div>
                )}
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

      </div>{/* end inner padding */}
    </div>
  )
}
