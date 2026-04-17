-- Ledger of every Sonnet Artist Scan run. Used by artistScanTiers.canRunArtistScan
-- to enforce per-tier monthly limits BEFORE the model call.

CREATE TABLE IF NOT EXISTS artist_scan_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  target_handle TEXT,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tier_at_run   TEXT CHECK (tier_at_run IN ('creator','artist','pro','management')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS artist_scan_runs_user_ran_idx
  ON artist_scan_runs (user_id, ran_at DESC);
