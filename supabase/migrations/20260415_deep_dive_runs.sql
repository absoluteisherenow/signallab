-- Ledger of every Opus Deep Dive run. Used by deepDiveTiers.canRunDeepDive
-- to enforce per-tier limits BEFORE the model call.

CREATE TABLE IF NOT EXISTS deep_dive_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  ran_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tier_at_run TEXT CHECK (tier_at_run IN ('creator','artist','pro','management')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deep_dive_runs_user_ran_idx
  ON deep_dive_runs (user_id, ran_at DESC);
