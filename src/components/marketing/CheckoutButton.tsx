'use client'
import { useState } from 'react'
import { BRT } from '@/lib/design/brt'

// Calls /api/billing/checkout with the chosen tier and redirects to Stripe.
// If the user isn't signed in, sends them to /login?next=/pricing first.

export default function CheckoutButton({
  tier,
  featured,
  children,
}: {
  tier: 'creator' | 'artist' | 'pro' | 'road'
  featured?: boolean
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      if (res.status === 401) {
        window.location.href = `/login?next=/pricing`
        return
      }
      if (res.status === 503) {
        setError('Checkout is not yet enabled. Join the waitlist and we will email you when it opens.')
        setLoading(false)
        return
      }
      // Read body as text first so we can surface non-JSON responses
      // (HTML error pages, empty bodies, redirects) instead of crashing
      // with "Unexpected end of JSON input".
      const text = await res.text()
      let json: any = null
      try { json = text ? JSON.parse(text) : null } catch { /* not JSON */ }
      if (!res.ok || !json?.url) {
        const snippet = text ? text.slice(0, 200) : '(empty body)'
        setError(json?.error || `HTTP ${res.status}: ${snippet}`)
        setLoading(false)
        return
      }
      window.location.href = json.url
    } catch (e: any) {
      setError(e?.message || 'Network error')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={go}
        disabled={loading}
        className="mt-8 px-6 py-4 text-[11px] uppercase tracking-[0.28em] text-center font-mono font-bold transition-colors disabled:opacity-60"
        style={{
          background: featured ? BRT.red : 'transparent',
          border: `1px solid ${featured ? BRT.red : BRT.divide}`,
          color: BRT.ink,
        }}
      >
        {loading ? 'Opening checkout…' : children}
      </button>
      {error && (
        <div className="mt-3 font-mono text-[11px]" style={{ color: BRT.red }}>
          {error}
        </div>
      )}
    </>
  )
}
