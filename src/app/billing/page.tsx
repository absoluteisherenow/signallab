'use client'
// ── /billing ─────────────────────────────────────────────────────────────────
// Authed user's subscription summary + "Manage in Stripe Portal" button. Reads
// public.subscriptions via the auth-scoped supabase client (RLS-aware).

import { useEffect, useState } from 'react'
import { BRT } from '@/lib/design/brt'

const DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

interface Sub {
  tier: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export default function BillingPage() {
  const [sub, setSub] = useState<Sub | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { createBrowserClient } = await import('@supabase/auth-helpers-nextjs')
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login?next=/billing'
        return
      }
      const { data } = await supabase
        .from('subscriptions')
        .select('tier,status,current_period_end,cancel_at_period_end')
        .eq('user_id', user.id)
        .maybeSingle()
      setSub(data as Sub | null)
      setLoading(false)
    })()
  }, [])

  async function openPortal() {
    setPortalLoading(true)
    setError(null)
    const res = await fetch('/api/billing/portal', { method: 'POST' })
    const json = await res.json()
    if (json?.url) {
      window.location.href = json.url
      return
    }
    setError(json?.error || 'Could not open billing portal')
    setPortalLoading(false)
  }

  return (
    <main style={{ background: BRT.bg, color: BRT.ink, minHeight: '100vh' }}>
      <div className="max-w-[720px] mx-auto px-6 py-16 md:py-24">
        <div className="font-mono text-[11px] uppercase tracking-[0.32em]" style={{ color: BRT.red }}>
          Billing
        </div>
        <h1
          className="mt-3 font-black uppercase leading-[1] tracking-[-0.02em]"
          style={{ fontFamily: DISPLAY, fontSize: 'clamp(36px, 5vw, 56px)' }}
        >
          Your subscription
        </h1>

        {loading ? (
          <div className="mt-10 font-mono text-[12px]" style={{ color: BRT.inkDim }}>Loading…</div>
        ) : !sub || sub.tier === 'free' ? (
          <div className="mt-10 p-8" style={{ background: BRT.ticket, border: `1px solid ${BRT.divide}` }}>
            <div className="font-mono text-[12px] uppercase tracking-[0.24em]" style={{ color: BRT.inkDim }}>
              No active plan
            </div>
            <p className="mt-4 font-mono text-[14px] leading-[1.7]" style={{ color: BRT.inkSoft }}>
              You are on the free tier — read-only access while public beta opens.
            </p>
            <a
              href="/pricing"
              className="mt-6 inline-block px-6 py-3 text-[11px] uppercase tracking-[0.28em] font-mono font-bold"
              style={{ background: BRT.red, color: BRT.ink }}
            >
              See plans →
            </a>
          </div>
        ) : (
          <div className="mt-10 p-8" style={{ background: BRT.ticket, border: `1px solid ${BRT.divide}` }}>
            <div className="grid grid-cols-2 gap-y-4 font-mono text-[12px]">
              <div style={{ color: BRT.inkDim }}>Tier</div>
              <div style={{ color: BRT.ink }} className="uppercase tracking-[0.18em]">{sub.tier}</div>
              <div style={{ color: BRT.inkDim }}>Status</div>
              <div style={{ color: BRT.ink }} className="uppercase tracking-[0.18em]">{sub.status}</div>
              {sub.current_period_end && (
                <>
                  <div style={{ color: BRT.inkDim }}>{sub.cancel_at_period_end ? 'Ends' : 'Renews'}</div>
                  <div style={{ color: BRT.ink }}>{new Date(sub.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </>
              )}
            </div>
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="mt-8 px-6 py-3 text-[11px] uppercase tracking-[0.28em] font-mono font-bold disabled:opacity-60"
              style={{ background: BRT.red, color: BRT.ink }}
            >
              {portalLoading ? 'Opening…' : 'Manage in Stripe →'}
            </button>
            {error && (
              <div className="mt-3 font-mono text-[11px]" style={{ color: BRT.red }}>{error}</div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
