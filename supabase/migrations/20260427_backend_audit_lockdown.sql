-- Backend audit lockdown — 2026-04-27
--
-- Closes RLS gaps surfaced by the post-vendor-ops audit:
--   1. api_usage / audio_dna_usage / connected_email_accounts: have user_id,
--      so they get owner-scoped policies (the standard `auth.uid() = user_id`).
--   2. content_plan_cards / content_strategy_docs / mix_scans /
--      stock_paper_positions / cron_runs / campaign_metrics_snapshots /
--      processed_gmail_ids / processed_invoice_gmail_ids / instagram_posts:
--      no tenant column today (single-tenant NM data or system bookkeeping),
--      so RLS is enabled with NO permissive policies — service role only.
--      The app already uses the service client server-side for these, so
--      this just slams the door on accidental anon-key leaks.
--   3. connected_email_accounts had 4,735 seq scans on 2 rows because there
--      was no user_id index.
--   4. instagram_posts at 96.2% bloat, never autovacuumed.

-- 1a. api_usage — owner-scoped
alter table public.api_usage enable row level security;
drop policy if exists api_usage_owner_select on public.api_usage;
create policy api_usage_owner_select on public.api_usage
  for select using (auth.uid() = user_id);
drop policy if exists api_usage_owner_insert on public.api_usage;
create policy api_usage_owner_insert on public.api_usage
  for insert with check (auth.uid() = user_id);

-- 1b. audio_dna_usage — owner-scoped
alter table public.audio_dna_usage enable row level security;
drop policy if exists audio_dna_usage_owner_select on public.audio_dna_usage;
create policy audio_dna_usage_owner_select on public.audio_dna_usage
  for select using (auth.uid() = user_id);
drop policy if exists audio_dna_usage_owner_upsert on public.audio_dna_usage;
create policy audio_dna_usage_owner_upsert on public.audio_dna_usage
  for insert with check (auth.uid() = user_id);
drop policy if exists audio_dna_usage_owner_update on public.audio_dna_usage;
create policy audio_dna_usage_owner_update on public.audio_dna_usage
  for update using (auth.uid() = user_id);

-- 1c. connected_email_accounts — owner-scoped + missing index
alter table public.connected_email_accounts enable row level security;
drop policy if exists connected_email_accounts_owner_select on public.connected_email_accounts;
create policy connected_email_accounts_owner_select on public.connected_email_accounts
  for select using (auth.uid() = user_id);
drop policy if exists connected_email_accounts_owner_modify on public.connected_email_accounts;
create policy connected_email_accounts_owner_modify on public.connected_email_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists connected_email_accounts_user_idx
  on public.connected_email_accounts (user_id);

-- 2. Service-role-only lockdown (RLS on, zero permissive policies)
alter table public.content_plan_cards          enable row level security;
alter table public.content_strategy_docs       enable row level security;
alter table public.mix_scans                   enable row level security;
alter table public.stock_paper_positions       enable row level security;
alter table public.cron_runs                   enable row level security;
alter table public.campaign_metrics_snapshots  enable row level security;
alter table public.processed_gmail_ids         enable row level security;
alter table public.processed_invoice_gmail_ids enable row level security;
alter table public.instagram_posts             enable row level security;

-- 3. instagram_posts vacuum (96.2% bloat).
-- Cannot run VACUUM inside a migration transaction; do via separate one-shot.
