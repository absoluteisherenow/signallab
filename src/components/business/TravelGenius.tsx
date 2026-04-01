'use client'

import { MastermindChat } from '@/components/ui/MastermindChat'

export function TravelGenius() {
  async function handleSend(message: string): Promise<string> {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `[TRAVEL GENIUS] ${message}. Focus on travel logistics, routing, flights, accommodation, and gig scheduling for the next 90 days. Be specific with dates, locations, and practical advice.`,
        }),
      })
      const data = await res.json()

      if (data.error) return data.error

      if (data.intent === 'gig_info') {
        return data.answer || 'No gig data found.'
      }

      return data.answer || JSON.stringify(data)
    } catch {
      return 'Failed to reach the travel assistant. Try again.'
    }
  }

  return (
    <MastermindChat
      title="Travel Genius"
      placeholder="Ask about travel, routing, logistics..."
      suggestedPrompts={[
        "What's my travel for next month?",
        'Any gigs without flights booked?',
        'Optimal routing for my April shows',
        'What hotels do I need to book?',
        'Show all upcoming international gigs',
      ]}
      onSend={handleSend}
    />
  )
}
