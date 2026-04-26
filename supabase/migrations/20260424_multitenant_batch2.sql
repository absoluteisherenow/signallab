-- Multi-tenant Batch 2 — add user_id + user_owns_row RLS to the 10 remaining
-- tables flagged in 20260420_multitenant_rls_policies.sql. After this lands,
-- every public.* table with user-owned data is scoped by auth.uid() = user_id.
-- This is the last DB-side prereq before public signup flips on.
--
-- Applied live via Supabase Management API on 2026-04-24.
--
-- Preconditions:
--   - Single auth.users row: 6a0365ab-0ffb-4ad1-bc5b-0787cfcba767
--     (absoluteishere@gmail.com). All existing rows backfill to this id.
--   - scheduled_posts already has user_id (from earlier ad-hoc migration); this
--     file replaces its anthony_only_all policies with user_owns_row_*.

BEGIN;

-- =============================================================================
-- Step 1: add user_id columns + backfill (9 tables — scheduled_posts already has it)
-- =============================================================================

ALTER TABLE public.advance_requests     ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.artist_profiles      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.comment_automations  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.crew_briefing_drafts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.dj_sets              ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.expenses             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.gig_contacts         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.releases             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.travel_bookings      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill all existing rows to anthony's user_id.
UPDATE public.advance_requests     SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;
UPDATE public.artist_profiles      SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;
UPDATE public.comment_automations  SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;
UPDATE public.crew_briefing_drafts SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;
UPDATE public.dj_sets              SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;
UPDATE public.expenses             SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;
UPDATE public.gig_contacts         SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;
UPDATE public.releases             SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;
UPDATE public.travel_bookings      SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;
UPDATE public.scheduled_posts      SET user_id = '6a0365ab-0ffb-4ad1-bc5b-0787cfcba767' WHERE user_id IS NULL;

-- Lock the column down so future inserts must specify it.
ALTER TABLE public.advance_requests     ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.artist_profiles      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.comment_automations  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.crew_briefing_drafts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.dj_sets              ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.expenses             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.gig_contacts         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.releases             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.travel_bookings      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.scheduled_posts      ALTER COLUMN user_id SET NOT NULL;

-- Index user_id for query perf — most queries filter by it.
CREATE INDEX IF NOT EXISTS advance_requests_user_id_idx     ON public.advance_requests(user_id);
CREATE INDEX IF NOT EXISTS artist_profiles_user_id_idx      ON public.artist_profiles(user_id);
CREATE INDEX IF NOT EXISTS comment_automations_user_id_idx  ON public.comment_automations(user_id);
CREATE INDEX IF NOT EXISTS crew_briefing_drafts_user_id_idx ON public.crew_briefing_drafts(user_id);
CREATE INDEX IF NOT EXISTS dj_sets_user_id_idx              ON public.dj_sets(user_id);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx             ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS gig_contacts_user_id_idx         ON public.gig_contacts(user_id);
CREATE INDEX IF NOT EXISTS releases_user_id_idx             ON public.releases(user_id);
CREATE INDEX IF NOT EXISTS travel_bookings_user_id_idx      ON public.travel_bookings(user_id);
CREATE INDEX IF NOT EXISTS scheduled_posts_user_id_idx      ON public.scheduled_posts(user_id);

-- =============================================================================
-- Step 2: enable RLS + replace anthony_only_all with user_owns_row_*
-- =============================================================================

-- advance_requests
ALTER TABLE public.advance_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.advance_requests;
DROP POLICY IF EXISTS user_owns_row_select ON public.advance_requests;
DROP POLICY IF EXISTS user_owns_row_insert ON public.advance_requests;
DROP POLICY IF EXISTS user_owns_row_update ON public.advance_requests;
DROP POLICY IF EXISTS user_owns_row_delete ON public.advance_requests;
CREATE POLICY user_owns_row_select ON public.advance_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.advance_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.advance_requests FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.advance_requests FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- artist_profiles
ALTER TABLE public.artist_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.artist_profiles;
DROP POLICY IF EXISTS user_owns_row_select ON public.artist_profiles;
DROP POLICY IF EXISTS user_owns_row_insert ON public.artist_profiles;
DROP POLICY IF EXISTS user_owns_row_update ON public.artist_profiles;
DROP POLICY IF EXISTS user_owns_row_delete ON public.artist_profiles;
CREATE POLICY user_owns_row_select ON public.artist_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.artist_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.artist_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.artist_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- comment_automations
ALTER TABLE public.comment_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.comment_automations;
DROP POLICY IF EXISTS user_owns_row_select ON public.comment_automations;
DROP POLICY IF EXISTS user_owns_row_insert ON public.comment_automations;
DROP POLICY IF EXISTS user_owns_row_update ON public.comment_automations;
DROP POLICY IF EXISTS user_owns_row_delete ON public.comment_automations;
CREATE POLICY user_owns_row_select ON public.comment_automations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.comment_automations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.comment_automations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.comment_automations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- crew_briefing_drafts
ALTER TABLE public.crew_briefing_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.crew_briefing_drafts;
DROP POLICY IF EXISTS user_owns_row_select ON public.crew_briefing_drafts;
DROP POLICY IF EXISTS user_owns_row_insert ON public.crew_briefing_drafts;
DROP POLICY IF EXISTS user_owns_row_update ON public.crew_briefing_drafts;
DROP POLICY IF EXISTS user_owns_row_delete ON public.crew_briefing_drafts;
CREATE POLICY user_owns_row_select ON public.crew_briefing_drafts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.crew_briefing_drafts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.crew_briefing_drafts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.crew_briefing_drafts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- dj_sets
ALTER TABLE public.dj_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.dj_sets;
DROP POLICY IF EXISTS user_owns_row_select ON public.dj_sets;
DROP POLICY IF EXISTS user_owns_row_insert ON public.dj_sets;
DROP POLICY IF EXISTS user_owns_row_update ON public.dj_sets;
DROP POLICY IF EXISTS user_owns_row_delete ON public.dj_sets;
CREATE POLICY user_owns_row_select ON public.dj_sets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.dj_sets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.dj_sets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.dj_sets FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.expenses;
DROP POLICY IF EXISTS user_owns_row_select ON public.expenses;
DROP POLICY IF EXISTS user_owns_row_insert ON public.expenses;
DROP POLICY IF EXISTS user_owns_row_update ON public.expenses;
DROP POLICY IF EXISTS user_owns_row_delete ON public.expenses;
CREATE POLICY user_owns_row_select ON public.expenses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.expenses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.expenses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- gig_contacts
ALTER TABLE public.gig_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.gig_contacts;
DROP POLICY IF EXISTS user_owns_row_select ON public.gig_contacts;
DROP POLICY IF EXISTS user_owns_row_insert ON public.gig_contacts;
DROP POLICY IF EXISTS user_owns_row_update ON public.gig_contacts;
DROP POLICY IF EXISTS user_owns_row_delete ON public.gig_contacts;
CREATE POLICY user_owns_row_select ON public.gig_contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.gig_contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.gig_contacts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.gig_contacts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- releases
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.releases;
DROP POLICY IF EXISTS user_owns_row_select ON public.releases;
DROP POLICY IF EXISTS user_owns_row_insert ON public.releases;
DROP POLICY IF EXISTS user_owns_row_update ON public.releases;
DROP POLICY IF EXISTS user_owns_row_delete ON public.releases;
CREATE POLICY user_owns_row_select ON public.releases FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.releases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.releases FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.releases FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- travel_bookings
ALTER TABLE public.travel_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.travel_bookings;
DROP POLICY IF EXISTS user_owns_row_select ON public.travel_bookings;
DROP POLICY IF EXISTS user_owns_row_insert ON public.travel_bookings;
DROP POLICY IF EXISTS user_owns_row_update ON public.travel_bookings;
DROP POLICY IF EXISTS user_owns_row_delete ON public.travel_bookings;
CREATE POLICY user_owns_row_select ON public.travel_bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.travel_bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.travel_bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.travel_bookings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- scheduled_posts (user_id already exists; just swap policies)
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthony_only_all ON public.scheduled_posts;
DROP POLICY IF EXISTS user_owns_row_select ON public.scheduled_posts;
DROP POLICY IF EXISTS user_owns_row_insert ON public.scheduled_posts;
DROP POLICY IF EXISTS user_owns_row_update ON public.scheduled_posts;
DROP POLICY IF EXISTS user_owns_row_delete ON public.scheduled_posts;
CREATE POLICY user_owns_row_select ON public.scheduled_posts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.scheduled_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.scheduled_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.scheduled_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMIT;
