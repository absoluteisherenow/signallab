-- Multi-tenant RLS policies — replace hard-coded anthony-only policies with
-- proper auth.uid() = user_id scoping. This is the final prerequisite before
-- CHECKOUT_ENABLED can flip and a second user can sign up.
--
-- Applied live via Supabase Management API on 2026-04-20. This file locks the
-- state into version control so a DB rebuild produces the same policies.
--
-- Preconditions (verified at apply time):
--   - Every table below has a user_id column (uuid, or text where noted).
--   - Every existing row has user_id populated (zero NULLs).
--   - Only one auth.users row exists (absoluteishere@gmail.com) — so dropping
--     anthony_only_all drops no-one else's access.
--
-- Out of scope (tracked for Batch 2): 10 tables still lack user_id —
-- advance_requests, artist_profiles, comment_automations, dj_sets, expenses,
-- releases, scheduled_posts, travel_bookings, crew_briefing_drafts,
-- gig_contacts. Their policies stay anthony_only_all (or RLS disabled) until
-- user_id columns land and data is backfilled.

BEGIN;

-- =============================================================================
-- Helper: drop-and-recreate the four user_owns_row policies on one table.
-- =============================================================================

-- artist_settings (uuid user_id)
DROP POLICY IF EXISTS anthony_only_all ON public.artist_settings;
DROP POLICY IF EXISTS user_owns_row_select ON public.artist_settings;
DROP POLICY IF EXISTS user_owns_row_insert ON public.artist_settings;
DROP POLICY IF EXISTS user_owns_row_update ON public.artist_settings;
DROP POLICY IF EXISTS user_owns_row_delete ON public.artist_settings;
CREATE POLICY user_owns_row_select ON public.artist_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.artist_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.artist_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.artist_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- connected_email_accounts (uuid user_id)
DROP POLICY IF EXISTS anthony_only_all ON public.connected_email_accounts;
DROP POLICY IF EXISTS user_owns_row_select ON public.connected_email_accounts;
DROP POLICY IF EXISTS user_owns_row_insert ON public.connected_email_accounts;
DROP POLICY IF EXISTS user_owns_row_update ON public.connected_email_accounts;
DROP POLICY IF EXISTS user_owns_row_delete ON public.connected_email_accounts;
CREATE POLICY user_owns_row_select ON public.connected_email_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.connected_email_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.connected_email_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.connected_email_accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- gigs (uuid user_id)
DROP POLICY IF EXISTS anthony_only_all ON public.gigs;
DROP POLICY IF EXISTS user_owns_row_select ON public.gigs;
DROP POLICY IF EXISTS user_owns_row_insert ON public.gigs;
DROP POLICY IF EXISTS user_owns_row_update ON public.gigs;
DROP POLICY IF EXISTS user_owns_row_delete ON public.gigs;
CREATE POLICY user_owns_row_select ON public.gigs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.gigs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.gigs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.gigs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- invoices (uuid user_id)
DROP POLICY IF EXISTS anthony_only_all ON public.invoices;
DROP POLICY IF EXISTS user_owns_row_select ON public.invoices;
DROP POLICY IF EXISTS user_owns_row_insert ON public.invoices;
DROP POLICY IF EXISTS user_owns_row_update ON public.invoices;
DROP POLICY IF EXISTS user_owns_row_delete ON public.invoices;
CREATE POLICY user_owns_row_select ON public.invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- media_scans (TEXT user_id — cast auth.uid()::text)
DROP POLICY IF EXISTS anthony_only_all ON public.media_scans;
DROP POLICY IF EXISTS user_owns_row_select ON public.media_scans;
DROP POLICY IF EXISTS user_owns_row_insert ON public.media_scans;
DROP POLICY IF EXISTS user_owns_row_update ON public.media_scans;
DROP POLICY IF EXISTS user_owns_row_delete ON public.media_scans;
CREATE POLICY user_owns_row_select ON public.media_scans FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
CREATE POLICY user_owns_row_insert ON public.media_scans FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY user_owns_row_update ON public.media_scans FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY user_owns_row_delete ON public.media_scans FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

-- notifications (uuid user_id)
DROP POLICY IF EXISTS anthony_only_all ON public.notifications;
DROP POLICY IF EXISTS user_owns_row_select ON public.notifications;
DROP POLICY IF EXISTS user_owns_row_insert ON public.notifications;
DROP POLICY IF EXISTS user_owns_row_update ON public.notifications;
DROP POLICY IF EXISTS user_owns_row_delete ON public.notifications;
CREATE POLICY user_owns_row_select ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- invoice_reminder_drafts (uuid user_id)
DROP POLICY IF EXISTS anthony_only_all ON public.invoice_reminder_drafts;
DROP POLICY IF EXISTS user_owns_row_select ON public.invoice_reminder_drafts;
DROP POLICY IF EXISTS user_owns_row_insert ON public.invoice_reminder_drafts;
DROP POLICY IF EXISTS user_owns_row_update ON public.invoice_reminder_drafts;
DROP POLICY IF EXISTS user_owns_row_delete ON public.invoice_reminder_drafts;
CREATE POLICY user_owns_row_select ON public.invoice_reminder_drafts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.invoice_reminder_drafts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.invoice_reminder_drafts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.invoice_reminder_drafts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- meta_api_tokens (TEXT user_id — legacy stores IG business ID; cast auth.uid()::text)
DROP POLICY IF EXISTS anthony_only_all ON public.meta_api_tokens;
DROP POLICY IF EXISTS user_owns_row_select ON public.meta_api_tokens;
DROP POLICY IF EXISTS user_owns_row_insert ON public.meta_api_tokens;
DROP POLICY IF EXISTS user_owns_row_update ON public.meta_api_tokens;
DROP POLICY IF EXISTS user_owns_row_delete ON public.meta_api_tokens;
CREATE POLICY user_owns_row_select ON public.meta_api_tokens FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
CREATE POLICY user_owns_row_insert ON public.meta_api_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY user_owns_row_update ON public.meta_api_tokens FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY user_owns_row_delete ON public.meta_api_tokens FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

-- scan_usage (TEXT user_id — cast auth.uid()::text)
DROP POLICY IF EXISTS anthony_only_all ON public.scan_usage;
DROP POLICY IF EXISTS user_owns_row_select ON public.scan_usage;
DROP POLICY IF EXISTS user_owns_row_insert ON public.scan_usage;
DROP POLICY IF EXISTS user_owns_row_update ON public.scan_usage;
DROP POLICY IF EXISTS user_owns_row_delete ON public.scan_usage;
CREATE POLICY user_owns_row_select ON public.scan_usage FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
CREATE POLICY user_owns_row_insert ON public.scan_usage FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY user_owns_row_update ON public.scan_usage FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY user_owns_row_delete ON public.scan_usage FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

-- =============================================================================
-- Enable RLS + add policies on previously-unprotected tables
-- =============================================================================

ALTER TABLE public.artist_scan_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_owns_row_select ON public.artist_scan_runs;
DROP POLICY IF EXISTS user_owns_row_insert ON public.artist_scan_runs;
DROP POLICY IF EXISTS user_owns_row_update ON public.artist_scan_runs;
DROP POLICY IF EXISTS user_owns_row_delete ON public.artist_scan_runs;
CREATE POLICY user_owns_row_select ON public.artist_scan_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.artist_scan_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.artist_scan_runs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.artist_scan_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_owns_row_select ON public.campaigns;
DROP POLICY IF EXISTS user_owns_row_insert ON public.campaigns;
DROP POLICY IF EXISTS user_owns_row_update ON public.campaigns;
DROP POLICY IF EXISTS user_owns_row_delete ON public.campaigns;
CREATE POLICY user_owns_row_select ON public.campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.campaigns FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.campaigns FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.deep_dive_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_owns_row_select ON public.deep_dive_runs;
DROP POLICY IF EXISTS user_owns_row_insert ON public.deep_dive_runs;
DROP POLICY IF EXISTS user_owns_row_update ON public.deep_dive_runs;
DROP POLICY IF EXISTS user_owns_row_delete ON public.deep_dive_runs;
CREATE POLICY user_owns_row_select ON public.deep_dive_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.deep_dive_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.deep_dive_runs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.deep_dive_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.follower_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_owns_row_select ON public.follower_snapshots;
DROP POLICY IF EXISTS user_owns_row_insert ON public.follower_snapshots;
DROP POLICY IF EXISTS user_owns_row_update ON public.follower_snapshots;
DROP POLICY IF EXISTS user_owns_row_delete ON public.follower_snapshots;
CREATE POLICY user_owns_row_select ON public.follower_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.follower_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.follower_snapshots FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.follower_snapshots FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.growth_capture_moments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_owns_row_select ON public.growth_capture_moments;
DROP POLICY IF EXISTS user_owns_row_insert ON public.growth_capture_moments;
DROP POLICY IF EXISTS user_owns_row_update ON public.growth_capture_moments;
DROP POLICY IF EXISTS user_owns_row_delete ON public.growth_capture_moments;
CREATE POLICY user_owns_row_select ON public.growth_capture_moments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.growth_capture_moments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.growth_capture_moments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.growth_capture_moments FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.growth_monthly_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_owns_row_select ON public.growth_monthly_targets;
DROP POLICY IF EXISTS user_owns_row_insert ON public.growth_monthly_targets;
DROP POLICY IF EXISTS user_owns_row_update ON public.growth_monthly_targets;
DROP POLICY IF EXISTS user_owns_row_delete ON public.growth_monthly_targets;
CREATE POLICY user_owns_row_select ON public.growth_monthly_targets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.growth_monthly_targets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.growth_monthly_targets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.growth_monthly_targets FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =============================================================================
-- Tighten wide-open policies on ads tables (qual=true TO public was exposing
-- these to anon readers — service-role bypasses RLS so cron keeps working).
-- =============================================================================

DROP POLICY IF EXISTS "svc all queue" ON public.ad_creative_queue;
DROP POLICY IF EXISTS user_owns_row_select ON public.ad_creative_queue;
DROP POLICY IF EXISTS user_owns_row_insert ON public.ad_creative_queue;
DROP POLICY IF EXISTS user_owns_row_update ON public.ad_creative_queue;
DROP POLICY IF EXISTS user_owns_row_delete ON public.ad_creative_queue;
CREATE POLICY user_owns_row_select ON public.ad_creative_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.ad_creative_queue FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.ad_creative_queue FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.ad_creative_queue FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "svc read verdicts" ON public.ads_rule_verdicts;
DROP POLICY IF EXISTS user_owns_row_select ON public.ads_rule_verdicts;
DROP POLICY IF EXISTS user_owns_row_insert ON public.ads_rule_verdicts;
DROP POLICY IF EXISTS user_owns_row_update ON public.ads_rule_verdicts;
DROP POLICY IF EXISTS user_owns_row_delete ON public.ads_rule_verdicts;
CREATE POLICY user_owns_row_select ON public.ads_rule_verdicts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_owns_row_insert ON public.ads_rule_verdicts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_update ON public.ads_rule_verdicts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_owns_row_delete ON public.ads_rule_verdicts FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMIT;
