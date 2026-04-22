-- Outcome-weighted rule registry. The brain's `invariant_log` records every
-- check verdict (pass/fail) per generation. `post_performance` records how
-- the post actually performed once published. This migration adds the columns
-- the nightly learning job writes back to `rule_registry` so we can spot rules
-- that are hurting (captions that failed this rule OUT-performed the baseline)
-- or rules that are working (captions that failed this rule UNDER-performed).
--
-- v1 is read-only analytics — we surface the numbers, we don't auto-demote
-- rules yet. Lift below -5 means the rule is probably over-firing; above +5
-- means the rule is tracking a real negative-quality signal.

ALTER TABLE rule_registry
  ADD COLUMN IF NOT EXISTS lift_vs_baseline FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sample_size INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

-- Index for the nightly job's per-user rollup.
CREATE INDEX IF NOT EXISTS invariant_log_user_rule_idx
  ON invariant_log (user_id, rule_slug, called_at DESC);
