'use client'

import { BarChart3, DollarSign, TrendingUp, Calendar } from 'lucide-react'
import { Header } from '@/components/dashboard/Header'

interface FinancialEntry {
  id: number
  date: string
  event: string
  income: number
  expenses: number
  profit: number
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

export function FinancesPage() {
  const totalIncome = financialData.reduce((sum, entry) => sum + entry.income, 0)
  const totalExpenses = financialData.reduce((sum, entry) => sum + entry.expenses, 0)
  const totalProfit = financialData.reduce((sum, entry) => sum + entry.profit, 0)
  const avgProfit = Math.round(totalProfit / financialData.length)

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
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
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
        </div>
      </div>
    </div>
  )
}
