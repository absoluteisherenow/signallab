'use client'

import { MastermindChat } from '@/components/ui/MastermindChat'

export function SocialsMastermind() {
  async function handleSend(message: string): Promise<string> {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `[SOCIALS MASTERMIND] ${message}. Focus on social media strategy, content planning, engagement, and posting schedule. Draw from upcoming gigs, releases, and studio work. Use the Night Manoeuvres voice: lowercase, no hashtags, no exclamation marks, no emojis, no CTAs. Sparse, observational, dark electronic energy.`,
        }),
      })
      const data = await res.json()

      if (data.error) return data.error

      if (data.intent === 'content_advice') {
        return data.answer || 'No content suggestions available.'
      }

      return data.answer || JSON.stringify(data)
    } catch {
      return 'Failed to reach the socials assistant. Try again.'
    }
  }

  async function handleMediaSubmit(url: string): Promise<string> {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `[SOCIALS MASTERMIND — URL ANALYSIS] The user shared this URL: ${url}. Analyse it as a content plan, social media schedule, or strategy document. Summarise what it contains and suggest how to improve or adapt it for the Night Manoeuvres brand. If it's a Google Sheets link, describe what structure you'd expect and how to optimise it.`,
        }),
      })
      const data = await res.json()
      if (data.error) return data.error
      return data.answer || JSON.stringify(data)
    } catch {
      return 'Could not analyse that URL. Try again.'
    }
  }

  return (
    <MastermindChat
      title="Socials Mastermind"
      placeholder="Ask about content, posting, engagement..."
      suggestedPrompts={[
        'What should I post this week?',
        "How's my engagement trending?",
        'Plan content around my next release',
        'Caption ideas for a studio session',
        'Best time to post this week',
      ]}
      onSend={handleSend}
      showMediaInput
      onMediaSubmit={handleMediaSubmit}
    />
  )
}
