-- Phase A foundation: close the open loop between scheduled_posts and
-- post_performance, add multi-tenant columns, and add cron observability.
--
-- Applied live via Supabase Management API 2026-04-22.
--
-- Context: sync-performance writes engagement to scheduled_posts, but the
-- brain reads from post_performance — which had no writer. Every brain call
-- was grounding on empty data. This migration adds the bridge columns so a
-- single upsert in sync-performance closes the loop.

BEGIN;

-- =============================================================================
-- 1. post_performance — add the missing keys and denorm columns so the bridge
--    from scheduled_posts can write a complete row the brain can read.
-- =============================================================================

ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS artist_name text;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS likes integer;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS comments integer;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS engagement_score numeric;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS posted_at timestamptz;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS scheduled_post_id uuid;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS scan_id uuid;
ALTER TABLE post_performance ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_performance_scheduled_post_id
  ON post_performance(scheduled_post_id)
  WHERE scheduled_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_post_performance_user_id
  ON post_performance(user_id);

CREATE INDEX IF NOT EXISTS idx_post_performance_engagement_score
  ON post_performance(engagement_score DESC NULLS LAST);

-- =============================================================================
-- 2. scheduled_posts — add user_id (multi-tenant) + scan_id (close the loop
--    back to the Media Scanner row that produced the approved caption).
-- =============================================================================

ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS scan_id uuid;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id
  ON scheduled_posts(user_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scan_id
  ON scheduled_posts(scan_id);

-- Backfill user_id for Anthony's existing rows so the week-grid keeps
-- returning data after the column lands. Safe because this DB has exactly
-- one authenticated user today (verified in 20260420_multitenant_rls_policies
-- preconditions).
UPDATE scheduled_posts
SET user_id = (SELECT id FROM auth.users LIMIT 1)
WHERE user_id IS NULL;

-- =============================================================================
-- 3. cron_runs — observability for the scheduled layer. Silent cron misses
--    would invalidate every downstream claim; this table makes that visible.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cron_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'error' | 'skipped'
  error text,
  meta jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_name_started
  ON cron_runs(name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_runs_status
  ON cron_runs(status, started_at DESC);

-- 14-day retention — prune older rows in a nightly cleanup (handled in cron)
-- to keep this table small. No RLS: service-role only writes, admin reads.

COMMIT;
