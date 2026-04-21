-- Backfill orphan user_ids on growth-related tables so Anthony (the sole live
-- auth user at time of writing) can read his own seed data under the new
-- `auth.uid() = user_id` RLS policies.
--
-- Context: earlier seed migrations used `gen_random_uuid()` placeholders for
-- user_id on follower_snapshots / growth_monthly_targets / growth_capture_moments,
-- and the ads-snapshot cron wrote follower_snapshots with the literal
-- '00000000-0000-0000-0000-000000000000' system placeholder. None of those
-- UUIDs exist in auth.users, so the tenant-scoped /api/growth/overview reader
-- returned empty arrays. This migration reassigns every such row to Anthony's
-- real auth.users.id so the reader sees the data once the cron+reader fixes
-- land.
--
-- Scope: only rows tied to Anthony's sole handle (`@nightmanoeuvres`) or to
-- capture moments which exist only as his seed rows at this point. If you
-- rerun this later with rows belonging to a different tenant, re-audit before
-- applying.
--
-- Anthony's UUID (absoluteishere@gmail.com) — confirmed via auth.users on
-- 2026-04-20: 6a0365ab-0ffb-4ad1-bc5b-0787cfcba767

BEGIN;

UPDATE follower_snapshots
  SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767'
  WHERE handle = '@nightmanoeuvres'
    AND user_id <> '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767';

UPDATE growth_monthly_targets
  SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767'
  WHERE handle = '@nightmanoeuvres'
    AND user_id <> '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767';

UPDATE growth_capture_moments
  SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767'
  WHERE user_id <> '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767';

COMMIT;
