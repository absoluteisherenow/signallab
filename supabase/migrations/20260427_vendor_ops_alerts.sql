-- Vendor ops alerts: audit trail of action-required mail surfaced from
-- /api/crons/vendor-ops. Dedup happens primarily via the Gmail label
-- `vendor-ops-processed` (cheaper than DB lookup), but the unique
-- constraint on (user_id, gmail_thread_id) is a belt-and-braces safety
-- net so a botched label apply can't double-alert.

create table if not exists public.vendor_ops_alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  vendor          text not null,
  severity        text not null check (severity in ('P0','P1','P2')),
  subject         text,
  summary         text,
  sender          text,
  gmail_thread_id text not null,
  gmail_message_id text,
  link            text,
  classified_at   timestamptz not null default now(),
  resolved_at     timestamptz
);

create unique index if not exists vendor_ops_alerts_thread_uniq
  on public.vendor_ops_alerts (user_id, gmail_thread_id);

create index if not exists vendor_ops_alerts_recent
  on public.vendor_ops_alerts (user_id, classified_at desc);

create index if not exists vendor_ops_alerts_unresolved
  on public.vendor_ops_alerts (user_id, severity, classified_at desc)
  where resolved_at is null;

alter table public.vendor_ops_alerts enable row level security;

drop policy if exists vendor_ops_alerts_owner_select on public.vendor_ops_alerts;
create policy vendor_ops_alerts_owner_select on public.vendor_ops_alerts
  for select using (auth.uid() = user_id);

drop policy if exists vendor_ops_alerts_owner_update on public.vendor_ops_alerts;
create policy vendor_ops_alerts_owner_update on public.vendor_ops_alerts
  for update using (auth.uid() = user_id);
