'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface ContractData {
  artist_name: string
  venue: string
  location: string
  show_date: string
  show_time: string
  total_fee: number
  currency: string
  deposit_percent: number
  deposit_amount: number
  balance_amount: number
  deposit_due_date: string
  balance_due_date: string
  promoter_name: string
  promoter_email: string
  payment_terms: string
  notes: string
}

export default function ContractParser() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [contract, setContract] = useState<ContractData | null>(null)
  const [creating, setCreating] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  const inputStyle = {
    width: '100%', background: s.bg, border: `1px solid ${s.border}`,
    color: s.text, fontFamily: s.font, fontSize: '13px',
    padding: '10px 14px', outline: 'none', boxSizing: 'border-box' as const,
  }

  async function parseContract() {
    if (!file) return
    setParsing(true)
    setError('')

    try {
      // Convert PDF to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: 'You are an expert at reading music industry contracts. Extract key financial and logistical details. Return ONLY valid JSON, no markdown, no explanation.',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 }
              },
              {
                type: 'text',
                text: `Extract the following from this performance contract and return as JSON:
{
  "artist_name": "string",
  "venue": "string",
  "location": "city, country",
  "show_date": "YYYY-MM-DD",
  "show_time": "HH:MM",
  "total_fee": number,
  "currency": "EUR|GBP|USD",
  "deposit_percent": number (0-100),
  "deposit_amount": number,
  "balance_amount": number,
  "deposit_due_date": "YYYY-MM-DD",
  "balance_due_date": "YYYY-MM-DD",
  "promoter_name": "string",
  "promoter_email": "string",
  "payment_terms": "brief description",
  "notes": "any other important details"
}
If any field is not found, use null for strings and 0 for numbers.`
              }
            ]
          }]
        })
      })

      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      setContract(parsed)

    } catch (err: any) {
      setError('Could not parse contract: ' + err.message)
    } finally {
      setParsing(false)
    }
  }

  async function createFromContract() {
    if (!contract) return
    setCreating(true)

    try {
      // 1. Create the gig
      const gigRes = await fetch('/api/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${contract.venue} — ${contract.show_date}`,
          venue: contract.venue,
          location: contract.location,
          date: contract.show_date,
          time: contract.show_time,
          fee: contract.total_fee,
          currency: contract.currency,
          status: 'confirmed',
          promoter_email: contract.promoter_email,
          notes: contract.notes,
        })
      })
      const gigData = await gigRes.json()
      const gigId = gigData.gig?.id

      // 2. Create deposit invoice
      if (contract.deposit_amount > 0) {
        await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gig_id: gigId,
            gig_title: `${contract.venue} — ${contract.show_date}`,
            amount: contract.deposit_amount,
            currency: contract.currency,
            type: 'deposit',
            status: 'pending',
            due_date: contract.deposit_due_date,
          })
        })
      }

      // 3. Create balance invoice
      if (contract.balance_amount > 0) {
        await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gig_id: gigId,
            gig_title: `${contract.venue} — ${contract.show_date}`,
            amount: contract.balance_amount,
            currency: contract.currency,
            type: 'balance',
            status: 'pending',
            due_date: contract.balance_due_date,
          })
        })
      }

      setDone(true)

    } catch (err: any) {
      setError('Failed to create records: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  function updateContract(key: keyof ContractData, value: string | number) {
    setContract(prev => prev ? { ...prev, [key]: value } : null)
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '48px 56px' }}>

      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
          Signal Lab — Contract parser
        </div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '36px', fontWeight: 200, letterSpacing: '0.03em', marginBottom: '8px' }}>
          Contract <span style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif', color: s.gold }}>parser</span>
        </div>
        <div style={{ fontSize: '14px', color: s.dimmer, lineHeight: '1.7' }}>
          Upload a performance contract PDF — Claude reads it and creates the gig record and invoices automatically.
        </div>
      </div>

      {done ? (
        <div style={{ background: s.panel, border: `1px solid ${s.gold}40`, padding: '48px', textAlign: 'center', maxWidth: '600px' }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 200, color: s.gold, marginBottom: '12px' }}>
            Done — gig and invoices created
          </div>
          <div style={{ fontSize: '13px', color: s.dim, marginBottom: '32px', lineHeight: '1.7' }}>
            {contract?.venue} has been added to your gigs with{' '}
            {(contract?.deposit_amount ?? 0) > 0 && (contract?.balance_amount ?? 0) > 0 ? 'deposit and balance invoices' :
             (contract?.deposit_amount ?? 0) > 0 ? 'a deposit invoice' : 'an invoice'} ready to track.
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button onClick={() => router.push('/gigs')} style={{ background: s.gold, color: '#070706', border: 'none', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '14px 28px', cursor: 'pointer' }}>
              View gigs →
            </button>
            <button onClick={() => router.push('/business/finances')} style={{ background: 'transparent', color: s.dim, border: `1px solid ${s.border}`, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '14px 28px', cursor: 'pointer' }}>
              View invoices
            </button>
          </div>
        </div>
      ) : !contract ? (
        <div style={{ maxWidth: '600px' }}>
          {/* DROP ZONE */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `1px dashed ${s.border}`, padding: '60px', textAlign: 'center', cursor: 'pointer', background: s.panel, marginBottom: '24px', transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = s.gold}
            onMouseLeave={e => e.currentTarget.style.borderColor = s.border}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = s.gold }}
            onDragLeave={e => e.currentTarget.style.borderColor = s.border}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') setFile(f); e.currentTarget.style.borderColor = s.border }}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            {file ? (
              <div>
                <div style={{ fontSize: '15px', color: s.gold, marginBottom: '6px' }}>{file.name}</div>
                <div style={{ fontSize: '11px', color: s.dimmer }}>{(file.size / 1024).toFixed(0)} KB · Click to change</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '15px', color: s.dim, marginBottom: '8px' }}>Drop contract PDF here</div>
                <div style={{ fontSize: '12px', color: s.dimmer }}>or click to browse · PDF only</div>
              </div>
            )}
          </div>

          {error && <div style={{ fontSize: '12px', color: '#8a4a3a', padding: '14px', border: '1px solid #4a2a1a', background: '#1a0a06', marginBottom: '16px' }}>{error}</div>}

          <button onClick={parseContract} disabled={!file || parsing} style={{
            background: file && !parsing ? s.gold : 'transparent',
            color: file && !parsing ? '#070706' : s.dimmer,
            border: `1px solid ${file && !parsing ? s.gold : s.border}`,
            fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
            textTransform: 'uppercase', padding: '16px 36px',
            cursor: file && !parsing ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: '12px',
            width: '100%', justifyContent: 'center',
          }}>
            {parsing && <div style={{ width: '12px', height: '12px', border: `1px solid #070706`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
            {parsing ? 'Reading contract...' : 'Parse contract →'}
          </button>

          <div style={{ marginTop: '32px', background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>What gets created</div>
            {[
              'Gig record — venue, date, time, location, fee',
              'Deposit invoice — amount + due date from contract',
              'Balance invoice — remaining amount + due date',
              'Promoter email saved for advance requests',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: i < 3 ? `1px solid ${s.border}` : 'none', fontSize: '12px', color: s.dimmer }}>
                <span style={{ color: s.gold, opacity: 0.5 }}>→</span>{item}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* CONTRACT REVIEW */
        <div style={{ maxWidth: '800px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ display: 'block', width: '20px', height: '1px', background: s.gold }} />
            Review — edit anything before creating
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

            {/* SHOW */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Show details</div>
              {[
                { l: 'Venue', k: 'venue' as keyof ContractData },
                { l: 'Location', k: 'location' as keyof ContractData },
                { l: 'Date', k: 'show_date' as keyof ContractData },
                { l: 'Time', k: 'show_time' as keyof ContractData },
              ].map(f => (
                <div key={f.k} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '6px' }}>{f.l}</div>
                  <input value={contract[f.k] as string || ''} onChange={e => updateContract(f.k, e.target.value)} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* FINANCIALS */}
            <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Financials</div>
              {[
                { l: 'Total fee', k: 'total_fee' as keyof ContractData },
                { l: 'Deposit amount', k: 'deposit_amount' as keyof ContractData },
                { l: 'Deposit due', k: 'deposit_due_date' as keyof ContractData },
                { l: 'Balance amount', k: 'balance_amount' as keyof ContractData },
                { l: 'Balance due', k: 'balance_due_date' as keyof ContractData },
              ].map(f => (
                <div key={f.k} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '6px' }}>{f.l}</div>
                  <input value={contract[f.k] as string || ''} onChange={e => updateContract(f.k, e.target.value)} style={inputStyle} />
                </div>
              ))}
            </div>
          </div>

          {/* PROMOTER */}
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px', marginBottom: '24px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>Promoter</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { l: 'Name', k: 'promoter_name' as keyof ContractData },
                { l: 'Email', k: 'promoter_email' as keyof ContractData },
              ].map(f => (
                <div key={f.k}>
                  <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '6px' }}>{f.l}</div>
                  <input value={contract[f.k] as string || ''} onChange={e => updateContract(f.k, e.target.value)} style={inputStyle} />
                </div>
              ))}
            </div>
          </div>

          {error && <div style={{ fontSize: '12px', color: '#8a4a3a', padding: '14px', border: '1px solid #4a2a1a', background: '#1a0a06', marginBottom: '16px' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={createFromContract} disabled={creating} style={{
              background: creating ? s.panel : s.gold,
              color: creating ? s.dimmer : '#070706',
              border: `1px solid ${creating ? s.border : s.gold}`,
              fontFamily: s.font, fontSize: '11px', letterSpacing: '0.2em',
              textTransform: 'uppercase', padding: '16px 36px',
              cursor: creating ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              {creating && <div style={{ width: '10px', height: '10px', border: `1px solid ${s.dimmer}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
              {creating ? 'Creating...' : 'Create gig + invoices →'}
            </button>
            <button onClick={() => setContract(null)} style={{
              background: 'transparent', color: s.dimmer,
              border: `1px solid ${s.border}`, fontFamily: s.font,
              fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase',
              padding: '16px 28px', cursor: 'pointer',
            }}>
              Re-upload
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
