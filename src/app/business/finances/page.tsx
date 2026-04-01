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

interface Gig {
  id: string
  title: string
  date: string
  fee: number
  currency: string
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled'
  venue?: string
  location?: string
}

interface Expense {
  id: string
  date: string
  description: string
  category: string
  amount: number
  currency: string
  gig_id?: string | null
  receipt_url?: string | null
  created_at?: string
}

const EXPENSE_CATEGORIES = ['Studio', 'Equipment', 'Travel', 'Accommodation', 'Food', 'Marketing', 'Other']

function currencySymbol(c: string): string {
  const map: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CHF: 'CHF ', AUD: 'A$', CAD: 'C$', JPY: '¥' }
  return map[c] || c + ' '
}

function fmtCurrency(currency: string, amount: number, opts?: Intl.NumberFormatOptions): string {
  return `${currencySymbol(currency)}${amount.toLocaleString(undefined, opts)}`
}

function generateMonthlyTemplate(): { month: string; amount: number }[] {
  const now = new Date()
  const months: { month: string; amount: number }[] = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ month: d.toLocaleDateString('en-GB', { month: 'short' }), amount: 0 })
  }
  return months
}

function getNextThreeMonths(): { key: string; label: string }[] {
  const now = new Date()
  const months = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    })
  }
  return months
}

export default function Finances() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [gigs, setGigs] = useState<Gig[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [monthly, setMonthly] = useState(generateMonthlyTemplate)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [newInvoice, setNewInvoice] = useState({ gig_title: '', amount: '', currency: '', type: 'full', due_date: '', wht_rate: '', location: '', artist_name: '', promoter: '' })
  const [newExpense, setNewExpense] = useState({ date: new Date().toISOString().split('T')[0], description: '', category: 'Other', amount: '', currency: 'GBP', gig_id: '', receipt_url: '' })
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [financeTab, setFinanceTab] = useState<'invoices' | 'expenses'>('invoices')
  const [statCurrency, setStatCurrency] = useState('GBP')
  const [expenseCurrency, setExpenseCurrency] = useState('GBP')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendEmail, setSendEmail] = useState<Record<string, string>>({})
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editExpense, setEditExpense] = useState<Partial<Expense>>({})
  const [artistName, setArtistName] = useState('Artist')
  const pathname = usePathname()

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function currencyFromLocation(location: string): string {
    const loc = location.toLowerCase()
    if (/australia|melbourne|sydney|brisbane|perth|adelaide|hobart/.test(loc)) return 'AUD'
    if (/\buk\b|united kingdom|london|manchester|glasgow|bristol|edinburgh|leeds|birmingham/.test(loc)) return 'GBP'
    if (/\busa\b|united states|new york|los angeles|chicago|miami|san francisco/.test(loc)) return 'USD'
    return 'EUR'
  }

  useEffect(() => {
    fetchInvoices()
    fetchGigs()
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (d?.artist_name) setArtistName(d.artist_name)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (financeTab === 'expenses') {
      fetchExpenses()
    }
  }, [financeTab])

  async function fetchInvoices() {
    setLoading(true)
    try {
      const res = await fetch('/api/invoices')
      const data = await res.json()
      if (data.invoices) {
        setInvoices(data.invoices)
        updateMonthlyChart(data.invoices)
        if (data.invoices.length > 0) {
          const recent = data.invoices[0]
          if (recent.currency) {
            setNewInvoice(p => p.currency ? p : { ...p, currency: recent.currency })
          }
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  async function fetchGigs() {
    try {
      const res = await fetch('/api/gigs')
      const data = await res.json()
      if (data.gigs) setGigs(data.gigs)
    } catch {
      // silent
    }
  }

  async function fetchExpenses() {
    setExpensesLoading(true)
    try {
      const res = await fetch('/api/expenses')
      const data = await res.json()
      if (data.expenses) setExpenses(data.expenses)
    } catch {
      // silent
    } finally {
      setExpensesLoading(false)
    }
  }

  function updateMonthlyChart(invoiceList: Invoice[]) {
    const monthlyData = generateMonthlyTemplate()
    const now = new Date()
    invoiceList.forEach(inv => {
      if (inv.status === 'paid' || inv.created_at) {
        const date = new Date(inv.paid_at || inv.created_at || new Date())
        // Calculate how many months ago this invoice is relative to now
        const monthsAgo = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())
        const idx = 7 - monthsAgo // 7 = last index (current month)
        if (idx >= 0 && idx < monthlyData.length) {
          monthlyData[idx].amount += inv.amount
        }
      }
    })
    setMonthly(monthlyData)
  }

  // --- Forecast data ---
  const forecastMonths = getNextThreeMonths()
  const forecastData = forecastMonths.map(fm => {
    const confirmed = gigs
      .filter(g => g.status === 'confirmed' && g.date && g.date.startsWith(fm.key) && g.fee > 0)
      .reduce((s, g) => s + g.fee, 0)
    const pendingFees = gigs
      .filter(g => g.status === 'pending' && g.date && g.date.startsWith(fm.key) && g.fee > 0)
      .reduce((s, g) => s + g.fee, 0)
    const invoiced = invoices
      .filter(i => (i.status === 'pending' || i.status === 'overdue') && i.due_date && i.due_date.startsWith(fm.key))
      .reduce((s, i) => s + i.amount, 0)
    return { ...fm, confirmed, pendingFees, invoiced }
  })
  const maxForecast = Math.max(...forecastData.map(f => f.confirmed + f.pendingFees + f.invoiced), 1)

  // --- Invoice stats ---
  const byCurrency = invoices.reduce((acc, i) => {
    const c = i.currency || 'EUR'
    if (!acc[c]) acc[c] = { paid: 0, pending: 0 }
    if (i.status === 'paid') acc[c].paid += i.amount
    else acc[c].pending += i.amount
    return acc
  }, {} as Record<string, { paid: number; pending: number }>)

  const availableCurrencies = Object.keys(byCurrency).sort()
  const paidTotal = byCurrency[statCurrency]?.paid || 0
  const pendingTotal = byCurrency[statCurrency]?.pending || 0
  const grandTotal = paidTotal + pendingTotal
  const maxMonthly = Math.max(...monthly.map(m => m.amount))

  // --- Expense stats ---
  const now = new Date()
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const expensesByCurrency = expenses.reduce((acc, e) => {
    const c = e.currency || 'GBP'
    if (!acc[c]) acc[c] = 0
    acc[c] += e.amount
    return acc
  }, {} as Record<string, number>)
  const expenseCurrencies = Object.keys(expensesByCurrency).sort()

  const plCurrencies = Array.from(new Set([
    ...Object.keys(byCurrency),
    ...expenseCurrencies,
  ])).sort()

  const thisMonthExpTotal = expenses
    .filter(e => e.currency === expenseCurrency && e.date && e.date.startsWith(thisMonthKey))
    .reduce((s, e) => s + e.amount, 0)

  // --- Invoice actions ---
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
    } catch {
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
    } catch {
      showToast('Failed to add invoice')
    }
  }

  // --- Expense actions ---
  async function addExpense() {
    if (!newExpense.description || !newExpense.amount || !newExpense.date) return
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newExpense.date,
          description: newExpense.description,
          category: newExpense.category,
          amount: parseFloat(newExpense.amount),
          currency: newExpense.currency,
          gig_id: newExpense.gig_id || null,
          receipt_url: newExpense.receipt_url || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setNewExpense({ date: new Date().toISOString().split('T')[0], description: '', category: 'Other', amount: '', currency: newExpense.currency, gig_id: '', receipt_url: '' })
        setShowAddExpense(false)
        showToast('Expense added')
        fetchExpenses()
      }
    } catch {
      showToast('Failed to add expense')
    }
  }

  async function saveEditExpense(id: string) {
    try {
      const res = await fetch('/api/expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editExpense }),
      })
      const data = await res.json()
      if (data.success) {
        setEditingExpenseId(null)
        showToast('Expense updated')
        fetchExpenses()
      }
    } catch {
      showToast('Failed to update expense')
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setExpenses(prev => prev.filter(e => e.id !== id))
        showToast('Expense deleted')
      }
    } catch {
      showToast('Failed to delete expense')
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--border-dim)',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    padding: '10px 14px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    letterSpacing: '0.15em',
    color: 'var(--text-dimmer)',
    textTransform: 'uppercase' as const,
    marginBottom: '8px',
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
            {financeTab === 'invoices' && (
              <>
                <button onClick={exportCSV} className="btn-secondary" style={{ padding: '10px 20px', fontSize: '10px' }}>Export CSV</button>
                <button onClick={() => setShowAdd(!showAdd)} className="btn-gold" style={{ padding: '10px 20px', fontSize: '10px' }}>+ Add invoice</button>
              </>
            )}
            {financeTab === 'expenses' && (
              <button onClick={() => setShowAddExpense(!showAddExpense)} className="btn-gold" style={{ padding: '10px 20px', fontSize: '10px' }}>+ Add expense</button>
            )}
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

        {/* ===== INVOICES TAB ===== */}
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
              { label: 'Total invoiced', value: fmtCurrency(statCurrency, grandTotal), sub: 'All time' },
              { label: 'Received', value: fmtCurrency(statCurrency, paidTotal), sub: `${invoices.filter(i => i.status === 'paid' && i.currency === statCurrency).length} invoices paid`, green: true },
              { label: 'Outstanding', value: fmtCurrency(statCurrency, pendingTotal), sub: `${invoices.filter(i => i.status === 'pending' && i.currency === statCurrency).length} awaiting payment`, alert: pendingTotal > 0 },
              { label: 'This month', value: fmtCurrency(statCurrency, byCurrency[statCurrency] ? (byCurrency[statCurrency].paid + byCurrency[statCurrency].pending) : 0), sub: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--panel)', border: `1px solid ${stat.alert ? 'rgba(138, 74, 58, 0.25)' : 'var(--border-dim)'}`, padding: '24px 28px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '12px' }}>{stat.label}</div>
                <div className="display" style={{ fontSize: '28px', color: stat.alert ? 'var(--gold-bright)' : stat.green ? 'var(--green)' : 'var(--text)', marginBottom: '6px' }}>{stat.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--border)' }}>{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* MONTHLY INCOME CHART */}
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

          {/* FORECAST */}
          <div className="card" style={{ marginBottom: '32px', border: '1px solid rgba(176,141,87,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>Forecast — next 3 months</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {[
                  { color: 'var(--gold)', label: 'Confirmed' },
                  { color: 'rgba(176,141,87,0.35)', label: 'Pending' },
                  { color: 'rgba(61,107,74,0.7)', label: 'Invoiced' },
                ].map(leg => (
                  <span key={leg.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-dimmer)' }}>
                    <span style={{ width: '10px', height: '10px', background: leg.color, display: 'inline-block', flexShrink: 0 }} />
                    {leg.label}
                  </span>
                ))}
              </div>
            </div>

            {forecastData.every(f => f.confirmed === 0 && f.pendingFees === 0 && f.invoiced === 0) ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-dimmer)', fontSize: '12px', letterSpacing: '0.1em' }}>
                No confirmed gigs or outstanding invoices in the next 3 months
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                {forecastData.map(fm => {
                  const confirmedH = (fm.confirmed / maxForecast) * 100
                  const pendingH = (fm.pendingFees / maxForecast) * 100
                  const invoicedH = (fm.invoiced / maxForecast) * 100
                  const totalAmt = fm.confirmed + fm.pendingFees + fm.invoiced
                  return (
                    <div key={fm.key}>
                      {/* Bar group */}
                      <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '104px', marginBottom: '10px' }}>
                        {fm.confirmed > 0 ? (
                          <div title={`Confirmed: ${fm.confirmed.toLocaleString()}`} style={{ flex: 1, height: `${confirmedH}px`, background: 'linear-gradient(180deg, var(--gold), #7a5a28)', transition: 'height 0.4s ease', minHeight: '2px' }} />
                        ) : null}
                        {fm.pendingFees > 0 ? (
                          <div title={`Pending: ${fm.pendingFees.toLocaleString()}`} style={{ flex: 1, height: `${pendingH}px`, background: 'rgba(176,141,87,0.35)', border: '1px solid rgba(176,141,87,0.2)', transition: 'height 0.4s ease', minHeight: '2px', boxSizing: 'border-box' }} />
                        ) : null}
                        {fm.invoiced > 0 ? (
                          <div title={`Invoiced: ${fm.invoiced.toLocaleString()}`} style={{ flex: 1, height: `${invoicedH}px`, background: 'rgba(61,107,74,0.7)', border: '1px solid rgba(61,107,74,0.3)', transition: 'height 0.4s ease', minHeight: '2px', boxSizing: 'border-box' }} />
                        ) : null}
                        {totalAmt === 0 && (
                          <div style={{ flex: 1, height: '2px', background: 'var(--border-dim)' }} />
                        )}
                      </div>
                      {/* Label block */}
                      <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--text)', textTransform: 'uppercase', marginBottom: '6px' }}>{fm.label}</div>
                      {fm.confirmed > 0 && <div style={{ fontSize: '10px', color: 'var(--gold)', marginBottom: '2px' }}>Confirmed: {fm.confirmed.toLocaleString()}</div>}
                      {fm.pendingFees > 0 && <div style={{ fontSize: '10px', color: 'rgba(176,141,87,0.7)', marginBottom: '2px' }}>Pending: {fm.pendingFees.toLocaleString()}</div>}
                      {fm.invoiced > 0 && <div style={{ fontSize: '10px', color: 'rgba(61,107,74,0.9)', marginBottom: '2px' }}>Invoiced: {fm.invoiced.toLocaleString()}</div>}
                      {totalAmt === 0 && <div style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>Nothing booked</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ADD INVOICE FORM */}
          {showAdd && (
            <div className="card" style={{ border: '1px solid rgba(176, 141, 87, 0.25)', marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '20px' }}>New invoice</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px 1fr 80px', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={labelStyle}>Gig / show</div>
                  <input value={newInvoice.gig_title} onChange={e => setNewInvoice(p => ({ ...p, gig_title: e.target.value }))}
                    placeholder="Electric Nights Festival" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Amount</div>
                  <input value={newInvoice.amount} onChange={e => setNewInvoice(p => ({ ...p, amount: e.target.value }))}
                    placeholder="5000" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Currency</div>
                  <input value={newInvoice.currency} onChange={e => setNewInvoice(p => ({ ...p, currency: e.target.value.toUpperCase() }))}
                    placeholder="AUD" maxLength={3}
                    style={{ ...inputStyle, border: `1px solid ${newInvoice.currency ? 'rgba(176,141,87,0.5)' : 'var(--border-dim)'}`, color: 'var(--gold)', fontWeight: 600 }} />
                </div>
                <div>
                  <div style={labelStyle}>Due date</div>
                  <input value={newInvoice.due_date} onChange={e => setNewInvoice(p => ({ ...p, due_date: e.target.value }))}
                    placeholder="2026-04-16" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Type</div>
                  <select value={newInvoice.type} onChange={e => setNewInvoice(p => ({ ...p, type: e.target.value }))}
                    style={{ ...inputStyle }}>
                    <option value="deposit">Deposit</option>
                    <option value="balance">Balance</option>
                    <option value="full">Full fee</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <div style={labelStyle}>Location (auto-sets currency)</div>
                  <input value={newInvoice.location}
                    onChange={e => {
                      const loc = e.target.value
                      const detected = currencyFromLocation(loc)
                      setNewInvoice(p => ({ ...p, location: loc, currency: detected }))
                    }}
                    placeholder="Melbourne, AU" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Billed to (promoter / company)</div>
                  <input value={newInvoice.promoter}
                    onChange={e => setNewInvoice(p => ({ ...p, promoter: e.target.value }))}
                    placeholder="Festival Promotions Ltd" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Artist alias</div>
                  <input value={newInvoice.artist_name}
                    onChange={e => setNewInvoice(p => ({ ...p, artist_name: e.target.value }))}
                    placeholder="ABSOLUTE. / Night Manoeuvres" style={inputStyle} />
                  <div style={{ fontSize: '9px', color: 'var(--text-dimmer)', marginTop: '5px', letterSpacing: '0.06em' }}>Leave blank to use profile name</div>
                </div>
                <div>
                  <div style={labelStyle}>WHT %</div>
                  <input type="number" min="0" max="100" value={newInvoice.wht_rate} onChange={e => setNewInvoice(p => ({ ...p, wht_rate: e.target.value }))}
                    placeholder="0" style={inputStyle} />
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
                    <div style={{ fontSize: '13px', color: 'var(--text)' }}>{fmtCurrency(inv.currency, inv.amount)}</div>
                    <div style={{ fontSize: '12px', color: inv.wht_rate ? 'var(--gold-bright)' : 'var(--text-dimmer)' }}>
                      {inv.wht_rate ? `${inv.wht_rate}%` : '—'}
                    </div>
                    <div style={{ fontSize: '13px', color: inv.wht_rate ? 'var(--text)' : 'var(--text-dimmer)' }}>
                      {inv.wht_rate ? fmtCurrency(inv.currency, netAmount) : '—'}
                    </div>
                    <div>
                      <a href={`/api/invoices/${inv.id}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dimmer)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'}>
                        View →
                      </a>
                    </div>
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
                            const body = encodeURIComponent(`Hi,\n\nI wanted to follow up on the invoice for ${inv.gig_title || 'our recent show'} (${currencySymbol(inv.currency)}${inv.amount?.toLocaleString()})${days > 0 ? `, which was due ${days} day${days !== 1 ? 's' : ''} ago` : ', which is coming due soon'}.\n\nPlease find the invoice here: ${window.location.origin}/api/invoices/${inv.id}\n\nLet me know if you have any questions.\n\nBest,\n${artistName}\n\n--\nSignal Lab OS — Tailored Artist OS`)
                            window.open(`mailto:?subject=${subject}&body=${body}`)
                          }}
                          style={{ background: 'transparent', border: 'none', color: '#c9a46e', fontSize: '11px', cursor: 'pointer', padding: '0 8px', fontFamily: 'inherit', letterSpacing: '0.05em' }}>
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

        {/* ===== EXPENSES TAB ===== */}
        {financeTab === 'expenses' && (<>

          {/* PROFIT / LOSS */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '14px' }}>
              Profit / Loss — {now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </div>
            {plCurrencies.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>No data yet</div>
            ) : (
              <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                {plCurrencies.map(c => {
                  const rev = byCurrency[c]?.paid || 0
                  const exp = expenses
                    .filter(e => e.currency === c && e.date && e.date.startsWith(thisMonthKey))
                    .reduce((s, e) => s + e.amount, 0)
                  const pl = rev - exp
                  return (
                    <div key={c} style={{ background: 'var(--panel)', border: `1px solid ${pl >= 0 ? 'rgba(61,107,74,0.25)' : 'rgba(138,74,58,0.25)'}`, padding: '20px 28px', minWidth: '220px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '12px' }}>{c}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '4px' }}>Revenue</div>
                          <div style={{ fontSize: '20px', color: 'var(--green)', fontFamily: "'Unbounded', sans-serif", fontWeight: 300 }}>{rev.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '4px' }}>Expenses</div>
                          <div style={{ fontSize: '20px', color: exp > 0 ? 'var(--gold-bright)' : 'var(--text-dimmer)', fontFamily: "'Unbounded', sans-serif", fontWeight: 300 }}>{exp.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '4px' }}>P&L</div>
                          <div style={{ fontSize: '20px', color: pl >= 0 ? 'var(--green)' : '#c9614a', fontFamily: "'Unbounded', sans-serif", fontWeight: 300 }}>
                            {pl >= 0 ? '+' : ''}{pl.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* MONTHLY TOTAL + CURRENCY PICKER */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '4px' }}>This month</div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 300, color: thisMonthExpTotal > 0 ? 'var(--gold-bright)' : 'var(--text-dimmer)' }}>
                  {fmtCurrency(expenseCurrency, thisMonthExpTotal, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '4px' }}>All time</div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 300, color: 'var(--text-dim)' }}>
                  {fmtCurrency(expenseCurrency, expensesByCurrency[expenseCurrency] || 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            {expenseCurrencies.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginRight: '8px' }}>Currency</span>
                {expenseCurrencies.map(c => (
                  <button key={c} onClick={() => setExpenseCurrency(c)} style={{
                    background: expenseCurrency === c ? 'rgba(176,141,87,0.15)' : 'transparent',
                    border: `1px solid ${expenseCurrency === c ? 'rgba(176,141,87,0.6)' : 'var(--border-dim)'}`,
                    color: expenseCurrency === c ? 'var(--gold)' : 'var(--text-dimmer)',
                    fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em',
                    padding: '4px 12px', cursor: 'pointer', transition: 'all 0.15s',
                  }}>{c}</button>
                ))}
              </div>
            )}
          </div>

          {/* ADD EXPENSE FORM */}
          {showAddExpense && (
            <div className="card" style={{ border: '1px solid rgba(176,141,87,0.25)', marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '20px' }}>New expense</div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 2fr 1fr 1fr 100px', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={labelStyle}>Date</div>
                  <input type="date" value={newExpense.date} onChange={e => setNewExpense(p => ({ ...p, date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Description</div>
                  <input value={newExpense.description} onChange={e => setNewExpense(p => ({ ...p, description: e.target.value }))}
                    placeholder="Studio session — Metropolis" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Category</div>
                  <select value={newExpense.category} onChange={e => setNewExpense(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                    {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>Amount</div>
                  <input type="number" min="0" step="0.01" value={newExpense.amount} onChange={e => setNewExpense(p => ({ ...p, amount: e.target.value }))}
                    placeholder="250" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Currency</div>
                  <input value={newExpense.currency} onChange={e => setNewExpense(p => ({ ...p, currency: e.target.value.toUpperCase() }))}
                    placeholder="GBP" maxLength={3}
                    style={{ ...inputStyle, border: '1px solid rgba(176,141,87,0.5)', color: 'var(--gold)', fontWeight: 600 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <div style={labelStyle}>Link to gig (optional)</div>
                  <select value={newExpense.gig_id} onChange={e => setNewExpense(p => ({ ...p, gig_id: e.target.value }))} style={inputStyle}>
                    <option value="">— No gig —</option>
                    {gigs.map(g => (
                      <option key={g.id} value={g.id}>{g.title} ({new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>Receipt URL (optional)</div>
                  <input value={newExpense.receipt_url} onChange={e => setNewExpense(p => ({ ...p, receipt_url: e.target.value }))}
                    placeholder="https://..." style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={addExpense} className="btn-primary" style={{ padding: '12px 24px', fontSize: '10px' }}>Save expense</button>
                <button onClick={() => setShowAddExpense(false)} className="btn-secondary" style={{ padding: '12px 24px', fontSize: '10px' }}>Cancel</button>
              </div>
            </div>
          )}

          {/* EXPENSES TABLE */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 2fr 130px 140px 60px 80px 64px', gap: '0', padding: '12px 24px', borderBottom: '1px solid var(--border-dim)' }}>
              {['Date', 'Description', 'Category', 'Amount', 'Cur', 'Receipt', ''].map((h, i) => (
                <div key={i} style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>

            {expensesLoading ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-dimmer)', fontSize: '13px' }}>Loading expenses...</div>
            ) : expenses.length === 0 ? (
              <div style={{ padding: '64px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '16px' }}>No expenses yet</div>
                <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginBottom: '24px' }}>Track studio time, equipment, travel, and other costs.</div>
                <button onClick={() => setShowAddExpense(true)} style={{ background: 'transparent', border: '1px solid rgba(176,141,87,0.4)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '12px 24px', cursor: 'pointer' }}>
                  Add first expense →
                </button>
              </div>
            ) : (
              expenses.map((exp, i) => {
                const isEditing = editingExpenseId === exp.id
                const linkedGig = gigs.find(g => g.id === exp.gig_id)
                return (
                  <div key={exp.id} style={{ borderBottom: i < expenses.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
                    {isEditing ? (
                      <div style={{ padding: '12px 24px', background: 'rgba(176,141,87,0.04)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '110px 2fr 130px 140px 60px 1fr', gap: '8px', marginBottom: '8px' }}>
                          <input type="date" value={editExpense.date || exp.date} onChange={e => setEditExpense(p => ({ ...p, date: e.target.value }))}
                            style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }} />
                          <input value={editExpense.description ?? exp.description} onChange={e => setEditExpense(p => ({ ...p, description: e.target.value }))}
                            style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }} />
                          <select value={editExpense.category ?? exp.category} onChange={e => setEditExpense(p => ({ ...p, category: e.target.value }))}
                            style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}>
                            {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                          <input type="number" value={editExpense.amount ?? exp.amount} onChange={e => setEditExpense(p => ({ ...p, amount: parseFloat(e.target.value) }))}
                            style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }} />
                          <input value={editExpense.currency ?? exp.currency} onChange={e => setEditExpense(p => ({ ...p, currency: e.target.value.toUpperCase() }))}
                            maxLength={3} style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px', color: 'var(--gold)' }} />
                          <input value={editExpense.receipt_url ?? exp.receipt_url ?? ''} onChange={e => setEditExpense(p => ({ ...p, receipt_url: e.target.value }))}
                            placeholder="Receipt URL" style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => saveEditExpense(exp.id)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '10px' }}>Save</button>
                          <button onClick={() => { setEditingExpenseId(null); setEditExpense({}) }} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '10px' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '110px 2fr 130px 140px 60px 80px 64px', gap: '0', padding: '14px 24px', alignItems: 'center' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          {new Date(exp.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', color: 'var(--text)' }}>{exp.description}</div>
                          {linkedGig && (
                            <div style={{ fontSize: '10px', color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>{linkedGig.title}</div>
                          )}
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmer)', background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '3px 8px' }}>
                            {exp.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                          {Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>{exp.currency}</div>
                        <div>
                          {exp.receipt_url ? (
                            <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--green)', textDecoration: 'none', textTransform: 'uppercase' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--green)'}>
                              View →
                            </a>
                          ) : (
                            <span style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>—</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditingExpenseId(exp.id); setEditExpense({}) }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', cursor: 'pointer', padding: '0', letterSpacing: '0.08em' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'}>
                            Edit
                          </button>
                          <button onClick={() => deleteExpense(exp.id)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px', cursor: 'pointer', padding: '0' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#c9614a'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'}>
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

        </>)}

        {toast && (
          <div className="toast">
            <div className="toast-label">Finances</div>
            {toast}
          </div>
        )}

      </div>
    </div>
  )
}
