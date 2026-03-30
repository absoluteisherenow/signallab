'use client'

import { useState, useEffect, useRef } from 'react'
import { BarChart3, DollarSign, TrendingUp, Calendar, Receipt, Camera } from 'lucide-react'
import { Header } from '@/components/dashboard/Header'

interface FinancialEntry {
  id: number
  date: string
  event: string
  income: number
  expenses: number
  profit: number
}

interface Invoice {
  id: string
  gig_id?: string
  gig_title: string
  amount: number
  currency: string
  type: string
  status: string
  due_date?: string
  created_at?: string
  notes?: string
}

interface Expense {
  id?: string
  date: string
  description: string
  category: 'Travel' | 'Equipment' | 'Marketing' | 'Venue' | 'Software' | 'Other'
  amount: number
  currency: string
  notes?: string
}

type ExpenseCategory = Expense['category']

const CATEGORIES: ExpenseCategory[] = ['Travel', 'Equipment', 'Marketing', 'Venue', 'Software', 'Other']

// UK financial year: Apr–Mar
// Q1: Apr–Jun, Q2: Jul–Sep, Q3: Oct–Dec, Q4: Jan–Mar
type Quarter = 'All' | 'Q1' | 'Q2' | 'Q3' | 'Q4'

const QUARTER_LABELS: Record<Quarter, string> = {
  All: 'All',
  Q1: 'Q1 Apr–Jun',
  Q2: 'Q2 Jul–Sep',
  Q3: 'Q3 Oct–Dec',
  Q4: 'Q4 Jan–Mar',
}

function getUKQuarter(dateStr: string): Quarter {
  const month = new Date(dateStr).getMonth() + 1 // 1–12
  if (month >= 4 && month <= 6) return 'Q1'
  if (month >= 7 && month <= 9) return 'Q2'
  if (month >= 10 && month <= 12) return 'Q3'
  return 'Q4' // Jan–Mar
}

function getCurrentUKQuarter(): Quarter {
  return getUKQuarter(new Date().toISOString())
}

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Travel: '#4a7c8a',
  Equipment: '#7c6a4a',
  Marketing: '#6a4a7c',
  Venue: '#4a7c5a',
  Software: '#4a5a7c',
  Other: '#52504c',
}

const financialData: FinancialEntry[] = [
  {
    id: 1,
    date: '2026-03-01',
    event: 'Spring Vibes Afterparty',
    income: 3500,
    expenses: 850,
    profit: 2650,
  },
  {
    id: 2,
    date: '2026-03-08',
    event: 'Tech House Nights',
    income: 2800,
    expenses: 620,
    profit: 2180,
  },
  {
    id: 3,
    date: '2026-03-15',
    event: 'Minimal Sessions',
    income: 2200,
    expenses: 580,
    profit: 1620,
  },
]

const EMPTY_FORM: Omit<Expense, 'id'> = {
  date: new Date().toISOString().slice(0, 10),
  description: '',
  category: 'Other',
  amount: 0,
  currency: 'GBP',
  notes: '',
}

export function FinancesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [draftInvoices, setDraftInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expenseForm, setExpenseForm] = useState<Omit<Expense, 'id'>>(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [savingExpense, setSavingExpense] = useState(false)
  const [activeQuarter, setActiveQuarter] = useState<Quarter>(getCurrentUKQuarter())
  const [scanningEmails, setScanningEmails] = useState(false)
  const [scanResult, setScanResult] = useState<string>('')
  const [scanningInvoices, setScanningInvoices] = useState(false)
  const [invoiceScanResult, setInvoiceScanResult] = useState('')
  const [scanningReceipt, setScanningReceipt] = useState(false)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/invoices')
      .then(r => r.json())
      .then(d => {
        if (d.invoices) {
          setInvoices(d.invoices.filter((i: Invoice) => i.status !== 'draft'))
          setDraftInvoices(d.invoices.filter((i: Invoice) => i.status === 'draft'))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/expenses')
      .then(r => r.json())
      .then(d => { if (d.expenses) setExpenses(d.expenses) })
      .catch(() => {})
  }, [])

  const totalIncome = financialData.reduce((sum, entry) => sum + entry.income, 0)
  const totalExpenses = financialData.reduce((sum, entry) => sum + entry.expenses, 0)
  const totalProfit = financialData.reduce((sum, entry) => sum + entry.profit, 0)
  const avgProfit = Math.round(totalProfit / financialData.length)

  const isOverdue = (dueDate?: string, status?: string) => {
    if (!dueDate || status !== 'pending') return false
    return new Date(dueDate) < new Date()
  }

  const filteredExpenses = expenses.filter(e =>
    activeQuarter === 'All' ? true : getUKQuarter(e.date) === activeQuarter
  )

  const expenseSubtotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0)

  async function handleSaveExpense() {
    if (!expenseForm.description || !expenseForm.date || expenseForm.amount <= 0) return
    setSavingExpense(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expenseForm),
      })
      const data = await res.json()
      if (data.success && data.expense) {
        setExpenses(prev => [data.expense, ...prev])
        setExpenseForm(EMPTY_FORM)
        setShowForm(false)
      }
    } catch {
      // silent fail
    } finally {
      setSavingExpense(false)
    }
  }

  async function handleReceiptUpload(file: File) {
    if (!file) return
    setScanningReceipt(true)
    // Show preview
    const reader = new FileReader()
    reader.onload = e => setReceiptPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/expenses/scan-receipt', { method: 'POST', body: form })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      const e = data.extracted
      setExpenseForm(prev => ({
        ...prev,
        description: e.description || prev.description,
        amount: e.amount || prev.amount,
        currency: e.currency || prev.currency,
        date: e.date || prev.date,
        category: e.category || prev.category,
        notes: e.notes || prev.notes,
      }))
      setShowForm(true)
    } catch {
      // silent — user can fill manually
    } finally {
      setScanningReceipt(false)
    }
  }

  async function handleDeleteExpense(id: string) {
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setExpenses(prev => prev.filter(e => e.id !== id))
      }
    } catch {
      // silent fail
    }
  }

  async function reloadExpenses() {
    try {
      const res = await fetch('/api/expenses')
      const data = await res.json()
      if (data.expenses) setExpenses(data.expenses)
    } catch {
      // silent fail
    }
  }

  async function handleScanEmails() {
    setScanningEmails(true)
    setScanResult('')
    try {
      const res = await fetch('/api/gmail/expenses', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setScanResult(data.error || 'Gmail not connected')
      } else {
        setScanResult(
          data.found > 0
            ? `Found ${data.found} expense${data.found === 1 ? '' : 's'} — review below`
            : `Scanned ${data.scanned} emails, no new expenses found`
        )
        await reloadExpenses()
      }
    } catch {
      setScanResult('Gmail not connected')
    } finally {
      setScanningEmails(false)
    }
  }

  async function approveInvoice(id: string) {
    const res = await fetch(`/api/invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    })
    const data = await res.json()
    if (data.success) {
      const approved = draftInvoices.find(i => i.id === id)
      if (approved) setInvoices(prev => [{ ...approved, status: 'pending' }, ...prev])
      setDraftInvoices(prev => prev.filter(i => i.id !== id))
    }
  }

  async function dismissDraft(id: string) {
    await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
    setDraftInvoices(prev => prev.filter(i => i.id !== id))
  }

  async function handleScanInvoices() {
    setScanningInvoices(true)
    setInvoiceScanResult('')
    try {
      const res = await fetch('/api/gmail/invoice-requests', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setInvoiceScanResult(data.error || 'Gmail not connected')
      } else {
        setInvoiceScanResult(
          data.found > 0
            ? `Found ${data.found} invoice request${data.found === 1 ? '' : 's'} — review below`
            : `Scanned ${data.scanned} emails, no new invoice requests found`
        )
        // Reload invoices to pick up new drafts
        const invRes = await fetch('/api/invoices')
        const invData = await invRes.json()
        if (invData.invoices) {
          setInvoices(invData.invoices.filter((i: Invoice) => i.status !== 'draft'))
          setDraftInvoices(invData.invoices.filter((i: Invoice) => i.status === 'draft'))
        }
      }
    } catch {
      setInvoiceScanResult('Gmail not connected')
    } finally {
      setScanningInvoices(false)
    }
  }

  function exportCSV() {
    const header = 'Date,Description,Category,Amount,Currency'
    const rows = filteredExpenses.map(e =>
      [
        e.date,
        `"${e.description.replace(/"/g, '""')}"`,
        e.category,
        e.amount.toFixed(2),
        e.currency,
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${activeQuarter.toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Shared input style matching the dark design system
  const inputStyle: React.CSSProperties = {
    background: '#070706',
    border: '1px solid #1a1917',
    color: '#f0ebe2',
    fontFamily: "'DM Mono', monospace",
    fontSize: '13px',
    padding: '7px 10px',
    borderRadius: '4px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    color: '#8a8780',
    fontFamily: "'DM Mono', monospace",
    fontSize: '11px',
    marginBottom: '4px',
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  return (
    <div className="min-h-screen bg-night-black">
      <Header title="FINANCES" subtitle="Revenue, expenses, and profit tracking" />

      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-night-dark-gray text-sm mb-2">Total Income</p>
                  <p className="text-3xl font-bold text-green-400">€{totalIncome.toLocaleString()}</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-400/50" />
              </div>
            </div>

            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-night-dark-gray text-sm mb-2">Total Expenses</p>
                  <p className="text-3xl font-bold text-red-400">€{totalExpenses.toLocaleString()}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-red-400/50" />
              </div>
            </div>

            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-night-dark-gray text-sm mb-2">Total Profit</p>
                  <p className="text-3xl font-bold text-night-silver">€{totalProfit.toLocaleString()}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-night-silver/50" />
              </div>
            </div>

            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-night-dark-gray text-sm mb-2">Average Profit</p>
                  <p className="text-3xl font-bold text-night-silver">€{avgProfit.toLocaleString()}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-night-silver/50" />
              </div>
            </div>
          </div>

          {/* Margin Analysis */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-night-silver mb-6">Profit Margin Analysis</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-night-dark-gray">Profit Margin</span>
                  <span className="text-night-silver font-bold">{Math.round((totalProfit / totalIncome) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-night-dark-gray rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-400"
                    style={{ width: `${(totalProfit / totalIncome) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction History */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-night-silver mb-4">Recent Events & Finances</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-night-dark-gray">
                  <tr className="text-night-dark-gray">
                    <th className="text-left py-3 px-4 font-semibold">Date</th>
                    <th className="text-left py-3 px-4 font-semibold">Event</th>
                    <th className="text-right py-3 px-4 font-semibold">Income</th>
                    <th className="text-right py-3 px-4 font-semibold">Expenses</th>
                    <th className="text-right py-3 px-4 font-semibold">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {financialData.map((entry) => (
                    <tr key={entry.id} className="border-b border-night-dark-gray hover:bg-night-dark-gray/50 transition-colors">
                      <td className="py-3 px-4 text-night-dark-gray">
                        {new Date(entry.date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="py-3 px-4 text-night-light">{entry.event}</td>
                      <td className="py-3 px-4 text-right text-green-400 font-semibold">
                        €{entry.income.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-red-400 font-semibold">
                        -€{entry.expenses.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-night-silver font-bold">
                        €{entry.profit.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invoices */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-night-silver flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Invoices
              </h3>
              <div className="flex items-center gap-3">
                {invoiceScanResult && (
                  <span className="text-xs text-night-dark-gray font-mono">{invoiceScanResult}</span>
                )}
                <button
                  onClick={handleScanInvoices}
                  disabled={scanningInvoices}
                  className="text-xs tracking-wider uppercase border border-night-dark-gray text-night-dark-gray px-3 py-1.5 hover:border-[#b08d57] hover:text-[#b08d57] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {scanningInvoices ? 'Scanning…' : 'Scan emails →'}
                </button>
              </div>
            </div>

            {draftInvoices.length > 0 && (
              <div className="mb-6 space-y-3">
                <div className="text-xs tracking-widest uppercase text-[#b08d57] mb-3">
                  Needs your approval — {draftInvoices.length} invoice request{draftInvoices.length > 1 ? 's' : ''}
                </div>
                {draftInvoices.map(invoice => (
                  <div key={invoice.id} className="bg-[#0a0908] border border-[#b08d57]/30 p-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-night-light font-medium">{invoice.gig_title}</div>
                      {invoice.notes && <div className="text-xs text-night-dark-gray mt-1">{invoice.notes}</div>}
                      <div className="flex gap-3 mt-2 text-xs text-night-dark-gray">
                        <span>{invoice.amount > 0 ? `${invoice.currency}${invoice.amount.toLocaleString()}` : 'Amount TBC'}</span>
                        {invoice.due_date && <span>Due {new Date(invoice.due_date).toLocaleDateString('en-GB')}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveInvoice(invoice.id!)}
                        className="text-xs tracking-wider uppercase bg-[#b08d57] text-[#070706] px-3 py-1.5 hover:bg-[#c9a46e] transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => dismissDraft(invoice.id!)}
                        className="text-xs tracking-wider uppercase border border-night-dark-gray text-night-dark-gray px-3 py-1.5 hover:border-red-400 hover:text-red-400 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
                <div className="h-px bg-night-dark-gray mt-4" />
              </div>
            )}

            {invoices.length === 0 ? (
              <p className="text-night-dark-gray text-sm">No invoices yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-night-dark-gray">
                    <tr className="text-night-dark-gray">
                      <th className="text-left py-3 px-4 font-semibold">Gig Title</th>
                      <th className="text-right py-3 px-4 font-semibold">Amount</th>
                      <th className="text-left py-3 px-4 font-semibold">Due Date</th>
                      <th className="text-left py-3 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => {
                      const overdue = isOverdue(invoice.due_date, invoice.status)
                      return (
                        <tr
                          key={invoice.id}
                          className={`border-b border-night-dark-gray hover:bg-night-dark-gray/50 transition-colors ${
                            overdue ? 'bg-red-500/10' : ''
                          }`}
                        >
                          <td className={`py-3 px-4 ${overdue ? 'text-red-400' : 'text-night-light'}`}>
                            {invoice.gig_title}
                          </td>
                          <td className={`py-3 px-4 text-right font-semibold ${overdue ? 'text-red-400' : 'text-green-400'}`}>
                            {invoice.currency}
                            {invoice.amount.toLocaleString()}
                          </td>
                          <td className={`py-3 px-4 ${overdue ? 'text-red-400 font-semibold' : 'text-night-dark-gray'}`}>
                            {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB') : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`badge ${
                                overdue
                                  ? 'badge-red'
                                  : invoice.status === 'paid'
                                  ? 'badge-green'
                                  : 'badge-gold'
                              }`}
                            >
                              {overdue ? 'OVERDUE' : invoice.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Expenses — UK MTD */}
          <div
            style={{
              background: '#0e0d0b',
              border: '1px solid #1a1917',
              borderRadius: '8px',
              padding: '24px',
            }}
          >
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '16px', fontWeight: 600, color: '#f0ebe2', fontFamily: "'DM Mono', monospace" }}>
                <Receipt style={{ width: '18px', height: '18px', color: '#b08d57' }} />
                Expenses
                <span style={{ fontSize: '11px', color: '#52504c', fontWeight: 400, marginLeft: '4px' }}>UK MTD</span>
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={exportCSV}
                  style={{
                    background: 'transparent',
                    border: '1px solid #1a1917',
                    color: '#8a8780',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '11px',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Export CSV
                </button>
                <button
                  onClick={handleScanEmails}
                  disabled={scanningEmails}
                  style={{
                    background: 'transparent',
                    border: '1px solid #1a1917',
                    color: scanningEmails ? '#52504c' : '#8a8780',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '11px',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: scanningEmails ? 'not-allowed' : 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    opacity: scanningEmails ? 0.6 : 1,
                  }}
                >
                  {scanningEmails ? 'Scanning…' : 'Scan emails →'}
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={receiptInputRef}
                  onChange={e => e.target.files?.[0] && handleReceiptUpload(e.target.files[0])}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => receiptInputRef.current?.click()}
                  disabled={scanningReceipt}
                  style={{
                    background: 'transparent',
                    border: '1px solid #1a1917',
                    color: scanningReceipt ? '#52504c' : '#8a8780',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '11px',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: scanningReceipt ? 'not-allowed' : 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    opacity: scanningReceipt ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  {scanningReceipt ? (
                    <>
                      <svg style={{ width: '11px', height: '11px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Reading receipt...
                    </>
                  ) : (
                    <>
                      <Camera style={{ width: '11px', height: '11px' }} />
                      Scan receipt
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowForm(f => !f)}
                  style={{
                    background: showForm ? '#1a1917' : 'transparent',
                    border: '1px solid #b08d57',
                    color: '#b08d57',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '11px',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {showForm ? '— Cancel' : '+ Add Expense'}
                </button>
              </div>
            </div>

            {/* Scan result message */}
            {scanResult && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 12px',
                background: '#070706',
                border: '1px solid #1a1917',
                borderRadius: '4px',
                color: '#8a8780',
                fontFamily: "'DM Mono', monospace",
                fontSize: '12px',
              }}>
                {scanResult}
              </div>
            )}

            {/* Add expense form */}
            {showForm && (
              <div
                style={{
                  background: '#070706',
                  border: '1px solid #1a1917',
                  borderRadius: '6px',
                  padding: '16px',
                  marginBottom: '20px',
                }}
              >
                {receiptPreview && (
                  <div className="relative inline-block mb-4">
                    <img src={receiptPreview} alt="Receipt" className="max-w-[120px] max-h-[120px] object-cover border border-night-dark-gray" />
                    <button onClick={() => setReceiptPreview(null)} className="absolute -top-1 -right-1 bg-night-gray border border-night-dark-gray text-night-dark-gray hover:text-red-400 text-xs w-4 h-4 flex items-center justify-center">×</button>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 100px', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input
                      type="date"
                      value={expenseForm.date}
                      onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Description</label>
                    <input
                      type="text"
                      value={expenseForm.description}
                      placeholder="e.g. Train to Manchester"
                      onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <select
                      value={expenseForm.category}
                      onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                      style={inputStyle}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseForm.amount || ''}
                      placeholder="0.00"
                      onChange={e => setExpenseForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Currency</label>
                    <input
                      type="text"
                      value={expenseForm.currency}
                      onChange={e => setExpenseForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))}
                      style={inputStyle}
                      maxLength={3}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleSaveExpense}
                    disabled={savingExpense}
                    style={{
                      background: '#b08d57',
                      border: 'none',
                      color: '#070706',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '8px 20px',
                      borderRadius: '4px',
                      cursor: savingExpense ? 'not-allowed' : 'pointer',
                      opacity: savingExpense ? 0.6 : 1,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {savingExpense ? 'Saving…' : 'Save Expense'}
                  </button>
                </div>
              </div>
            )}

            {/* Quarter filter tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
              {(['All', 'Q1', 'Q2', 'Q3', 'Q4'] as Quarter[]).map(q => (
                <button
                  key={q}
                  onClick={() => setActiveQuarter(q)}
                  style={{
                    background: activeQuarter === q ? '#1a1917' : 'transparent',
                    border: activeQuarter === q ? '1px solid #b08d57' : '1px solid #1a1917',
                    color: activeQuarter === q ? '#b08d57' : '#52504c',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '11px',
                    padding: '5px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {QUARTER_LABELS[q]}
                </button>
              ))}
            </div>

            {/* Expense table */}
            {filteredExpenses.length === 0 ? (
              <p style={{ color: '#52504c', fontSize: '13px', fontFamily: "'DM Mono', monospace" }}>
                No expenses recorded for this period.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: "'DM Mono', monospace" }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1917', color: '#52504c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500 }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500 }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500 }}>Category</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500 }}>Amount</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 500 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((expense, i) => (
                      <tr
                        key={expense.id ?? i}
                        style={{ borderBottom: '1px solid #1a1917' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,25,23,0.5)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 12px', color: '#8a8780' }}>
                          {new Date(expense.date).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#f0ebe2' }}>
                          {expense.description}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              background: CATEGORY_COLORS[expense.category] + '22',
                              border: `1px solid ${CATEGORY_COLORS[expense.category]}55`,
                              color: CATEGORY_COLORS[expense.category],
                              fontFamily: "'DM Mono', monospace",
                              fontSize: '10px',
                              padding: '2px 8px',
                              borderRadius: '3px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}
                          >
                            {expense.category}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f0ebe2', fontWeight: 600 }}>
                          {expense.currency} {expense.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {expense.id && (
                            <button
                              onClick={() => handleDeleteExpense(expense.id!)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#52504c',
                                cursor: 'pointer',
                                fontFamily: "'DM Mono', monospace",
                                fontSize: '11px',
                                padding: '2px 6px',
                              }}
                              title="Delete"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Subtotal row */}
                    <tr style={{ borderTop: '1px solid #b08d57' }}>
                      <td colSpan={3} style={{ padding: '10px 12px', color: '#8a8780', fontFamily: "'DM Mono', monospace", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Subtotal — {activeQuarter === 'All' ? 'all periods' : QUARTER_LABELS[activeQuarter]}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b08d57', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                        GBP {expenseSubtotal.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
