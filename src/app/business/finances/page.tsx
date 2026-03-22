'use client'

import { useState } from 'react'

interface Invoice {
  id: string
  gig: string
  venue: string
  date: string
  amount: number
  currency: string
  type: 'deposit' | 'balance' | 'full'
  status: 'pending' | 'paid' | 'overdue'
  due_date: string
}

const SAMPLE: Invoice[] = [
  { id: '1', gig: 'Electric Nights Festival', venue: 'Tresor Club', date: '2026-04-15', amount: 2500, currency: 'EUR', type: 'deposit', status: 'paid', due_date: '2026-03-15' },
  { id: '2', gig: 'Electric Nights Festival', venue: 'Tresor Club', date: '2026-04-15', amount: 2500, currency: 'EUR', type: 'balance', status: 'pending', due_date: '2026-04-16' },
  { id: '3', gig: 'Summer Series', venue: 'Melkweg', date: '2026-04-22', amount: 3500, currency: 'EUR', type: 'full', status: 'pending', due_date: '2026-04-23' },
  { id: '4', gig: 'Techno Sessions', venue: 'Ministry of Sound', date: '2026-05-01', amount: 6000, currency: 'EUR', type: 'full', status: 'pending', due_date: '2026-05-02' },
  { id: '5', gig: 'Open Air Summer', venue: 'Kaserne', date: '2026-05-15', amount: 3750, currency: 'EUR', type: 'deposit', status: 'paid', due_date: '2026-04-15' },
  { id: '6', gig: 'Open Air Summer', venue: 'Kaserne', date: '2026-05-15', amount: 3750, currency: 'EUR', type: 'balance', status: 'pending', due_date: '2026-05-16' },
]

const MONTHLY = [
  { month: 'Oct', amount: 4200 },
  { month: 'Nov', amount: 6800 },
  { month: 'Dec', amount: 3200 },
  { month: 'Jan', amount: 8500 },
  { month: 'Feb', amount: 5100 },
  { month: 'Mar', amount: 6250 },
  { month: 'Apr', amount: 14000 },
  { month: 'May', amount: 13250 },
]

export default function Finances() {
  const [invoices, setInvoices] = useState<Invoice[]>(SAMPLE)
  const [showAdd, setShowAdd] = useState(false)
  const [newInvoice, setNewInvoice] = useState({ gig: '', amount: '', currency: 'EUR', type: 'full', due_date: '' })
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const paid = invoices.filter(i => i.status === 'paid').reduce((a, i) => a + i.amount, 0)
  const pending = invoices.filter(i => i.status === 'pending').reduce((a, i) => a + i.amount, 0)
  const total = paid + pending
  const maxMonthly = Math.max(...MONTHLY.map(m => m.amount))

  function markPaid(id: string) {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'paid' } : i))
    showToast('Invoice marked as paid')
  }

  function addInvoice() {
    if (!newInvoice.gig || !newInvoice.amount) return
    const inv: Invoice = {
      id: Date.now().toString(),
      gig: newInvoice.gig,
      venue: '',
      date: new Date().toISOString().split('T')[0],
      amount: parseInt(newInvoice.amount),
      currency: newInvoice.currency,
      type: newInvoice.type as any,
      status: 'pending',
      due_date: newInvoice.due_date || new Date().toISOString().split('T')[0],
    }
    setInvoices(prev => [...prev, inv])
    setNewInvoice({ gig: '', amount: '', currency: 'EUR', type: 'full', due_date: '' })
    setShowAdd(false)
    showToast('Invoice added')
  }

  function exportCSV() {
    const rows = ['Gig,Venue,Date,Amount,Currency,Type,Status,Due Date']
    invoices.forEach(i => rows.push(`${i.gig},${i.venue},${i.date},${i.amount},${i.currency},${i.type},${i.status},${i.due_date}`))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'signal-lab-finances.csv'
    a.click()
  }

  const s = {
    bg: '#070706', panel: '#0e0d0b', border: '#1a1917',
    gold: '#b08d57', text: '#f0ebe2', dim: '#8a8780', dimmer: '#52504c',
    font: "'DM Mono', monospace",
  }

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '40px 48px' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
            Signal Lab — Finances
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '28px', fontWeight: 200, letterSpacing: '0.04em' }}>Finances</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={exportCSV} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dimmer, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer' }}>
            Export CSV
          </button>
          <button onClick={() => setShowAdd(!showAdd)} style={{ background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)', border: `1px solid ${s.gold}`, color: s.gold, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '10px 20px', cursor: 'pointer' }}>
            + Add invoice
          </button>
        </div>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginBottom: '32px' }}>
        {[
          { label: 'Total invoiced', value: `€${total.toLocaleString()}`, sub: 'All time' },
          { label: 'Received', value: `€${paid.toLocaleString()}`, sub: `${invoices.filter(i => i.status === 'paid').length} invoices paid`, green: true },
          { label: 'Outstanding', value: `€${pending.toLocaleString()}`, sub: `${invoices.filter(i => i.status === 'pending').length} awaiting payment`, alert: true },
          { label: 'This month', value: `€${MONTHLY[MONTHLY.length - 1].amount.toLocaleString()}`, sub: 'April 2026' },
        ].map(stat => (
          <div key={stat.label} style={{ background: s.panel, border: `1px solid ${stat.alert ? '#8a4a3a40' : s.border}`, padding: '24px 28px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '12px' }}>{stat.label}</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '28px', fontWeight: 200, color: stat.alert ? '#c9a46e' : stat.green ? '#3d6b4a' : s.text, marginBottom: '6px' }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: '#3a3835' }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* CHART */}
      <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '28px 32px', marginBottom: '24px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '24px' }}>Monthly income</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '80px' }}>
          {MONTHLY.map((m, i) => (
            <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '100%',
                height: `${(m.amount / maxMonthly) * 72}px`,
                background: i >= MONTHLY.length - 2 ? 'linear-gradient(180deg, #b08d57, #7a5a28)' : 'linear-gradient(180deg, #2e2c29, #1a1917)',
                transition: 'height 0.4s ease',
              }} />
              <div style={{ fontSize: '9px', color: s.dimmer }}>{m.month}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ADD INVOICE FORM */}
      {showAdd && (
        <div style={{ background: s.panel, border: `1px solid ${s.gold}40`, padding: '24px 28px', marginBottom: '24px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px' }}>New invoice</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Gig / show', key: 'gig', placeholder: 'Electric Nights Festival' },
              { label: 'Amount', key: 'amount', placeholder: '5000' },
              { label: 'Due date', key: 'due_date', placeholder: '2026-04-16' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>{f.label}</div>
                <input value={newInvoice[f.key as keyof typeof newInvoice]} onChange={e => setNewInvoice(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: '100%', background: '#070706', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: s.dimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Type</div>
              <select value={newInvoice.type} onChange={e => setNewInvoice(p => ({ ...p, type: e.target.value }))}
                style={{ width: '100%', background: '#070706', border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '13px', padding: '10px 14px', outline: 'none' }}>
                <option value="deposit">Deposit</option>
                <option value="balance">Balance</option>
                <option value="full">Full fee</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addInvoice} style={{ background: s.gold, color: '#070706', border: 'none', fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 24px', cursor: 'pointer' }}>Save invoice</button>
            <button onClick={() => setShowAdd(false)} style={{ background: 'transparent', color: s.dimmer, border: `1px solid ${s.border}`, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px 24px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* INVOICE TABLE */}
      <div style={{ background: s.panel, border: `1px solid ${s.border}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 100px 120px', gap: '0', padding: '12px 24px', borderBottom: `1px solid ${s.border}` }}>
          {['Show', 'Due date', 'Type', 'Amount', 'Status', ''].map(h => (
            <div key={h} style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>
        {invoices.map((inv, i) => (
          <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 100px 120px', gap: '0', padding: '16px 24px', borderBottom: i < invoices.length - 1 ? `1px solid ${s.border}` : 'none', alignItems: 'center', opacity: inv.status === 'paid' ? 0.5 : 1 }}>
            <div>
              <div style={{ fontSize: '13px', color: s.text }}>{inv.gig}</div>
              {inv.venue && <div style={{ fontSize: '11px', color: '#3a3835', marginTop: '2px' }}>{inv.venue}</div>}
            </div>
            <div style={{ fontSize: '12px', color: s.dim }}>{new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
            <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: s.dimmer, textTransform: 'uppercase' }}>{inv.type}</div>
            <div style={{ fontSize: '14px', color: s.text }}>€{inv.amount.toLocaleString()}</div>
            <div>
              <span style={{
                fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                color: inv.status === 'paid' ? '#3d6b4a' : '#c9a46e',
                background: inv.status === 'paid' ? '#3d6b4a20' : '#c9a46e15',
                padding: '4px 10px',
              }}>{inv.status}</span>
            </div>
            <div>
              {inv.status === 'pending' && (
                <button onClick={() => markPaid(inv.id)} style={{ background: 'transparent', border: `1px solid #3d6b4a40`, color: '#3d6b4a', fontFamily: s.font, fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', cursor: 'pointer', transition: 'all 0.15s' }}>
                  Mark paid
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '28px', right: '28px', background: 'rgba(14,13,11,0.96)', border: `1px solid ${s.border}`, padding: '14px 20px', fontSize: '12px', color: s.text, zIndex: 50, backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: s.gold, marginBottom: '4px', textTransform: 'uppercase' }}>Finances</div>
          {toast}
        </div>
      )}
    </div>
  )
}
