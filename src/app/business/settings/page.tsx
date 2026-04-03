'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import SocialConnect from '@/components/social/SocialConnect'
import { PageHeader } from '@/components/ui/PageHeader'

interface Document {
  id: string
  created_at: string
  name: string
  type: string
  file_url: string
  file_size: number
  mime_type: string
  notes: string | null
  tags: string[] | null
}

const DOC_TYPES = [
  { value: 'rider_tech', label: 'Tech Rider' },
  { value: 'rider_hospitality', label: 'Hospitality Rider' },
  { value: 'invoice', label: 'Invoice/Statement' },
  { value: 'contract', label: 'Contract' },
  { value: 'strategy', label: 'Content Strategy' },
  { value: 'other', label: 'Other' },
] as const

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
  hide_invoice_branding: boolean
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
    { id: '1', role: 'Manager', name: '', email: '', phone: '' },
    { id: '2', role: 'Agent', name: '', email: '', phone: '' },
  ])
  const [advance, setAdvance] = useState({ sender_name: '', reply_email: '' })
  const [payment, setPayment] = useState<PaymentSettings>({
    legal_name: '', address: '', vat_number: '', payment_terms: '30',
    bank_accounts: [], hide_invoice_branding: false,
  })
  const [aliases, setAliases] = useState<Alias[]>([])
  const [newAlias, setNewAlias] = useState({ name: '', genre: '' })

  // Promo list state
  const PROMO_TAGS = ['DJ', 'Label', 'Blog', 'Mate', 'PR', 'Other'] as const
  interface PromoContact {
    id: string
    name: string
    email?: string
    whatsapp?: string
    instagram?: string
    tag?: string
  }
  const [promoList, setPromoList] = useState<PromoContact[]>([])
  const [promoSaved, setPromoSaved] = useState(false)
  const [promoSaving, setPromoSaving] = useState(false)
  const [showAddPromo, setShowAddPromo] = useState(false)
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null)
  const [promoForm, setPromoForm] = useState({ name: '', email: '', whatsapp: '', instagram: '', tag: '' })
  const [tier, setTier] = useState<'free' | 'pro'>('free')
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'integrations' | 'advance' | 'payment' | 'aliases' | 'documents' | 'promo'>('profile')
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])
  const [newAccountLabel, setNewAccountLabel] = useState('')
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ processed: number; results: any[] } | null>(null)

  // RA profile pull state
  const [raPulling, setRaPulling] = useState(false)
  const [raError, setRaError] = useState<string | null>(null)
  const [raSuccess, setRaSuccess] = useState(false)

  // Document vault state
  const [documents, setDocuments] = useState<Document[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploadType, setUploadType] = useState('other')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true)
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      if (data.documents) setDocuments(data.documents)
    } catch { /* silent */ } finally { setDocsLoading(false) }
  }, [])

  async function uploadDocument(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', uploadType)
      const res = await fetch('/api/documents', { method: 'POST', body: form })
      const data = await res.json()
      if (data.success) {
        setDocuments(prev => [data.document, ...prev])
      } else {
        setUploadError(data.error || 'Upload failed — please try again')
      }
    } catch {
      setUploadError('Upload failed — check your connection')
    } finally {
      setUploading(false)
    }
  }

  async function deleteDocument(id: string) {
    try {
      const res = await fetch(`/api/documents?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) setDocuments(prev => prev.filter(d => d.id !== id))
    } catch { /* silent */ }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadDocument(file)
  }

  useEffect(() => {
    if (activeTab === 'documents') loadDocuments()
  }, [activeTab, loadDocuments])

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

  async function pullFromRA() {
    if (!profile.name.trim()) {
      setRaError('Enter an artist name first')
      return
    }
    setRaPulling(true)
    setRaError(null)
    setRaSuccess(false)
    try {
      const res = await fetch(`/api/ra-profile?artist=${encodeURIComponent(profile.name)}`)
      const data = await res.json()
      if (!res.ok) {
        setRaError(data.error || 'Could not find artist on RA')
        return
      }
      setProfile(p => ({
        ...p,
        bio: data.bio || p.bio,
        genre: (data.genres?.length ? data.genres.join(', ') : '') || p.genre,
        country: data.country || p.country,
      }))
      setRaSuccess(true)
      setTimeout(() => setRaSuccess(false), 3000)
    } catch {
      setRaError('Failed to connect to Resident Advisor')
    } finally {
      setRaPulling(false)
    }
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
        // Keep default team roles if none saved yet
        if (data.settings.team && data.settings.team.length > 0) setTeam(data.settings.team)
        if (data.settings.advance) setAdvance(data.settings.advance)
        if (data.settings.payment) {
          // Bank accounts may be stored in profile.bankAccounts (camelCase, from onboarding)
          // or payment.bank_accounts (snake_case, from settings). Check both.
          const profileBanks = data.settings.profile?.bankAccounts || []
          const paymentBanks = data.settings.payment.bank_accounts || []
          const resolvedBanks = paymentBanks.length > 0 ? paymentBanks : profileBanks
          setPayment(p => ({ ...p, ...data.settings.payment, bank_accounts: resolvedBanks.length > 0 ? resolvedBanks : p.bank_accounts || [] }))
        } else if (data.settings.profile?.bankAccounts?.length > 0) {
          // Payment object missing entirely but profile has bank accounts from onboarding
          setPayment(p => ({ ...p, bank_accounts: data.settings.profile.bankAccounts }))
        }
        if (data.settings.aliases) setAliases(data.settings.aliases)
        if (data.settings.tier) setTier(data.settings.tier)
        if (data.settings.promo_list) setPromoList(data.settings.promo_list)
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
        tabs={([...(['profile', 'team', 'integrations', 'advance', 'payment', 'documents', 'promo'] as const), ...(tier === 'pro' ? ['aliases' as const] : [])]).map(tab => ({
          label: tab === 'advance' ? 'Advance form' : tab === 'payment' ? 'Payment details' : tab === 'aliases' ? 'Aliases' : tab === 'documents' ? 'Vault' : tab === 'promo' ? 'Promo list' : tab,
          active: activeTab === tab,
          onClick: () => setActiveTab(tab),
        }))}
      />

      <div style={{ padding: '32px 48px' }}>

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
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '24px', flexWrap: 'wrap' }}>
            <button onClick={save} disabled={isSaving} className="btn-primary" style={{ opacity: isSaving ? 0.6 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {saved ? 'Saved ✓' : isSaving ? 'Saving...' : 'Save profile'}
            </button>
            <button
              onClick={pullFromRA}
              disabled={raPulling}
              className="btn-secondary"
              style={{
                opacity: raPulling ? 0.6 : 1,
                cursor: raPulling ? 'not-allowed' : 'pointer',
                borderColor: 'var(--border)',
              }}
            >
              {raPulling ? 'Pulling...' : raSuccess ? 'Imported ✓' : 'Pull from RA'}
            </button>
          </div>
          {raError && (
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#e06c75', fontFamily: 'var(--font-mono)' }}>
              {raError}
            </div>
          )}
          {raSuccess && (
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--green, #98c379)', fontFamily: 'var(--font-mono)' }}>
              Profile data imported from Resident Advisor
            </div>
          )}

          {/* Re-run onboarding */}
          <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--border-dim)' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '10px' }}>
              Onboarding
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '14px' }}>
              Re-run the setup flow to re-scan your profiles, update genres, and refresh your gig calendar from RA.
            </div>
            <button
              onClick={() => {
                if (confirm('This will re-run the onboarding flow. Your existing data stays — anything found will update on top.')) {
                  window.location.href = '/onboarding'
                }
              }}
              className="btn-secondary"
              style={{ borderColor: 'var(--border)' }}
            >
              Re-run onboarding →
            </button>
          </div>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', border: '1px solid var(--border-dim)', marginTop: '4px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text)' }}>Remove Signal Lab OS from invoices</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '3px' }}>Hides the Signal Lab OS logo from invoice footers</div>
                </div>
                <button
                  onClick={() => setPayment(p => ({ ...p, hide_invoice_branding: !p.hide_invoice_branding }))}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: payment.hide_invoice_branding ? 'var(--gold)' : 'var(--border-dim)',
                    position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: payment.hide_invoice_branding ? 21 : 3,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </button>
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
                c => !(payment.bank_accounts || []).some((acc: BankAccount) => acc.currency === c && (acc.iban || acc.account_number))
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

            {(payment.bank_accounts || []).length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '16px' }}>No bank accounts added yet.</div>
            )}

            {(payment.bank_accounts || []).map((acct, i) => (
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

      {/* DOCUMENTS / VAULT TAB */}
      {activeTab === 'documents' && (
        <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Upload area */}
          <div className="card">
            <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '20px' }}>Upload document</div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Document type</label>
                <select
                  value={uploadType}
                  onChange={e => setUploadType(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
                >
                  {DOC_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `1px dashed ${dragOver ? 'var(--gold)' : 'var(--border-dim)'}`,
                background: dragOver ? 'rgba(176,141,87,0.06)' : 'transparent',
                padding: '32px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '12px', color: dragOver ? 'var(--gold)' : 'var(--text-dim)', marginBottom: '6px' }}>
                {uploading ? 'Uploading...' : 'Drop file here or click to browse'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', letterSpacing: '0.06em' }}>
                PDF, PNG, JPG, DOC, DOCX, CSV, XLSX
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.csv,.xlsx"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) uploadDocument(file)
                e.target.value = ''
              }}
            />
          </div>

          {uploadError && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(154,106,90,0.12)', border: '1px solid rgba(154,106,90,0.3)', fontSize: '12px', color: '#c97a7a' }}>
              {uploadError}
            </div>
          )}

          {/* Document list grouped by type */}
          {docsLoading ? (
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>Loading documents...</div>
          ) : documents.length === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>No documents uploaded yet.</div>
          ) : (
            DOC_TYPES.map(docType => {
              const group = documents.filter(d => d.type === docType.value)
              if (group.length === 0) return null
              return (
                <div key={docType.value} className="card">
                  <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>{docType.label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {group.map(doc => (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dim)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>
                              {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>
                              {formatFileSize(doc.file_size)}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginLeft: '16px', flexShrink: 0 }}>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                            style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', textDecoration: 'none', display: 'inline-block' }}>
                            View
                          </a>
                          <button onClick={() => deleteDocument(doc.id)}
                            style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', cursor: 'pointer' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.borderColor = '#ef4444' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* PROMO LIST TAB */}
      {activeTab === 'promo' && (
        <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>Promo list</div>
              <button
                onClick={() => { setShowAddPromo(true); setEditingPromoId(null); setPromoForm({ name: '', email: '', whatsapp: '', instagram: '', tag: '' }) }}
                style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', background: 'none', border: '1px solid var(--gold-dim)', padding: '5px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
              >
                + Add contact
              </button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '24px' }}>
              DJs, label contacts, blogs, press and mates — the people you send releases to.
            </div>

            {/* Add / Edit form */}
            {(showAddPromo || editingPromoId) && (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '20px', marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '16px' }}>
                  {editingPromoId ? 'Edit contact' : 'New contact'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input value={promoForm.name} onChange={e => setPromoForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Name or alias" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Tag</label>
                    <select value={promoForm.tag} onChange={e => setPromoForm(f => ({ ...f, tag: e.target.value }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">No tag</option>
                      {PROMO_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={promoForm.email} onChange={e => setPromoForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="email@example.com" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>WhatsApp</label>
                    <input value={promoForm.whatsapp} onChange={e => setPromoForm(f => ({ ...f, whatsapp: e.target.value }))}
                      placeholder="+447700900123" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Instagram</label>
                    <input value={promoForm.instagram} onChange={e => setPromoForm(f => ({ ...f, instagram: e.target.value }))}
                      placeholder="handle (no @)" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    disabled={!promoForm.name.trim()}
                    onClick={async () => {
                      if (!promoForm.name.trim()) return
                      let updated: PromoContact[]
                      if (editingPromoId) {
                        updated = promoList.map(c => c.id === editingPromoId ? {
                          ...c,
                          name: promoForm.name,
                          email: promoForm.email || undefined,
                          whatsapp: promoForm.whatsapp || undefined,
                          instagram: promoForm.instagram || undefined,
                          tag: promoForm.tag || undefined,
                        } : c)
                      } else {
                        updated = [...promoList, {
                          id: crypto.randomUUID(),
                          name: promoForm.name,
                          email: promoForm.email || undefined,
                          whatsapp: promoForm.whatsapp || undefined,
                          instagram: promoForm.instagram || undefined,
                          tag: promoForm.tag || undefined,
                        }]
                      }
                      setPromoList(updated)
                      setShowAddPromo(false)
                      setEditingPromoId(null)
                      setPromoSaving(true)
                      try {
                        await fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ promo_list: updated }),
                        })
                        setPromoSaved(true)
                        setTimeout(() => setPromoSaved(false), 2000)
                      } finally { setPromoSaving(false) }
                    }}
                    style={{
                      background: promoForm.name.trim() ? 'var(--gold)' : 'var(--border-dim)',
                      color: '#070706', border: 'none', padding: '10px 20px',
                      fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
                      cursor: promoForm.name.trim() ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {editingPromoId ? 'Update' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setShowAddPromo(false); setEditingPromoId(null) }}
                    style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dimmer)', padding: '10px 20px', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Contact list */}
            {promoList.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', padding: '20px 0' }}>No contacts yet — add your first promo contact above.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {promoList.map(contact => (
                  <div key={contact.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text)' }}>{contact.name}</span>
                        {contact.tag && (
                          <span style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid rgba(176,141,87,0.3)', padding: '2px 6px' }}>
                            {contact.tag}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {contact.email && <span style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>✉ {contact.email}</span>}
                        {contact.whatsapp && <span style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>WhatsApp {contact.whatsapp}</span>}
                        {contact.instagram && <span style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>@ {contact.instagram}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setEditingPromoId(contact.id)
                          setShowAddPromo(false)
                          setPromoForm({
                            name: contact.name,
                            email: contact.email || '',
                            whatsapp: contact.whatsapp || '',
                            instagram: contact.instagram || '',
                            tag: contact.tag || '',
                          })
                        }}
                        style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)', background: 'none', border: '1px solid var(--border-dim)', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          const updated = promoList.filter(c => c.id !== contact.id)
                          setPromoList(updated)
                          await fetch('/api/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ promo_list: updated }),
                          })
                        }}
                        style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)', background: 'none', border: '1px solid var(--border-dim)', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.borderColor = '#ef4444' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {promoSaved && (
              <div style={{ marginTop: '12px', fontSize: '10px', color: 'var(--green)', letterSpacing: '0.1em' }}>Promo list saved ✓</div>
            )}
          </div>
        </div>
      )}

      </div>{/* end inner padding */}
    </div>
  )
}
