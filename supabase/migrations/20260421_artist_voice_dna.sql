-- Voice DNA enrichment on artist_profiles. Stores a richer voice fingerprint
-- beyond stats-only (lowercase_pct etc) so the brain can inject word-choice,
-- rhythm, signature moves, and never-says into the system prompt.
--
-- Shape (validated by application layer, not DB):
-- {
--   "word_choice": { "prefers": string[], "avoids": string[] },
--   "rhythm":       { "avg_sentence_length": number, "variance": "low"|"medium"|"high" },
--   "never_says":   string[],
--   "signature_moves": string[],
--   "emoji_use":    "never"|"rare"|"moderate"|"frequent",
--   "punctuation_quirks": string[]
-- }
--
-- Applied live 2026-04-21 via Management API. This file locks the state into
-- version control so a DB rebuild produces the same column.

ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS voice_dna JSONB DEFAULT '{}'::JSONB;
