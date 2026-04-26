import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getStripe, isCheckoutEnabled, tierFromPriceId } from '@/lib/stripe'
import type Stripe from 'stripe'

export const runtime = 'nodejs'

// Stripe webhook — listens to checkout + subscription lifecycle and updates
// the subscriptions table. Endpoint configured in Stripe Dashboard:
//   URL: https://signallabos.com/api/billing/webhook
//   Events: checkout.session.completed, customer.subscription.created,
//           customer.subscription.updated, customer.subscription.deleted

export async function POST(req: NextRequest) {
  if (!isCheckoutEnabled()) {
    return NextResponse.json({ error: 'checkout_disabled' }, { status: 503 })
  }
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'no_signature' }, { status: 400 })

  const raw = await req.text()
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET!
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (err: any) {
    return NextResponse.json({ error: `signature_failed: ${err.message}` }, { status: 400 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  async function upsertFromSubscription(sub: Stripe.Subscription) {
    const userId =
      (sub.metadata?.user_id as string | undefined) ||
      (await resolveUserIdFromCustomer(service, sub.customer as string))
    if (!userId) return

    const item = sub.items.data[0]
    const priceId = item?.price.id
    const tier = tierFromPriceId(priceId)
    // current_period_end moved onto subscription items in API 2025-03+. Fall
    // back to the top-level field for older webhook payloads.
    const periodEnd: number | undefined =
      (item as any)?.current_period_end ?? (sub as any).current_period_end

    await service.from('subscriptions').upsert(
      {
        user_id: userId,
        stripe_customer_id: sub.customer as string,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        tier,
        status: sub.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string)
          await upsertFromSubscription(sub)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await upsertFromSubscription(event.data.object as Stripe.Subscription)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const userId =
          (sub.metadata?.user_id as string | undefined) ||
          (await resolveUserIdFromCustomer(service, sub.customer as string))
        if (userId) {
          await service
            .from('subscriptions')
            .update({
              tier: 'free',
              status: 'canceled',
              cancel_at_period_end: false,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
        }
        break
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function resolveUserIdFromCustomer(
  service: SupabaseClient<any>,
  customerId: string
): Promise<string | null> {
  const { data } = await service
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return ((data as any)?.user_id as string | null) || null
}
