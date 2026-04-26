import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/api-auth'
import { getStripe, isCheckoutEnabled, priceIdForTier, type Tier } from '@/lib/stripe'

export const runtime = 'nodejs'

// POST /api/billing/checkout
// Body: { tier: 'creator' | 'artist' | 'pro' }
// Returns: { url: string } — Stripe-hosted Checkout URL.

export async function POST(req: NextRequest) {
  try {
    if (!isCheckoutEnabled()) {
      return NextResponse.json({ error: 'checkout_disabled' }, { status: 503 })
    }

    const gate = await requireUser(req)
    if (gate instanceof NextResponse) return gate
    const { user } = gate

    const body = await req.json().catch(() => ({}))
    const tier = body?.tier as Tier
    if (!tier || tier === 'free' || tier === 'management') {
      return NextResponse.json({ error: 'invalid_tier' }, { status: 400 })
    }

    const priceId = priceIdForTier(tier)
    if (!priceId) {
      return NextResponse.json({ error: 'price_not_configured' }, { status: 500 })
    }

    const stripe = getStripe()
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Reuse customer if one already exists for this user.
    const { data: existing, error: subErr } = await service
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (subErr) {
      console.error('checkout: subscriptions read failed', subErr)
      return NextResponse.json({ error: `db_read_failed: ${subErr.message}` }, { status: 500 })
    }

    let customerId = existing?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
      const { error: upErr } = await service.from('subscriptions').upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          tier: 'free',
          status: 'inactive',
        },
        { onConflict: 'user_id' }
      )
      if (upErr) {
        console.error('checkout: subscriptions upsert failed', upErr)
        return NextResponse.json({ error: `db_write_failed: ${upErr.message}` }, { status: 500 })
      }
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?status=success`,
      cancel_url: `${origin}/pricing?status=cancelled`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { user_id: user.id } },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('checkout: fatal', err?.message, err?.stack)
    return NextResponse.json(
      { error: err?.message || 'checkout_failed', type: err?.type, code: err?.code },
      { status: 500 }
    )
  }
}
