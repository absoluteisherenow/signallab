'use client'

import { MastermindChat } from '@/components/ui/MastermindChat'

export function FinanceMastermind() {
  async function handleSend(message: string): Promise<string> {
    try {
      // Use signal-bar for finance-specific commands, but ask for rich responses
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `[FINANCE MASTERMIND] ${message}. Give a detailed, helpful response about invoices, revenue, or financial status. Include specific numbers, dates, and gig names where relevant.`,
        }),
      })
      const data = await res.json()

      if (data.error) return data.error

      // Format based on intent
      if (data.intent === 'payment_info') {
        let response = data.answer || ''
        if (data.breakdown && data.breakdown.length > 0) {
          response += '\n\n'
          data.breakdown.forEach((item: { label: string; amount: number; status: string }) => {
            const statusIcon = item.status === 'paid' ? '[paid]' : item.status === 'overdue' ? '[overdue]' : '[pending]'
            response += `${statusIcon} ${item.label} — ${data.currency || ''} ${item.amount?.toLocaleString()}\n`
          })
          if (data.total) {
            response += `\nTotal: ${data.currency || ''} ${data.total.toLocaleString()}`
          }
        }
        return response
      }

      return data.answer || JSON.stringify(data)
    } catch {
      return 'Failed to reach the finance assistant. Try again.'
    }
  }

  return (
    <MastermindChat
      title="Finance Mastermind"
      placeholder="Ask about invoices, revenue, payments..."
      suggestedPrompts={[
        'Show overdue invoices',
        'Total revenue this quarter',
        'Which gigs haven\'t been invoiced?',
        'Outstanding payments by currency',
        'Revenue breakdown this year',
      ]}
      onSend={handleSend}
    />
  )
}
