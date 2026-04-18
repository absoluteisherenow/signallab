-- Ads Lifecycle (Slice 1) — foundation for launch → monitor → score → results.
-- Plan: ~/.claude/plans/ads-lifecycle-implementation.md
--
-- Three tables:
--   1. campaigns                     — local record of every Meta campaign launched via Signal Lab
--   2. campaign_metrics_snapshots    — daily time-series of insights per campaign
--   3. follower_snapshots            — daily time-series of IG follower count (powers Growth trajectory chart)
--
-- Auth pattern matches existing Signal Lab tables: app-level auth via requireUser gate,
-- no RLS, no explicit FK to auth.users (user_id UUID NOT NULL).

-- =============================================================================
-- 1. campaigns
-- =============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,

  -- Meta linkage
  meta_campaign_id  TEXT UNIQUE,          -- nullable while 'planned', populated on launch

  -- Identity
  name              TEXT NOT NULL,
  objective         TEXT,                 -- Meta objective (OUTCOME_ENGAGEMENT, OUTCOME_AWARENESS, etc.)
  phase_label       TEXT,                 -- e.g. "follower_growth_month_1", "all_for_you_ep_burst"
  intent            TEXT CHECK (intent IN (
                      'boost','cold','retarget',
                      'growth_stage_1','growth_stage_2',
                      'release_burst','ticket_sales','other'
                    )),

  -- Linkage to other Signal Lab entities
  post_id           UUID REFERENCES instagram_posts(id) ON DELETE SET NULL,
  gig_id            UUID REFERENCES gigs(id)            ON DELETE SET NULL,

  -- Strategy
  hypothesis        TEXT,
  target_metric     TEXT,                 -- e.g. "followers_gained", "link_clicks", "saves"
  target_value      NUMERIC,

  -- Lifecycle
  launched_at       TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('planned','active','paused','ended','failed')),

  -- Audit
  notes             TEXT,
  created_by        TEXT DEFAULT 'manual'
                      CHECK (created_by IN ('manual','planner','growth_engine','api')),
  approved_at       TIMESTAMPTZ,          -- required before status can go 'active' (preview→approve gate)
  approved_by       TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaigns_user_status_idx
  ON campaigns (user_id, status);

CREATE INDEX IF NOT EXISTS campaigns_user_phase_idx
  ON campaigns (user_id, phase_label)
  WHERE phase_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaigns_post_idx
  ON campaigns (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaigns_gig_idx
  ON campaigns (gig_id)
  WHERE gig_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaigns_meta_id_idx
  ON campaigns (meta_campaign_id)
  WHERE meta_campaign_id IS NOT NULL;

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at_campaigns()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS campaigns_set_updated_at ON campaigns;
CREATE TRIGGER campaigns_set_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_campaigns();


-- =============================================================================
-- 2. campaign_metrics_snapshots — daily insights time-series
-- =============================================================================
CREATE TABLE IF NOT EXISTS campaign_metrics_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  captured_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_for_date     DATE NOT NULL,       -- the date the metrics cover (allows idempotent daily writes)

  -- Core metrics
  spend                 NUMERIC,
  reach                 INTEGER,
  impressions           INTEGER,
  clicks                INTEGER,
  cpc                   NUMERIC,
  cpm                   NUMERIC,
  ctr                   NUMERIC,
  frequency             NUMERIC,

  -- Engagement breakdown (from actions array)
  link_clicks           INTEGER,
  saves                 INTEGER,
  shares                INTEGER,
  profile_visits        INTEGER,
  video_views           INTEGER,
  video_views_75pct     INTEGER,              -- retargeting pool signal

  -- Follower attribution (computed from follower_snapshots delta)
  followers_delta       INTEGER,

  -- Meta diagnostics (ranking API)
  quality_ranking       TEXT,                 -- ABOVE_AVERAGE | AVERAGE | BELOW_AVERAGE_(35|20|10)
  engagement_ranking    TEXT,
  conversion_ranking    TEXT,

  -- Raw payloads for audit + never-fabricate rule
  actions_jsonb         JSONB,
  raw_insights_jsonb    JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent daily writes: one snapshot per (campaign, date)
CREATE UNIQUE INDEX IF NOT EXISTS cms_campaign_date_uniq
  ON campaign_metrics_snapshots (campaign_id, captured_for_date);

CREATE INDEX IF NOT EXISTS cms_campaign_captured_idx
  ON campaign_metrics_snapshots (campaign_id, captured_for_date DESC);


-- =============================================================================
-- 3. follower_snapshots — daily IG follower count time-series (for Growth trajectory)
-- =============================================================================
CREATE TABLE IF NOT EXISTS follower_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  handle           TEXT NOT NULL,             -- e.g. '@nightmanoeuvres'
  platform         TEXT NOT NULL DEFAULT 'instagram'
                     CHECK (platform IN ('instagram','tiktok','youtube','spotify','other')),

  followers_count  INTEGER NOT NULL,
  following_count  INTEGER,
  posts_count      INTEGER,

  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_for_date DATE NOT NULL,

  source           TEXT DEFAULT 'business_discovery'
                     CHECK (source IN ('business_discovery','hiker','apify','manual','artist_profiles_sync')),

  raw_jsonb        JSONB,                     -- full scraper payload for audit

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent daily writes: one snapshot per (handle, platform, date)
CREATE UNIQUE INDEX IF NOT EXISTS follower_snapshots_handle_date_uniq
  ON follower_snapshots (handle, platform, captured_for_date);

CREATE INDEX IF NOT EXISTS follower_snapshots_user_captured_idx
  ON follower_snapshots (user_id, captured_for_date DESC);

CREATE INDEX IF NOT EXISTS follower_snapshots_handle_captured_idx
  ON follower_snapshots (handle, captured_for_date DESC);


-- =============================================================================
-- Seed: backfill today's follower snapshot from artist_profiles if present
-- (gives the Growth trajectory chart a starting data point)
-- =============================================================================
INSERT INTO follower_snapshots (user_id, handle, followers_count, captured_for_date, source)
SELECT
  gen_random_uuid(),        -- placeholder user_id; will be reconciled by first app sync
  handle,
  follower_count,
  CURRENT_DATE,
  'artist_profiles_sync'
FROM artist_profiles
WHERE follower_count IS NOT NULL
  AND handle IS NOT NULL
ON CONFLICT (handle, platform, captured_for_date) DO NOTHING;
