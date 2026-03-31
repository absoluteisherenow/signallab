'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const ALIGNMENT_ARTISTS = [
  'Bicep', 'Four Tet', 'Floating Points', 'Fred Again..', 'Aphex Twin',
  'Burial', 'Objekt', 'Blawan', 'Surgeon', 'Andy Stott',
  'Marcel Dettmann', 'Ben Klock', 'Paula Temple', 'Shackleton', 'Actress',
  'Shed', 'DJ Stingray', 'Karenn', 'Lone', 'DJ Koze',
  'Recondite', 'Jon Hopkins', 'Headless Horseman', 'Phase Fatale',
]


type BankAccount = {
  currency: string
  label: string
  accountName: string
  bankName: string
  iban: string
  sortCode: string
  bic: string
}

type AddingAccount = {
  currency: string
  label: string
  accountName: string
  bankName: string
  iban: string
  sortCode: string
  bic: string
  uploading: boolean
  uploadError: string
  extracted: boolean
  showManual: boolean
}

function emptyAdding(): AddingAccount {
  return { currency: '', label: '', accountName: '', bankName: '', iban: '', sortCode: '', bic: '', uploading: false, uploadError: '', extracted: false, showManual: false }
}

async function saveProfile(profile: Record<string, unknown>) {
  const existing = await fetch('/api/settings').then(r => r.json()).catch(() => ({}))
  const current = existing.settings || {}
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile: { ...current.profile, ...profile },
      team: current.team || [],
      advance: current.advance || {},
    }),
  })
}

export default function Onboarding() {
  const router = useRouter()

  // Steps: 0=name, 1=alignment, 2=business, 3=saving
  const [step, setStep] = useState(0)

  // Step 0
  const [artistName, setArtistName] = useState('')
  const [discovery, setDiscovery] = useState<{ found: boolean; sources?: string[]; genre?: string; bpmRange?: string; country?: string; bio?: string; tracks?: { title: string; bpm: number }[] } | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const discoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 1 — alignment
  const [aligned, setAligned] = useState<string[]>([])
  const [customArtist, setCustomArtist] = useState('')

  // Step 2 — business
  const [mgmtName, setMgmtName] = useState('')
  const [mgmtEmail, setMgmtEmail] = useState('')
  const [bookingName, setBookingName] = useState('')
  const [bookingEmail, setBookingEmail] = useState('')
  const [label, setLabel] = useState('')

  // Step 2 — bank accounts (multi-currency)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [adding, setAdding] = useState<AddingAccount | null>(null)
  const bankFileRef = useRef<HTMLInputElement>(null)

  // Step 2 — VAT
  const [vatRegistered, setVatRegistered] = useState(false)
  const [vatNumber, setVatNumber] = useState('')

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  const input: React.CSSProperties = {
    width: '100%', background: s.bg, border: `1px solid ${s.border}`,
    color: s.text, fontFamily: s.font, fontSize: '13px',
    padding: '11px 14px', outline: 'none', boxSizing: 'border-box',
  }

  const panelInput: React.CSSProperties = {
    ...input, background: s.panel,
  }

  useEffect(() => {
    if (discoverTimer.current) clearTimeout(discoverTimer.current)
    if (artistName.trim().length < 3) { setDiscovery(null); return }
    setDiscovering(true)
    discoverTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/onboarding/discover?name=${encodeURIComponent(artistName.trim())}`)
        const data = await res.json()
        setDiscovery(data)
      } catch { setDiscovery(null) } finally { setDiscovering(false) }
    }, 600)
    return () => { if (discoverTimer.current) clearTimeout(discoverTimer.current) }
  }, [artistName])

  function toggleArtist(name: string) {
    setAligned(prev =>
      prev.includes(name)
        ? prev.filter(a => a !== name)
        : prev.length < 5 ? [...prev, name] : prev
    )
  }

  function addCustomArtist() {
    const v = customArtist.trim()
    if (v && !aligned.includes(v) && aligned.length < 5) {
      setAligned(prev => [...prev, v])
      setCustomArtist('')
    }
  }

  function updateAdding(patch: Partial<AddingAccount>) {
    setAdding(prev => prev ? { ...prev, ...patch } : null)
  }

  async function uploadBankFile(file: File) {
    updateAdding({ uploading: true, uploadError: '', extracted: false })
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/onboarding/extract-bank', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.success) {
        updateAdding({ uploading: false, uploadError: data.error || 'Could not extract — enter manually.', showManual: true })
      } else {
        const d = data.details
        updateAdding({
          uploading: false,
          extracted: true,
          showManual: true,
          currency: d.currency || '',
          accountName: d.accountName || '',
          bankName: d.bankName || '',
          iban: d.iban || '',
          sortCode: d.sortCode || '',
          bic: d.bic || '',
        })
      }
    } catch {
      updateAdding({ uploading: false, uploadError: 'Upload failed — enter manually.', showManual: true })
    }
  }

  function saveAccount() {
    if (!adding) return
    const acct: BankAccount = {
      currency: adding.currency,
      label: adding.label,
      accountName: adding.accountName,
      bankName: adding.bankName,
      iban: adding.iban,
      sortCode: adding.sortCode,
      bic: adding.bic,
    }
    setBankAccounts(prev => [...prev, acct])
    setAdding(null)
  }

  async function finish() {
    setStep(3)
    await saveProfile({
      name: artistName,
      soundsLike: aligned,
      genre: discovery?.genre || 'Electronic',
      bpmRange: discovery?.bpmRange || '',
      management: mgmtName ? { name: mgmtName, email: mgmtEmail } : null,
      booking: bookingName ? { name: bookingName, email: bookingEmail } : null,
      label: label || null,
      bankAccounts: bankAccounts.length > 0 ? bankAccounts : null,
      vatRegistered,
      vatNumber: vatRegistered && vatNumber ? vatNumber : null,
    })
    router.push('/dashboard')
  }

  const progressDots = (current: number) => (
    <div style={{ display: 'flex', gap: '6px', marginTop: '32px', justifyContent: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i <= current ? s.gold : s.border, transition: 'background 0.2s' }} />
      ))}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: s.font, padding: '40px' }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>

        {/* ── STEP 0 — ARTIST NAME ── */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.4em', color: s.gold, textTransform: 'uppercase', marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
              Signal Lab OS
              <span style={{ display: 'block', width: '40px', height: '1px', background: s.gold }} />
            </div>

            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: '16px' }}>
              Let&apos;s set up<br />
              <span style={{ color: s.gold }}>your OS.</span>
            </div>
            <p style={{ fontSize: '13px', color: s.dim, lineHeight: '1.9', marginBottom: '40px' }}>
              Three quick steps. Everything in the system — content, advances, invoices — runs from what you tell us here.
            </p>

            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Artist or act name</div>
              <input
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && artistName.trim()) setStep(1) }}
                placeholder="Night Manoeuvres"
                style={panelInput}
                autoFocus
              />

              {discovering && (
                <div style={{ fontSize: 10, color: s.dimmer, letterSpacing: '0.12em', marginTop: 8 }}>Searching Beatport...</div>
              )}

              {discovery?.found && !discovering && (
                <div style={{ background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.18)', padding: '12px 16px', marginTop: 10 }}>
                  <div style={{ fontSize: '9px', color: s.gold, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Found · {discovery.sources?.join(' + ').toUpperCase()}
                  </div>
                  {discovery.tracks && discovery.tracks.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: 8 }}>
                      {discovery.tracks.map((t, i) => (
                        <div key={i} style={{ fontSize: '10px', color: s.dim, background: 'rgba(255,255,255,0.03)', border: `1px solid ${s.border}`, padding: '4px 10px' }}>
                          {t.title}{t.bpm ? ` · ${t.bpm}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {discovery.genre && <div style={{ fontSize: '10px', color: s.dimmer }}>Genre: {discovery.genre}</div>}
                    {discovery.country && <div style={{ fontSize: '10px', color: s.dimmer }}>Based in: {discovery.country}</div>}
                  </div>
                  {discovery.bio && (
                    <div style={{ fontSize: '11px', color: s.dimmer, marginTop: 8, lineHeight: 1.6, borderTop: `1px solid ${s.border}`, paddingTop: 8 }}>
                      {discovery.bio}…
                    </div>
                  )}
                </div>
              )}

              {discovery && !discovery.found && !discovering && artistName.trim().length >= 3 && (
                <div style={{ fontSize: '10px', color: s.dimmer, marginTop: 8, letterSpacing: '0.08em' }}>
                  Not found on Beatport — no problem, continue.
                </div>
              )}
            </div>

            <button
              onClick={() => setStep(1)}
              disabled={!artistName.trim()}
              style={{
                background: artistName.trim() ? s.gold : 'transparent',
                color: artistName.trim() ? '#070706' : s.dimmer,
                border: `1px solid ${artistName.trim() ? s.gold : s.border}`,
                fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
                textTransform: 'uppercase', padding: '18px',
                cursor: artistName.trim() ? 'pointer' : 'default',
                width: '100%', transition: 'all 0.2s',
              }}
            >
              Next →
            </button>

            {progressDots(0)}
          </div>
        )}

        {/* ── STEP 1 — ALIGNMENT PICKER ── */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'block', width: '24px', height: '1px', background: s.gold }} />
              Step 2 of 3 — Your sound
            </div>

            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '12px' }}>
              Who are you<br />most aligned with?
            </div>
            <div style={{ fontSize: '13px', color: s.dim, marginBottom: '32px', lineHeight: '1.7' }}>
              Pick up to 5. Shapes how the OS understands your sound across everything.
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {ALIGNMENT_ARTISTS.map(name => {
                const selected = aligned.includes(name)
                const maxed = aligned.length >= 5 && !selected
                return (
                  <button
                    key={name}
                    onClick={() => !maxed && toggleArtist(name)}
                    style={{
                      background: selected ? 'rgba(176,141,87,0.12)' : s.panel,
                      border: `1px solid ${selected ? s.gold : '#2a2926'}`,
                      color: selected ? s.gold : maxed ? s.dimmer : s.dim,
                      fontFamily: s.font, fontSize: '12px', letterSpacing: '0.08em',
                      padding: '10px 18px', cursor: maxed ? 'default' : 'pointer',
                      transition: 'all 0.15s', opacity: maxed ? 0.45 : 1,
                    }}
                  >
                    {name}
                  </button>
                )
              })}

              {aligned.filter(a => !ALIGNMENT_ARTISTS.includes(a)).map(name => (
                <button
                  key={name}
                  onClick={() => toggleArtist(name)}
                  style={{
                    background: 'rgba(176,141,87,0.12)', border: `1px solid ${s.gold}`,
                    color: s.gold, fontFamily: s.font, fontSize: '12px', letterSpacing: '0.08em',
                    padding: '10px 18px', cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  {name} <span style={{ fontSize: '14px', lineHeight: 1, color: s.dimmer }}>×</span>
                </button>
              ))}
            </div>

            {aligned.length < 5 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  value={customArtist}
                  onChange={e => setCustomArtist(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomArtist() }}
                  placeholder="Add your own artist..."
                  style={{ ...panelInput, flex: 1, fontSize: '12px', padding: '10px 14px' }}
                />
                <button
                  onClick={addCustomArtist}
                  disabled={!customArtist.trim()}
                  style={{
                    background: 'transparent', border: `1px solid ${s.border}`,
                    color: s.dim, fontFamily: s.font, fontSize: '10px',
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    padding: '10px 16px', cursor: customArtist.trim() ? 'pointer' : 'default',
                    opacity: customArtist.trim() ? 1 : 0.4, flexShrink: 0,
                  }}
                >
                  Add
                </button>
              </div>
            )}

            {aligned.length > 0 && (
              <div style={{ fontSize: '10px', color: s.dimmer, letterSpacing: '0.1em', marginBottom: '24px', marginTop: '8px' }}>
                {aligned.length} selected{aligned.length === 5 ? ' — max reached' : ''}
              </div>
            )}

            <button
              onClick={() => setStep(2)}
              disabled={aligned.length === 0}
              style={{
                background: aligned.length > 0 ? s.gold : 'transparent',
                color: aligned.length > 0 ? '#070706' : s.dimmer,
                border: `1px solid ${aligned.length > 0 ? s.gold : s.border}`,
                fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
                textTransform: 'uppercase', padding: '18px',
                cursor: aligned.length > 0 ? 'pointer' : 'default',
                width: '100%', transition: 'all 0.2s',
              }}
            >
              Next →
            </button>
            <button
              onClick={() => setStep(2)}
              style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.1em', padding: '14px', cursor: 'pointer', width: '100%', marginTop: '4px' }}
            >
              Skip
            </button>

            {progressDots(1)}
          </div>
        )}

        {/* ── STEP 2 — BUSINESS DETAILS ── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'block', width: '24px', height: '1px', background: s.gold }} />
              Step 3 of 3 — Your team
            </div>

            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '12px' }}>
              Management,<br />booking, label.
            </div>
            <div style={{ fontSize: '13px', color: s.dim, marginBottom: '32px', lineHeight: '1.7' }}>
              Optional — used for advance emails and contract comms. Add now or fill in Settings later.
            </div>

            {/* Management */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 22px', marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Management</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input value={mgmtName} onChange={e => setMgmtName(e.target.value)} placeholder="Name" style={input} />
                <input value={mgmtEmail} onChange={e => setMgmtEmail(e.target.value)} placeholder="Email" style={input} type="email" />
              </div>
            </div>

            {/* Booking */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 22px', marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Booking agent</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input value={bookingName} onChange={e => setBookingName(e.target.value)} placeholder="Name" style={input} />
                <input value={bookingEmail} onChange={e => setBookingEmail(e.target.value)} placeholder="Email" style={input} type="email" />
              </div>
            </div>

            {/* Label */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 22px', marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Label</div>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Ostgut Ton, Self-released" style={input} />
            </div>

            {/* Bank accounts — multi-currency */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 22px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase' }}>Payment details</div>
                {bankAccounts.length > 0 && !adding && (
                  <button
                    onClick={() => setAdding(emptyAdding())}
                    style={{ background: 'none', border: 'none', color: s.gold, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.12em', cursor: 'pointer', padding: 0 }}
                  >
                    + Add account
                  </button>
                )}
              </div>
              <div style={{ fontSize: '11px', color: s.dimmer, marginBottom: '14px' }}>Used to auto-fill invoices. Never shared.</div>

              {/* Saved accounts */}
              {bankAccounts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: adding ? '16px' : '0' }}>
                  {bankAccounts.map(acct => (
                    <div key={`${acct.currency}-${acct.label}-${acct.iban}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(176,141,87,0.06)', border: `1px solid rgba(176,141,87,0.2)`, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.gold, border: `1px solid ${s.gold}40`, padding: '2px 7px' }}>{acct.currency}</div>
                        <div style={{ fontSize: '12px', color: s.dim }}>{acct.label ? `${acct.label} · ` : ''}{acct.bankName || acct.accountName || acct.iban}</div>
                      </div>
                      <button
                        onClick={() => setBankAccounts(prev => prev.filter(a => a.currency !== acct.currency))}
                        style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '14px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add account form */}
              {adding && (
                <div style={{ border: `1px solid ${s.border}`, padding: '16px', marginTop: bankAccounts.length > 0 ? '0' : '0' }}>
                  {/* Optional label */}
                  <div style={{ marginBottom: '12px' }}>
                    <input
                      value={adding.label}
                      onChange={e => updateAdding({ label: e.target.value })}
                      placeholder="Label (optional) — e.g. Local, SWIFT, Revolut"
                      style={{ ...input, fontSize: '12px' }}
                    />
                  </div>

                  {/* Upload zone */}
                  {!adding.extracted && !adding.showManual && (
                    <div
                      onClick={() => bankFileRef.current?.click()}
                      style={{
                        border: `1px dashed ${adding.uploading ? s.gold : '#2a2926'}`,
                        padding: '24px 16px',
                        textAlign: 'center',
                        cursor: adding.uploading ? 'default' : 'pointer',
                        marginBottom: '8px',
                      }}
                    >
                      {adding.uploading ? (
                        <div style={{ fontSize: '12px', color: s.gold, letterSpacing: '0.1em' }}>Extracting details...</div>
                      ) : (
                        <>
                          <div style={{ fontSize: '12px', color: s.dim, marginBottom: '4px' }}>Upload a screenshot or bank statement</div>
                          <div style={{ fontSize: '10px', color: s.dimmer, letterSpacing: '0.08em' }}>JPG · PNG · WEBP · PDF</div>
                        </>
                      )}
                      <input
                        ref={bankFileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadBankFile(f) }}
                      />
                    </div>
                  )}

                  {adding.uploadError && (
                    <div style={{ fontSize: '11px', color: '#c06060', marginBottom: '10px' }}>{adding.uploadError}</div>
                  )}

                  {/* Manual fields */}
                  {adding.showManual && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '10px' }}>
                      {adding.extracted && (
                        <div style={{ fontSize: '10px', color: s.gold, letterSpacing: '0.1em', marginBottom: '4px' }}>Extracted — review and confirm</div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '7px' }}>
                        <input value={adding.currency} onChange={e => updateAdding({ currency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="EUR" style={input} />
                        <input value={adding.accountName} onChange={e => updateAdding({ accountName: e.target.value })} placeholder="Account name" style={input} />
                      </div>
                      <input value={adding.bankName} onChange={e => updateAdding({ bankName: e.target.value })} placeholder="Bank name" style={input} />
                      <input value={adding.iban} onChange={e => updateAdding({ iban: e.target.value })} placeholder="IBAN / Account number" style={input} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                        <input value={adding.sortCode} onChange={e => updateAdding({ sortCode: e.target.value })} placeholder="Sort code" style={input} />
                        <input value={adding.bic} onChange={e => updateAdding({ bic: e.target.value })} placeholder="BIC / SWIFT" style={input} />
                      </div>
                    </div>
                  )}

                  {/* Toggle manual / upload */}
                  {!adding.showManual && !adding.uploading && (
                    <button onClick={() => updateAdding({ showManual: true })} style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.08em', padding: '4px 0', cursor: 'pointer' }}>
                      Enter manually instead →
                    </button>
                  )}
                  {adding.showManual && !adding.extracted && (
                    <button onClick={() => updateAdding({ showManual: false, uploadError: '' })} style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.08em', padding: '4px 0', cursor: 'pointer' }}>
                      ← Upload instead
                    </button>
                  )}

                  {/* Save / cancel */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button
                      onClick={saveAccount}
                      disabled={!adding.iban && !adding.accountName}
                      style={{
                        flex: 1, background: (adding.iban || adding.accountName) ? s.gold : 'transparent',
                        color: (adding.iban || adding.accountName) ? '#070706' : s.dimmer,
                        border: `1px solid ${(adding.iban || adding.accountName) ? s.gold : s.border}`,
                        fontFamily: s.font, fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase',
                        padding: '10px', cursor: (adding.iban || adding.accountName) ? 'pointer' : 'default', transition: 'all 0.15s',
                      }}
                    >
                      Save account
                    </button>
                    <button
                      onClick={() => setAdding(null)}
                      style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.12em', padding: '10px 16px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Prompt to add first account */}
              {bankAccounts.length === 0 && !adding && (
                <button
                  onClick={() => setAdding(emptyAdding())}
                  style={{
                    width: '100%', background: 'transparent', border: `1px dashed ${s.border}`,
                    color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.12em',
                    padding: '16px', cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                >
                  + Add payment account
                </button>
              )}
            </div>

            {/* VAT */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 22px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: s.gold, textTransform: 'uppercase', marginBottom: '4px' }}>VAT registered</div>
                  <div style={{ fontSize: '11px', color: s.dimmer }}>Affects invoices and expense tracking</div>
                </div>
                <button
                  onClick={() => setVatRegistered(v => !v)}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                    background: vatRegistered ? s.gold : '#2a2926',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '3px',
                    left: vatRegistered ? '23px' : '3px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: vatRegistered ? '#070706' : s.dimmer,
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
              {vatRegistered && (
                <div style={{ marginTop: '14px' }}>
                  <input
                    value={vatNumber}
                    onChange={e => setVatNumber(e.target.value)}
                    placeholder="VAT number"
                    style={input}
                  />
                </div>
              )}
            </div>

            <button
              onClick={finish}
              style={{
                background: s.gold, color: '#070706', border: 'none',
                fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
                textTransform: 'uppercase', padding: '18px',
                cursor: 'pointer', width: '100%',
              }}
            >
              Finish setup →
            </button>
            <button
              onClick={finish}
              style={{ background: 'none', border: 'none', color: s.dimmer, fontFamily: s.font, fontSize: '11px', letterSpacing: '0.1em', padding: '14px', cursor: 'pointer', width: '100%', marginTop: '4px' }}
            >
              Skip — go to dashboard
            </button>

            {progressDots(2)}
          </div>
        )}

        {/* ── SAVING ── */}
        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '32px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.gold, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '20px', fontWeight: 300, color: s.gold, marginBottom: '12px' }}>
              Setting everything up...
            </div>
            <div style={{ fontSize: '13px', color: s.dim, lineHeight: '1.7' }}>Saving your profile</div>
            <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
          </div>
        )}

      </div>
    </div>
  )
}
