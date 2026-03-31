'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'

interface Invoice {
  id: string
  gig_title: string
  gig_id?: string
  artist_name?: string
  amount: number
  currency: string
  type?: string
  status: 'pending' | 'paid' | 'overdue'
  due_date?: string
  created_at?: string
  paid_at?: string
  wht_rate?: number
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
  const [newInvoice, setNewInvoice] = useState({ gig_title: '', amount: '', currency: '', type: 'full', due_date: '', wht_rate: '', location: '', artist_name: '', promoter: '' })
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [financeTab, setFinanceTab] = useState<'invoices' | 'expenses'>('invoices')
  const [statCurrency, setStatCurrency] = useState('GBP')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendEmail, setSendEmail] = useState<Record<string, string>>({})
  const pathname = usePathname()

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function currencyFromLocation(location: string): string {
    const loc = location.toLowerCase()
    if (/australia|melbourne|sydney|brisbane|perth|adelaide|hobart/.test(loc)) return 'AUD'
    if (/\buk\b|united kingdom|london|manchester|glasgow|bristol|edinburgh|leeds|birmingham/.test(loc)) return 'GBP'
    if (/\busa\b|united states|new york|los angeles|chicago|miami|san francisco/.test(loc)) return 'USD'
    return 'EUR'
  }

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
        // Default new invoice currency to the most recently added invoice's currency
        if (data.invoices.length > 0) {
          const recent = data.invoices[0]
          if (recent.currency) {
            setNewInvoice(p => p.currency ? p : { ...p, currency: recent.currency })
          }
        }
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

  // Group totals by currency
  const byCurrency = invoices.reduce((acc, i) => {
    const c = i.currency || 'EUR'
    if (!acc[c]) acc[c] = { paid: 0, pending: 0 }
    if (i.status === 'paid') acc[c].paid += i.amount
    else acc[c].pending += i.amount
    return acc
  }, {} as Record<string, { paid: number; pending: number }>)

  const availableCurrencies = Object.keys(byCurrency).sort()
  const paid = byCurrency[statCurrency]?.paid || 0
  const pending = byCurrency[statCurrency]?.pending || 0
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

  async function sendInvoice(inv: Invoice) {
    setSendingId(inv.id)
    try {
      const to = sendEmail[inv.id] || ''
      const res = await fetch(`/api/invoices/${inv.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      const data = await res.json()
      if (data.sent) {
        showToast(`Invoice sent to ${data.to}`)
      } else if (data.mailto) {
        window.open(data.mailto)
        showToast('Opened in mail client')
      } else {
        showToast('Send failed')
      }
    } catch {
      showToast('Send failed')
    } finally {
      setSendingId(null)
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
          wht_rate: newInvoice.wht_rate ? parseFloat(newInvoice.wht_rate) : null,
          artist_name: newInvoice.artist_name || null,
          notes: newInvoice.promoter || null,
        }),
      })
      const data = await res.json()
      if (data.success || data.invoice) {
        setNewInvoice({ gig_title: '', amount: '', currency: '', type: 'full', due_date: '', wht_rate: '', location: '', artist_name: '', promoter: '' })
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
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minHeight: '100vh' }}>

      <PageHeader
        section="Tour Lab"
        title="Finances"
        tabs={[
          { label: 'Gigs', href: '/gigs', active: pathname === '/gigs' || pathname.startsWith('/gigs/') },
          { label: 'Travel', href: '/logistics', active: pathname === '/logistics' },
          { label: 'Finances', href: '/business/finances', active: pathname === '/business/finances' },
          { label: 'Contracts', href: '/contracts', active: pathname === '/contracts' },
        ]}
        right={
          <>
            <button onClick={exportCSV} className="btn-secondary" style={{ padding: '10px 20px', fontSize: '10px' }}>Export CSV</button>
            <button onClick={() => setShowAdd(!showAdd)} className="btn-gold" style={{ padding: '10px 20px', fontSize: '10px' }}>+ Add invoice</button>
            <a href="/gigs/new" style={{ textDecoration: 'none', border: '1px solid var(--gold)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '10px 20px', display: 'inline-block' }}>+ New gig</a>
          </>
        }
      />

      <div style={{ padding: '40px 48px' }}>

      {/* Secondary tab — Invoices / Expenses */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '32px' }}>
        {(['invoices', 'expenses'] as const).map(t => (
          <button key={t} onClick={() => setFinanceTab(t)} style={{
            background: 'transparent', border: 'none',
            padding: '8px 0', marginRight: '20px',
            fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase',
            color: financeTab === t ? 'var(--text)' : 'rgba(240,235,226,0.3)',
            borderBottom: `2px solid ${financeTab === t ? 'var(--gold)' : 'transparent'}`,
            fontFamily: 'var(--font-mono)', fontWeight: financeTab === t ? 500 : 400,
            cursor: 'pointer', transition: 'color 0.12s',
          }}>
            {t === 'invoices' ? 'Invoices' : 'Expenses'}
          </button>
        ))}
      </div>

      {financeTab === 'invoices' && (<>

      {/* CURRENCY PICKER */}
      {availableCurrencies.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginRight: '8px' }}>View in</span>
          {availableCurrencies.map(c => (
            <button key={c} onClick={() => setStatCurrency(c)} style={{
              background: statCurrency === c ? 'rgba(176,141,87,0.15)' : 'transparent',
              border: `1px solid ${statCurrency === c ? 'rgba(176,141,87,0.6)' : 'var(--border-dim)'}`,
              color: statCurrency === c ? 'var(--gold)' : 'var(--text-dimmer)',
              fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em',
              padding: '4px 12px', cursor: 'pointer', transition: 'all 0.15s',
            }}>{c}</button>
          ))}
        </div>
      )}

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginBottom: '32px' }}>
        {[
          { label: 'Total invoiced', value: `${statCurrency} ${total.toLocaleString()}`, sub: 'All time' },
          { label: 'Received', value: `${statCurrency} ${paid.toLocaleString()}`, sub: `${invoices.filter(i => i.status === 'paid' && i.currency === statCurrency).length} invoices paid`, green: true },
          { label: 'Outstanding', value: `${statCurrency} ${pending.toLocaleString()}`, sub: `${invoices.filter(i => i.status === 'pending' && i.currency === statCurrency).length} awaiting payment`, alert: pending > 0 },
          { label: 'This month', value: `${statCurrency} ${(byCurrency[statCurrency] ? (byCurrency[statCurrency].paid + byCurrency[statCurrency].pending) : 0).toLocaleString()}`, sub: new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) },
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
          {/* Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px 1fr 80px', gap: '12px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Gig / show</div>
              <input value={newInvoice.gig_title} onChange={e => setNewInvoice(p => ({ ...p, gig_title: e.target.value }))}
                placeholder="Electric Nights Festival"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Amount</div>
              <input value={newInvoice.amount} onChange={e => setNewInvoice(p => ({ ...p, amount: e.target.value }))}
                placeholder="5000"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Currency</div>
              <input value={newInvoice.currency} onChange={e => setNewInvoice(p => ({ ...p, currency: e.target.value.toUpperCase() }))}
                placeholder="AUD"
                maxLength={3}
                style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${newInvoice.currency ? 'rgba(176,141,87,0.5)' : 'var(--border-dim)'}`, color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box', fontWeight: 600 }} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Due date</div>
              <input value={newInvoice.due_date} onChange={e => setNewInvoice(p => ({ ...p, due_date: e.target.value }))}
                placeholder="2026-04-16"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
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
          {/* Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Location (auto-sets currency)</div>
              <input value={newInvoice.location}
                onChange={e => {
                  const loc = e.target.value
                  const detected = currencyFromLocation(loc)
                  setNewInvoice(p => ({ ...p, location: loc, currency: detected }))
                }}
                placeholder="Melbourne, AU"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Billed to (promoter / company)</div>
              <input value={newInvoice.promoter}
                onChange={e => setNewInvoice(p => ({ ...p, promoter: e.target.value }))}
                placeholder="Festival Promotions Ltd"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Artist alias</div>
              <input value={newInvoice.artist_name}
                onChange={e => setNewInvoice(p => ({ ...p, artist_name: e.target.value }))}
                placeholder="ABSOLUTE. / Night Manoeuvres"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ fontSize: '9px', color: 'var(--text-dimmer)', marginTop: '5px', letterSpacing: '0.06em' }}>Leave blank to use profile name</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>WHT %</div>
              <input type="number" min="0" max="100" value={newInvoice.wht_rate} onChange={e => setNewInvoice(p => ({ ...p, wht_rate: e.target.value }))}
                placeholder="0"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ fontSize: '9px', color: 'var(--text-dimmer)', marginTop: '5px', letterSpacing: '0.06em' }}>International gigs only</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 110px 80px 100px 80px 120px 80px 80px', gap: '0', padding: '12px 24px', borderBottom: '1px solid var(--border-dim)' }}>
          {['Show', 'Due date', 'Type', 'Amount', 'WHT', 'Net', '', 'Send', 'Chase', ''].map((h, i) => (
            <div key={i} style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>{h}</div>
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
          invoices.map((inv, i) => {
            const whtAmount = inv.wht_rate ? Math.round(inv.amount * (inv.wht_rate / 100)) : 0
            const netAmount = inv.amount - whtAmount
            return (
            <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 110px 80px 100px 80px 120px 80px 80px', gap: '0', padding: '16px 24px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border-dim)' : 'none', alignItems: 'center', opacity: inv.status === 'paid' ? 0.5 : 1 }}>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text)' }}>{inv.gig_title}</div>
                {inv.artist_name && <div style={{ fontSize: '10px', color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '3px' }}>{inv.artist_name}</div>}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</div>
              <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>{inv.type || '—'}</div>
              <div style={{ fontSize: '13px', color: 'var(--text)' }}>{inv.currency} {inv.amount.toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: inv.wht_rate ? 'var(--gold-bright)' : 'var(--text-dimmer)' }}>
                {inv.wht_rate ? `${inv.wht_rate}%` : '—'}
              </div>
              <div style={{ fontSize: '13px', color: inv.wht_rate ? 'var(--text)' : 'var(--text-dimmer)' }}>
                {inv.wht_rate ? `${inv.currency} ${netAmount.toLocaleString()}` : '—'}
              </div>
              <div>
                <a href={`/api/invoices/${inv.id}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'}>
                  View →
                </a>
              </div>
              {/* Send invoice */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input
                    value={sendEmail[inv.id] || ''}
                    onChange={e => setSendEmail(p => ({ ...p, [inv.id]: e.target.value }))}
                    placeholder="email@co.com"
                    style={{ width: '0', flex: 1, background: 'var(--bg)', border: '1px solid var(--border-dim)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '4px 6px', outline: 'none', minWidth: 0 }}
                  />
                  <button
                    onClick={() => sendInvoice(inv)}
                    disabled={sendingId === inv.id}
                    style={{ background: 'transparent', border: '1px solid rgba(176,141,87,0.4)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 8px', cursor: sendingId === inv.id ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: sendingId === inv.id ? 0.5 : 1 }}>
                    {sendingId === inv.id ? '...' : 'Send →'}
                  </button>
                </div>
                <a href={`/api/invoices/${inv.id}/send`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '9px', letterSpacing: '0.08em', color: 'var(--text-dimmer)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'}>
                  Preview email ↗
                </a>
              </div>
              <div>
                {(inv.status === 'pending' || inv.status === 'overdue') && (
                  <button
                    onClick={() => {
                      const subject = encodeURIComponent(`Payment Follow-up — ${inv.gig_title || 'Invoice'}`)
                      const days = inv.due_date ? Math.floor((new Date().getTime() - new Date(inv.due_date).getTime()) / 86400000) : 0
                      const body = encodeURIComponent(`Hi,\n\nI wanted to follow up on the invoice for ${inv.gig_title || 'our recent show'} (${inv.currency} ${inv.amount?.toLocaleString()})${days > 0 ? `, which was due ${days} day${days !== 1 ? 's' : ''} ago` : ', which is coming due soon'}.\n\nPlease find the invoice here: ${window.location.origin}/api/invoices/${inv.id}\n\nLet me know if you have any questions.\n\nBest,\nAnthony\n\n--\nSignal Lab OS — Tailored Artist OS`)
                      window.open(`mailto:?subject=${subject}&body=${body}`)
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#c9a46e',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '0 8px',
                      fontFamily: 'inherit',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Chase →
                  </button>
                )}
              </div>
              <div>
                {inv.status === 'pending' && (
                  <button onClick={() => markPaid(inv.id)} style={{ background: 'transparent', border: 'rgba(61, 107, 74, 0.25)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', cursor: 'pointer', transition: 'all 0.15s' }}>
                    Mark paid
                  </button>
                )}
              </div>
            </div>
            )
          })
        )}
      </div>

      </>)}

      {financeTab === 'expenses' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '16px' }}>Expenses</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 400, color: 'var(--text)', marginBottom: '12px' }}>No expenses yet</div>
          <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', maxWidth: '360px', lineHeight: '1.7' }}>Track studio time, equipment, travel, and other costs against your income.</div>
        </div>
      )}

      {toast && (
        <div className="toast">
          <div className="toast-label">Finances</div>
          {toast}
        </div>
      )}

      </div>{/* end inner padding */}
    </div>
  )
}
