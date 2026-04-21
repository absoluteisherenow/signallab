-- Trend snapshots — nightly (or on-demand) scrape of scene-level signal for
-- underground electronic music. The brain reads the latest row for this user
-- (or the shared NULL-user row if they haven't enabled per-artist scraping)
-- and injects a "Scene signal" primer block so every AI call sees what's
-- moving right now without baking it into code.
--
-- Columns are JSONB arrays of short strings. `primer_md` lets a writer prebuild
-- the block with richer structure (subsections, nuance) — loader prefers it
-- when present.

CREATE TABLE IF NOT EXISTS trend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Arrays of short descriptors. Example: sounds = ["140bpm bleepy UK stuff", "afro-house polyrhythm loops"]
  sounds JSONB DEFAULT '[]'::JSONB,
  formats JSONB DEFAULT '[]'::JSONB,
  topics JSONB DEFAULT '[]'::JSONB,
  -- Pre-composed primer block, overrides the auto-formatted version when set.
  primer_md TEXT,
  source TEXT, -- 'ra' | 'soundcloud' | 'manual' | 'beatport' | 'cron'
  notes TEXT
);

CREATE INDEX IF NOT EXISTS trend_snapshots_user_updated_idx
  ON trend_snapshots (user_id, updated_at DESC);

-- NULL user = global scene snapshot (default fallback when user hasn't
-- configured per-artist trend scraping).
CREATE INDEX IF NOT EXISTS trend_snapshots_global_idx
  ON trend_snapshots (updated_at DESC) WHERE user_id IS NULL;

ALTER TABLE trend_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trend_snapshots_read ON trend_snapshots;
CREATE POLICY trend_snapshots_read ON trend_snapshots
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS trend_snapshots_write ON trend_snapshots;
CREATE POLICY trend_snapshots_write ON trend_snapshots
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
