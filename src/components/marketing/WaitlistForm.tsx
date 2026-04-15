'use client'

// ── WaitlistForm ────────────────────────────────────────────────────────────
// Three-field form (email + tier_intent + role). Inline confirmation, no route
// change. No confirmation email in v1 — manual onboarding follows up via calendar.
// BRT styling: ticket-card background, DM Mono labels, red focus + submit.

import { useState } from 'react'
import { BRT } from '@/lib/design/brt'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

type TierIntent = 'creator' | 'artist' | 'pro' | 'unsure'
type Role = 'dj_producer' | 'producer' | 'dj' | 'manager_label'

// Labels use lifestage phrasing — no tier names surfaced during private beta.
// Values still map to creator/artist/pro for downstream routing + analytics.
const TIER_OPTIONS: { value: TierIntent; label: string }[] = [
  { value: 'creator', label: 'Releasing music' },
  { value: 'artist',  label: 'Touring'         },
  { value: 'pro',     label: 'Team around you' },
  { value: 'unsure',  label: 'Not sure yet'    },
]

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'dj_producer',    label: 'DJ + Producer' },
  { value: 'producer',       label: 'Producer'      },
  { value: 'dj',             label: 'DJ'            },
  { value: 'manager_label',  label: 'Mgr / Label'   },
]

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [tierIntent, setTierIntent] = useState<TierIntent>('unsure')
  const [role, setRole] = useState<Role>('dj_producer')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) {
      setError('Real email please.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          tier_intent: tierIntent,
          role,
          source: typeof window !== 'undefined' ? window.location.search : '',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not save you. Try again.')
      }
      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Could not save you. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div
        className="p-7 md:p-10"
        style={{ background: BRT.ticket, border: `1px solid ${BRT.divide}` }}
      >
        <div
          className="font-mono text-[10px] tracking-[0.32em] uppercase mb-5"
          style={{ color: BRT.red }}
        >
          ✓ You are on the list
        </div>
        <p
          className="font-black uppercase tracking-[-0.02em] leading-[1.1]"
          style={{
            fontFamily: DISPLAY,
            fontSize: 'clamp(24px, 2.6vw, 34px)',
            color: BRT.ink,
          }}
        >
          Step inside.<br />We take it from here.
        </p>
        <p
          className="mt-5 font-mono text-[13px] leading-[1.7]"
          style={{ color: BRT.inkSoft }}
        >
          We onboard every artist personally. You will hear from us within a few days with a calendar link. No payment details needed.
        </p>
        <p
          className="mt-6 font-mono text-[12px] leading-[1.7]"
          style={{ color: BRT.inkSoft }}
        >
          In the meantime:{' '}
          <a
            href="https://instagram.com/nightmanoeuvres"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: BRT.red }}
          >
            Follow @nightmanoeuvres
          </a>
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="p-7 md:p-10 flex flex-col gap-7"
      style={{ background: BRT.ticket, border: `1px solid ${BRT.divide}` }}
    >
      {/* Email */}
      <div>
        <label
          htmlFor="wl-email"
          className="font-mono text-[10px] uppercase tracking-[0.28em] block mb-3"
          style={{ color: BRT.inkDim }}
        >
          Email
        </label>
        <input
          id="wl-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full px-4 py-3 font-mono text-[14px] focus:outline-none transition-colors"
          style={{
            background: BRT.bg,
            border: `1px solid ${BRT.divide}`,
            color: BRT.ink,
          }}
          placeholder="you@yourartistname.com"
          onFocus={e => (e.currentTarget.style.borderColor = BRT.red)}
          onBlur={e => (e.currentTarget.style.borderColor = BRT.divide)}
        />
      </div>

      {/* Tier intent */}
      <fieldset>
        <legend
          className="font-mono text-[10px] uppercase tracking-[0.28em] mb-3"
          style={{ color: BRT.inkDim }}
        >
          Which tier fits?
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TIER_OPTIONS.map(opt => {
            const active = tierIntent === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTierIntent(opt.value)}
                className="px-3 py-2.5 font-mono text-[10px] tracking-[0.2em] uppercase transition-all text-center"
                style={{
                  background: active ? BRT.red : 'transparent',
                  border: `1px solid ${active ? BRT.red : BRT.divide}`,
                  color: active ? BRT.ink : BRT.inkSoft,
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Role */}
      <fieldset>
        <legend
          className="font-mono text-[10px] uppercase tracking-[0.28em] mb-3"
          style={{ color: BRT.inkDim }}
        >
          What do you do?
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROLE_OPTIONS.map(opt => {
            const active = role === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className="px-3 py-2.5 font-mono text-[10px] tracking-[0.16em] uppercase transition-all text-center"
                style={{
                  background: active ? BRT.red : 'transparent',
                  border: `1px solid ${active ? BRT.red : BRT.divide}`,
                  color: active ? BRT.ink : BRT.inkSoft,
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="px-6 py-5 font-mono text-[11px] uppercase tracking-[0.28em] font-bold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: BRT.red,
          border: `1px solid ${BRT.red}`,
          color: BRT.ink,
        }}
      >
        {submitting ? 'Saving you...' : 'Request early access →'}
      </button>

      {error && (
        <div
          className="font-mono text-[12px]"
          style={{ color: BRT.red }}
        >
          {error}
        </div>
      )}

      <p
        className="font-mono text-[10px] uppercase tracking-[0.18em] leading-[1.7]"
        style={{ color: BRT.inkDim }}
      >
        We onboard every artist personally · No payment details · No spam
      </p>
    </form>
  )
}
