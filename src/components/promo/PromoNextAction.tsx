'use client'

/**
 * Next-action banner for /promo. Lifts the most urgent thing-to-do above
 * the tabs so an artist landing on /promo doesn't have to hunt across
 * Releases / DJ Promo / Guest list to find what needs attention.
 *
 * Priority order:
 *   1. Upcoming gig (≤14 days) with unconfirmed guest-list responses
 *   2. Upcoming gig (≤14 days) with NO guest-list invite created
 *   3. nothing → render null (silent)
 *
 * Click → flips the parent tab + scrolls to the relevant gig.
 */

import { useEffect, useState } from 'react'

interface Props {
  s: {
    bg: string; panel: string; border: string; borderMid: string
    gold: string; goldBright: string; text: string; dim: string; dimmer: string; font: string
  }
  mobile: boolean
  onSwitchTab: (tab: 'releases' | 'promo' | 'guestlist') => void
}

type Action =
  | { kind: 'unconfirmed'; gigTitle: string; days: number; count: number }
  | { kind: 'no-invite'; gigTitle: string; days: number }

export function PromoNextAction({ s, mobile, onSwitchTab }: Props) {
  const [action, setAction] = useState<Action | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [gr, ir] = await Promise.all([
          fetch('/api/gigs').then(r => r.json()).catch(() => ({ gigs: [] })),
          fetch('/api/guest-list').then(r => r.json()).catch(() => ({ invites: [] })),
        ])
        const gigs: Array<{ id: string; title: string; date: string }> = (gr.gigs || gr || []) as any
        const invites: Array<{ id: string; gig_id: string; slug: string }> = ir.invites || []

        const now = Date.now()
        const horizon = now + 14 * 24 * 60 * 60 * 1000
        const upcoming = gigs
          .filter(g => g.date && new Date(g.date).getTime() >= now && new Date(g.date).getTime() <= horizon)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        if (!upcoming.length) return

        // 1. Find soonest gig with unconfirmed RSVPs
        for (const g of upcoming) {
          const inv = invites.find(i => i.gig_id === g.id)
          if (!inv) continue
          const rr = await fetch(`/api/guest-list/${inv.slug}/responses`).then(r => r.json()).catch(() => ({ responses: [] }))
          const responses: Array<{ confirmed: boolean }> = rr.responses || []
          const unconfirmed = responses.filter(r => !r.confirmed).length
          if (unconfirmed > 0) {
            const days = Math.max(0, Math.round((new Date(g.date).getTime() - now) / (24 * 60 * 60 * 1000)))
            if (!cancelled) setAction({ kind: 'unconfirmed', gigTitle: g.title, days, count: unconfirmed })
            return
          }
        }

        // 2. Soonest gig with no invite at all
        for (const g of upcoming) {
          if (invites.find(i => i.gig_id === g.id)) continue
          const days = Math.max(0, Math.round((new Date(g.date).getTime() - now) / (24 * 60 * 60 * 1000)))
          if (!cancelled) setAction({ kind: 'no-invite', gigTitle: g.title, days })
          return
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  if (!action) return null

  const inDays = action.days === 0 ? 'today' : action.days === 1 ? 'tomorrow' : `in ${action.days} days`
  const message =
    action.kind === 'unconfirmed'
      ? `${action.gigTitle} ${inDays} — ${action.count} unconfirmed RSVP${action.count === 1 ? '' : 's'}`
      : `${action.gigTitle} ${inDays} — no guest list set up yet`
  const ctaLabel = action.kind === 'unconfirmed' ? 'Review →' : 'Set up →'

  return (
    <div style={{
      padding: mobile ? '12px 16px' : '12px 48px',
      borderBottom: `1px solid ${s.border}`,
      background: '#0e0e0e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: s.gold, flexShrink: 0 }}>
          Next
        </span>
        <span style={{ fontSize: '12px', color: s.text, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {message}
        </span>
      </div>
      <button
        onClick={() => onSwitchTab('guestlist')}
        style={{
          background: 'transparent',
          border: `1px solid ${s.gold}`,
          color: s.gold,
          padding: '6px 14px',
          fontSize: '9px',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          fontFamily: s.font,
          flexShrink: 0,
        }}
      >
        {ctaLabel}
      </button>
    </div>
  )
}
