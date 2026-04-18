-- Growth Section (Slice 4) — tables backing the NM 10K-follower plan dashboard.
-- Plan: ~/.claude/plans/paid-follower-growth-nm.md
--
-- Three tables:
--   1. growth_monthly_targets   — 6-month budget + projection table from plan
--   2. growth_capture_moments   — critical content capture dates (Soho House, EP, Athens, Vespers...)
--   3. growth_creative_queue    — queued organic posts ready to become the next ad creative

-- =============================================================================
-- 1. growth_monthly_targets
-- =============================================================================
CREATE TABLE IF NOT EXISTS growth_monthly_targets (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL,
  handle                   TEXT NOT NULL,           -- e.g. '@nightmanoeuvres'
  month                    TEXT NOT NULL,           -- 'YYYY-MM'

  planned_spend_gbp        NUMERIC,
  projection_conservative  INTEGER,
  projection_realistic     INTEGER,
  projection_optimistic    INTEGER,

  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS gmt_handle_month_uniq
  ON growth_monthly_targets (handle, month);

CREATE INDEX IF NOT EXISTS gmt_user_idx
  ON growth_monthly_targets (user_id);


-- =============================================================================
-- 2. growth_capture_moments
-- =============================================================================
CREATE TABLE IF NOT EXISTS growth_capture_moments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL,
  moment_date        DATE NOT NULL,
  label              TEXT NOT NULL,
  why                TEXT,
  gig_id             UUID REFERENCES gigs(id) ON DELETE SET NULL,
  content_captured   BOOLEAN NOT NULL DEFAULT FALSE,
  captured_at        TIMESTAMPTZ,
  asset_refs         JSONB,                          -- links to R2 paths, IG post IDs, etc.
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gcm_user_date_idx
  ON growth_capture_moments (user_id, moment_date);


-- =============================================================================
-- 3. growth_creative_queue
-- =============================================================================
CREATE TABLE IF NOT EXISTS growth_creative_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  source_post_id    UUID REFERENCES instagram_posts(id) ON DELETE CASCADE,

  rank_score        NUMERIC,                         -- from engagement analysis at queue time
  rank_reason       TEXT,                            -- "top saves last 14d", "highest reach-per-follower ratio" etc.

  queued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at           TIMESTAMPTZ,                     -- set when wired into an active campaign
  used_in_campaign  UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  dismissed_at      TIMESTAMPTZ,

  notes             TEXT
);

CREATE INDEX IF NOT EXISTS gcq_user_queued_idx
  ON growth_creative_queue (user_id, queued_at DESC)
  WHERE used_at IS NULL AND dismissed_at IS NULL;


-- =============================================================================
-- Seed: NM 10K plan (Apr 2026 — Sep 2026) from paid-follower-growth-nm.md
-- user_id is placeholder — reconciled on first app sync.
-- =============================================================================
WITH seed_user AS (
  SELECT gen_random_uuid() AS uid
)
INSERT INTO growth_monthly_targets (
  user_id, handle, month,
  planned_spend_gbp, projection_conservative, projection_realistic, projection_optimistic, notes
)
SELECT (SELECT uid FROM seed_user), '@nightmanoeuvres', m.month, m.spend, m.c, m.r, m.o, m.notes
FROM (VALUES
  ('2026-04', 25, 1700,  2000,  2400, 'Always-on seeding. Build retargeting pool.'),
  ('2026-05', 30, 2200,  2800,  3500, 'Add Stage 2 retargeting on warm pool.'),
  ('2026-06', 35, 3000,  3800,  5000, 'Scale what''s working.'),
  ('2026-07', 35, 4000,  5200,  6500, 'Double down on top creatives.'),
  ('2026-08', 40, 5500,  7000,  8500, 'Peak content window (summer).'),
  ('2026-09', 40, 7000, 10000, 12000, 'Final push to 10K. Retarget all months 1-5 engagers.')
) AS m(month, spend, c, r, o, notes)
ON CONFLICT (handle, month) DO NOTHING;


-- Seed: critical capture moments from plan
WITH seed_user AS (
  SELECT gen_random_uuid() AS uid
)
INSERT INTO growth_capture_moments (user_id, moment_date, label, why)
SELECT (SELECT uid FROM seed_user), m.d::date, m.label, m.why
FROM (VALUES
  ('2026-04-10', 'Soho House set clips',    'First major UK content this campaign'),
  ('2026-04-17', 'All for You EP release',  'Best reach window of Phase 1'),
  ('2026-05-14', 'Athens / Caribou footage', 'International + credibility = strong follow magnet'),
  ('2026-06-12', 'Vespers',                 'Peak energy content for months of ads')
) AS m(d, label, why)
ON CONFLICT DO NOTHING;


-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at_growth()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gmt_set_updated_at ON growth_monthly_targets;
CREATE TRIGGER gmt_set_updated_at
  BEFORE UPDATE ON growth_monthly_targets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_growth();

DROP TRIGGER IF EXISTS gcm_set_updated_at ON growth_capture_moments;
CREATE TRIGGER gcm_set_updated_at
  BEFORE UPDATE ON growth_capture_moments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_growth();
