-- Promo list — contacts artists service releases to (DJs, label people, mates)
ALTER TABLE artist_settings ADD COLUMN IF NOT EXISTS promo_list JSONB DEFAULT '[]'::jsonb;

-- promo_list structure: array of contacts
-- [{
--   id: string,
--   name: string,
--   email?: string,
--   whatsapp?: string,   -- international format e.g. +447700900123
--   instagram?: string,  -- handle without @
--   tag?: string         -- 'DJ' | 'Label' | 'Blog' | 'Mate' | 'PR' | 'Other'
-- }]
