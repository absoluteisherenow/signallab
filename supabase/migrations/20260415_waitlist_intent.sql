-- Extend waitlist with tier intent + role + source + IP hash for rate limiting.
-- Existing rows keep NULL for the new columns; constraints only apply to new inserts.

ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS tier_intent TEXT
    CHECK (tier_intent IN ('creator','artist','pro','unsure')),
  ADD COLUMN IF NOT EXISTS role TEXT
    CHECK (role IN ('dj_producer','producer','dj','manager_label')),
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS waitlist_ip_hash_created_idx
  ON waitlist (ip_hash, created_at DESC);
