import Stripe from 'stripe'

// ── Stripe client + tier config ─────────────────────────────────────────────
// Lazy-init so the module loads on platforms without STRIPE_SECRET_KEY (e.g.
// preview deploys before keys are set). Callers should branch on
// `isCheckoutEnabled()` before invoking anything that hits Stripe.

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY not set — checkout is disabled')
  }
  _stripe = new Stripe(key, { apiVersion: '2025-03-31.basil' as any })
  return _stripe
}

export function isCheckoutEnabled(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_CREATOR &&
      process.env.STRIPE_PRICE_ARTIST &&
      process.env.STRIPE_PRICE_PRO &&
      process.env.STRIPE_PRICE_ROAD
  )
}

export type Tier = 'free' | 'creator' | 'artist' | 'pro' | 'road' | 'management'

// Price ID → tier name mapping. Anthony creates the Products + Prices in the
// Stripe Dashboard, copies the price IDs into env, and the webhook resolves
// tier from price ID on subscription.updated events.
export function tierFromPriceId(priceId: string | null | undefined): Tier {
  if (!priceId) return 'free'
  if (priceId === process.env.STRIPE_PRICE_CREATOR) return 'creator'
  if (priceId === process.env.STRIPE_PRICE_ARTIST) return 'artist'
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_ROAD) return 'road'
  return 'free'
}

export function priceIdForTier(tier: Tier): string | null {
  switch (tier) {
    case 'creator':    return process.env.STRIPE_PRICE_CREATOR    || null
    case 'artist':     return process.env.STRIPE_PRICE_ARTIST     || null
    case 'pro':        return process.env.STRIPE_PRICE_PRO        || null
    case 'road':       return process.env.STRIPE_PRICE_ROAD       || null
    default:           return null
  }
}
