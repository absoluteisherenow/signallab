'use client'

import { useState, useEffect } from 'react'

interface Invoice {
  id: string
  gig_title: string
  gig_id?: string
  amount: number
  currency: string
  type?: string
  status: 'pending' | 'paid'
  due_date?: string
  created_at?: string
  paid_at?: string
}

const MONTHLY_TEMPLATE = [
  { month: 'Oct', amount: 0 },
  { month: 'Nov', amount: 0 },
  { month: 'Dec', amount: 0 },
  { month: 'Jan', amount: 0 },
  { month: 'Feb', amount: 0 },
  { month: 'Mar', amount: 0 },
  { month: 'Apr', amount: 0 },
  { month: 'May', amount: 0 },
]

export default function Finances() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [monthly, setMonthly] = useState(MONTHLY_TEMPLATE)
  const [showAdd, setShowAdd] = useState(false)
  const [newInvoice, setNewInvoice] = useState({ gig_title: '', amount: '', currency: 'EUR', type: 'full', due_date: '' })
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Load invoices from Supabase
  useEffect(() => {
    fetchInvoices()
  }, [])

  async function fetchInvoices() {
    setLoading(true)
    try {
      const res = await fetch('/api/invoices')
      const data = await res.json()
      if (data.invoices) {
        setInvoices(data.invoices)
        updateMonthlyChart(data.invoices)
      }
    } catch {
      // Invoices load failed silently — empty state will show
    } finally {
      setLoading(false)
    }
  }

  function updateMonthlyChart(invoiceList: Invoice[]) {
    const monthlyData = [...MONTHLY_TEMPLATE]
    invoiceList.forEach(inv => {
      if (inv.status === 'paid' || inv.created_at) {
        const date = new Date(inv.paid_at || inv.created_at || new Date())
        const monthIndex = date.getMonth()
        monthlyData[monthIndex].amount += inv.amount
      }
    })
    setMonthly(monthlyData)
  }

  const paid = invoices.filter(i => i.status === 'paid').reduce((a, i) => a + i.amount, 0)
  const pending = invoices.filter(i => i.status === 'pending').reduce((a, i) => a + i.amount, 0)
  const total = paid + pending
  const maxMonthly = Math.max(...monthly.map(m => m.amount))

  async function markPaid(id: string) {
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'paid' }),
      })
      const data = await res.json()
      if (data.success) {
        setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'paid' } : i))
        updateMonthlyChart(invoices.map(i => i.id === id ? { ...i, status: 'paid' } : i))
        showToast('Invoice marked as paid')
      }
    } catch (err) {
      showToast('Failed to mark as paid')
    }
  }

  async function addInvoice() {
    if (!newInvoice.gig_title || !newInvoice.amount) return
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gig_title: newInvoice.gig_title,
          amount: parseInt(newInvoice.amount),
          currency: newInvoice.currency,
          type: newInvoice.type,
          due_date: newInvoice.due_date,
        }),
      })
      const data = await res.json()
      if (data.success || data.invoice) {
        setNewInvoice({ gig_title: '', amount: '', currency: 'EUR', type: 'full', due_date: '' })
        setShowAdd(false)
        showToast('Invoice added')
        fetchInvoices()
      }
    } catch (err) {
      showToast('Failed to add invoice')
    }
  }

  function exportCSV() {
    const rows = ['Gig,Amount,Currency,Type,Status,Due Date']
    invoices.forEach(i => rows.push(`${i.gig_title},${i.amount},${i.currency},${i.type || ''},${i.status},${i.due_date || ''}`))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'artist-os-finances.csv'
    a.click()
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh', padding: '40px 48px' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ display: 'block', width: '28px', height: '1px', background: 'var(--gold)' }} />
            Tour Lab — Finances
          </div>
          <div className="display" style={{ fontSize: '28px', letterSpacing: '0.04em' }}>Finances</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={exportCSV} className="btn-secondary" style={{ padding: '10px 20px', fontSize: '10px' }}>
            Export CSV
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-gold" style={{ padding: '10px 20px', fontSize: '10px' }}>
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
          { label: 'This month', value: `€${monthly[monthly.length - 1].amount.toLocaleString()}`, sub: 'April 2026' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--panel)', border: `1px solid ${stat.alert ? 'rgba(138, 74, 58, 0.25)' : 'var(--border-dim)'}`, padding: '24px 28px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '12px' }}>{stat.label}</div>
            <div className="display" style={{ fontSize: '28px', color: stat.alert ? 'var(--gold-bright)' : stat.green ? 'var(--green)' : 'var(--text)', marginBottom: '6px' }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--border)' }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* CHART */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '24px' }}>Monthly income</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '80px' }}>
          {monthly.map((m, i) => (
            <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '100%',
                height: `${maxMonthly > 0 ? (m.amount / maxMonthly) * 72 : 2}px`,
                background: i >= monthly.length - 2 ? 'linear-gradient(180deg, var(--gold), #7a5a28)' : 'linear-gradient(180deg, var(--border), var(--border-dim))',
                transition: 'height 0.4s ease',
              }} />
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>{m.month}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ADD INVOICE FORM */}
      {showAdd && (
        <div className="card" style={{ border: '1px solid rgba(176, 141, 87, 0.25)', marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '20px' }}>New invoice</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Gig / show', key: 'gig_title', placeholder: 'Electric Nights Festival' },
              { label: 'Amount', key: 'amount', placeholder: '5000' },
              { label: 'Due date', key: 'due_date', placeholder: '2026-04-16' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>{f.label}</div>
                <input value={newInvoice[f.key as keyof typeof newInvoice]} onChange={e => setNewInvoice(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Type</div>
              <select value={newInvoice.type} onChange={e => setNewInvoice(p => ({ ...p, type: e.target.value }))}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none' }}>
                <option value="deposit">Deposit</option>
                <option value="balance">Balance</option>
                <option value="full">Full fee</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addInvoice} className="btn-primary" style={{ padding: '12px 24px', fontSize: '10px' }}>Save invoice</button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary" style={{ padding: '12px 24px', fontSize: '10px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* INVOICE TABLE */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 100px 120px', gap: '0', padding: '12px 24px', borderBottom: '1px solid var(--border-dim)' }}>
          {['Show', 'Due date', 'Type', 'Amount', 'Status', ''].map(h => (
            <div key={h} style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-dimmer)', fontSize: '13px' }}>Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: '64px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '16px' }}>No invoices yet</div>
            <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginBottom: '8px' }}>Invoices are created automatically when you add a gig.</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', marginBottom: '28px' }}>Or create one manually using the button above.</div>
            <a href="/gigs/new" style={{ display: 'inline-block', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)', border: '1px solid rgba(176, 141, 87, 0.4)', padding: '12px 24px', textDecoration: 'none' }}>Add a gig →</a>
          </div>
        ) : (
          invoices.map((inv, i) => (
            <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 100px 100px 120px', gap: '0', padding: '16px 24px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border-dim)' : 'none', alignItems: 'center', opacity: inv.status === 'paid' ? 0.5 : 1 }}>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text)' }}>{inv.gig_title}</div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</div>
              <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>{inv.type || '—'}</div>
              <div style={{ fontSize: '14px', color: 'var(--text)' }}>{inv.currency}€{inv.amount.toLocaleString()}</div>
              <div>
                <span style={{
                  fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: inv.status === 'paid' ? 'var(--green)' : 'var(--gold-bright)',
                  background: inv.status === 'paid' ? 'rgba(61, 107, 74, 0.125)' : 'rgba(201, 164, 110, 0.1)',
                  padding: '4px 10px',
                }}>{inv.status}</span>
              </div>
              <div>
                {inv.status === 'pending' && (
                  <button onClick={() => markPaid(inv.id)} style={{ background: 'transparent', border: 'rgba(61, 107, 74, 0.25)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', cursor: 'pointer', transition: 'all 0.15s' }}>
                    Mark paid
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {toast && (
        <div className="toast">
          <div className="toast-label">Finances</div>
          {toast}
        </div>
      )}
    </div>
  )
}
