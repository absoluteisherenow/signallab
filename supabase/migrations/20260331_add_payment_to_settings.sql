-- Payment details and tier for invoice auto-generation
ALTER TABLE artist_settings ADD COLUMN IF NOT EXISTS payment JSONB DEFAULT '{}'::jsonb;
ALTER TABLE artist_settings ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free';

-- payment structure:
-- {
--   "legal_name": "John Smith",
--   "address": "123 Main St, London",
--   "vat_number": "",
--   "payment_terms": 30,
--   "bank_accounts": [
--     {
--       "id": "uuid",
--       "currency": "GBP",
--       "account_name": "John Smith",
--       "sort_code": "20-00-00",
--       "account_number": "12345678",
--       "iban": "",
--       "swift_bic": "",
--       "bank_name": "Barclays",
--       "is_default": true
--     }
--   ]
-- }
