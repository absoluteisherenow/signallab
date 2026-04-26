// ── Currency derivation + tier gating ───────────────────────────────────────
// Source of truth for "what currency does this artist use by default".
// Creator/Artist tiers are locked to this default — multi-currency invoicing
// is a Pro+ feature. Saves us from asking "what currency?" at onboarding.

import type { Tier } from '@/lib/stripe'

export type SupportedCurrency = 'GBP' | 'EUR' | 'USD' | 'AUD' | 'NZD' | 'CAD'

const EU_EURO = new Set([
  'IE','DE','FR','ES','IT','NL','BE','AT','PT','GR','FI','LU',
  'SI','SK','EE','LV','LT','MT','CY','HR',
])

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'united kingdom': 'GB',
  'great britain': 'GB',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'northern ireland': 'GB',
  'ireland': 'IE',
  'germany': 'DE',
  'france': 'FR',
  'spain': 'ES',
  'italy': 'IT',
  'netherlands': 'NL',
  'belgium': 'BE',
  'austria': 'AT',
  'portugal': 'PT',
  'greece': 'GR',
  'finland': 'FI',
  'united states': 'US',
  'usa': 'US',
  'canada': 'CA',
  'australia': 'AU',
  'new zealand': 'NZ',
}

export function defaultCurrencyForCountry(country?: string | null): SupportedCurrency {
  if (!country) return 'EUR'
  const raw = country.trim()
  const upper = raw.toUpperCase()
  // Try ISO-2 first, then full name lookup
  const code = upper.length === 2 ? upper : (COUNTRY_NAME_TO_CODE[raw.toLowerCase()] || upper.slice(0, 2))

  if (code === 'GB' || code === 'UK') return 'GBP'
  if (EU_EURO.has(code)) return 'EUR'
  if (code === 'US') return 'USD'
  if (code === 'AU') return 'AUD'
  if (code === 'NZ') return 'NZD'
  if (code === 'CA') return 'CAD'
  return 'EUR'
}

// Multi-currency invoicing is gated to Pro+ (matches the pricing page).
// Creator/Artist see their default currency on every form, no picker.
const MULTI_CURRENCY_TIERS: Tier[] = ['pro', 'road', 'management']
export function tierAllowsMultiCurrency(tier: Tier): boolean {
  return MULTI_CURRENCY_TIERS.includes(tier)
}

export const CURRENCY_SYMBOL: Record<SupportedCurrency, string> = {
  GBP: '£',
  EUR: '€',
  USD: '$',
  AUD: 'A$',
  NZD: 'NZ$',
  CAD: 'C$',
}
