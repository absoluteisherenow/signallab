import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/api-auth'
import { getStripe, isCheckoutEnabled } from '@/lib/stripe'

export const runtime = 'nodejs'

// POST /api/billing/portal
// Returns: { url } — Stripe customer portal URL for managing the subscription.

export async function POST(req: NextRequest) {
  if (!isCheckoutEnabled()) {
    return NextResponse.json({ error: 'checkout_disabled' }, { status: 503 })
  }
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user } = gate

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: sub } = await service
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'no_customer' }, { status: 404 })
  }

  const stripe = getStripe()
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/billing`,
  })
  return NextResponse.json({ url: portal.url })
}
