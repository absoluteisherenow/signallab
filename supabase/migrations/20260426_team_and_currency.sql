-- ── Team contacts + currency ────────────────────────────────────────────────
-- One-shot extension to artist_settings to support the streamlined onboarding
-- experience: capture team contacts once, auto-CC on every invoice / advance,
-- and lock currency to the user's home country (multi-currency = Pro+ only).
--
-- payment JSONB structure now includes business_type and vat_registered:
--   {
--     legal_name, address, vat_number, vat_registered (bool),
--     business_type ('sole_trader' | 'ltd' | 'partnership' | 'other'),
--     payment_terms, bank_accounts: [...]
--   }

-- Team contacts — auto-CC targets for invoices, advances, booking confirmations
ALTER TABLE artist_settings ADD COLUMN IF NOT EXISTS team JSONB DEFAULT '{}'::jsonb;
-- team structure:
-- {
--   "manager":      { "name": "...", "email": "..." },
--   "agent":        { "name": "...", "email": "..." },
--   "accountant":   { "name": "...", "email": "..." },
--   "tour_manager": { "name": "...", "email": "..." }
-- }

-- Default currency — derived from country at onboarding. Creator/Artist tiers
-- are locked to this; Pro+ can override per gig/invoice. Stored on
-- artist_settings rather than in payment JSONB because it's a UX-level setting,
-- not a banking detail.
ALTER TABLE artist_settings ADD COLUMN IF NOT EXISTS default_currency TEXT
  CHECK (default_currency IN ('GBP', 'EUR', 'USD', 'AUD', 'NZD', 'CAD'));
