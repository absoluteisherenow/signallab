-- Ads automation: rule verdicts + creative queue.
--
-- 1. Drops growth_creative_queue (migrated but never wired) in favour of
--    ad_creative_queue below, which matches the intent-aware schema the
--    /api/ads/creative-queue route already expects.
-- 2. ad_creative_queue — pre-approved IG posts ready to rotate onto an active
--    adset when a fatigue rule fires (Lever #1 auto-rotate).
-- 3. ads_rule_verdicts — daily rule engine verdicts with approve-before-send
--    gate (populated by /api/crons/ads-evaluate, consumed by /api/ads/apply-rule).

-- =============================================================================
-- 1. Drop unused growth_creative_queue
-- =============================================================================
DROP TABLE IF EXISTS growth_creative_queue CASCADE;


-- =============================================================================
-- 2. ad_creative_queue
-- =============================================================================
CREATE TABLE IF NOT EXISTS ad_creative_queue (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL,

  intent                 TEXT NOT NULL
                           CHECK (intent IN ('growth_stage_1','growth_stage_2')),

  -- IG source post (live on IG, boost-ready)
  ig_post_id             TEXT NOT NULL,
  ig_permalink           TEXT,
  ig_caption_excerpt     TEXT,

  -- Ordering: lower = higher priority. Default 100 so insert order is preserved.
  position               INTEGER NOT NULL DEFAULT 100,

  -- Lifecycle: queued → active (currently live on an adset) → used | archived
  status                 TEXT NOT NULL DEFAULT 'queued'
                           CHECK (status IN ('queued','active','used','archived')),

  -- Link to the campaign that consumed this creative (swap_creative action).
  used_at                TIMESTAMPTZ,
  used_for_campaign_id   UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  used_for_adset_id      TEXT,                       -- Meta adset id after swap

  -- Approve-before-send: user can pre-approve creatives so the rotate action
  -- only swaps to already-approved items.
  approved_at            TIMESTAMPTZ,
  approved_by            UUID,

  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One IG post shouldn't appear twice in the same intent lane for one user.
CREATE UNIQUE INDEX IF NOT EXISTS acq_user_intent_post_uniq
  ON ad_creative_queue (user_id, intent, ig_post_id);

-- Lookups by the apply-rule route: "next queued creative for this intent".
CREATE INDEX IF NOT EXISTS acq_user_intent_status_position_idx
  ON ad_creative_queue (user_id, intent, status, position)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS acq_campaign_idx
  ON ad_creative_queue (used_for_campaign_id)
  WHERE used_for_campaign_id IS NOT NULL;


-- =============================================================================
-- 3. ads_rule_verdicts
-- =============================================================================
CREATE TABLE IF NOT EXISTS ads_rule_verdicts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL,
  campaign_id            UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  meta_campaign_id       TEXT NOT NULL,

  rule_id                TEXT NOT NULL,              -- matches RuleResult.id in scaling-rules.ts
  verdict                TEXT NOT NULL
                           CHECK (verdict IN ('safe','warning','action','insufficient_data')),
  current_value          NUMERIC,
  threshold              TEXT,
  recommendation         TEXT,

  -- Action dispatch (nullable — not every rule has a one-click action)
  action_type            TEXT
                           CHECK (action_type IN (
                             'scale_budget','pause_campaign','swap_creative','propose_stage_2'
                           )),
  action_payload         JSONB,

  -- Idempotency: one verdict per (campaign, rule, day)
  evaluated_for_date     DATE NOT NULL,
  evaluated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Approve-before-send lifecycle
  applied_at             TIMESTAMPTZ,
  applied_by             UUID,
  applied_result         JSONB,
  dismissed_at           TIMESTAMPTZ,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS arv_campaign_rule_date_uniq
  ON ads_rule_verdicts (campaign_id, rule_id, evaluated_for_date);

CREATE INDEX IF NOT EXISTS arv_user_date_idx
  ON ads_rule_verdicts (user_id, evaluated_for_date DESC);

-- Open (actionable, not applied/dismissed) verdict queue — powers the dashboard
-- notification approve list.
CREATE INDEX IF NOT EXISTS arv_user_open_idx
  ON ads_rule_verdicts (user_id, evaluated_for_date DESC)
  WHERE verdict = 'action' AND applied_at IS NULL AND dismissed_at IS NULL;

-- Scale-up guardrail lookup: "did we scale this campaign in the last 48h?"
CREATE INDEX IF NOT EXISTS arv_campaign_applied_idx
  ON ads_rule_verdicts (campaign_id, action_type, applied_at DESC)
  WHERE applied_at IS NOT NULL;


-- =============================================================================
-- updated_at trigger for ad_creative_queue
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at_ads_auto()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS acq_set_updated_at ON ad_creative_queue;
CREATE TRIGGER acq_set_updated_at
  BEFORE UPDATE ON ad_creative_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_ads_auto();
