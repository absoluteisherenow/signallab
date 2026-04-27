-- Bell polling was sequential-scanning notifications 82k+ times because the
-- existing user_id index didn't cover the order-by. Composite covers both
-- the full feed query and the unread-only filter (with a partial index for
-- the unread badge). Both queries now use index-only access.
--
-- Cause: pg_stat_user_tables showed 82,366 seq_scans / 15.5M cumulative
-- rows read on a 245-row table. Likely top contributor to the disk-IO
-- budget warning from Supabase on 2026-04-27.

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read = false;
