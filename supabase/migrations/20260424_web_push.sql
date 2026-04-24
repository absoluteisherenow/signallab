-- Web Push support on top of user_devices + a queue table the service worker
-- polls when a dataless push wakes it.
--
-- Why two pieces:
--   1. user_devices gets a `web_push_keys` jsonb column so we can eventually
--      encrypt payloads (aes128gcm) without another migration. Today we send
--      dataless pushes and read payload from (2) instead — but the column
--      needs to exist now so the register route can store the keys it
--      already receives.
--   2. pending_push_messages is the queue. /api/push/* inserts one row per
--      push, the SW fetches the oldest unread via /api/notifications/next
--      and deletes it after display. TTL cleanup is a cron problem for
--      later — rows are tiny and the queue drains on every push delivery.

alter table user_devices
  add column if not exists web_push_keys jsonb;

create table if not exists pending_push_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  href text default '/',
  icon text,
  badge text,
  tag text,
  created_at timestamptz default now()
);

create index if not exists pending_push_messages_user_created
  on pending_push_messages(user_id, created_at);

alter table pending_push_messages enable row level security;

-- Only the owning user can pull + delete their own pending messages. Server
-- inserts run with service role and bypass RLS.
create policy "pending_push_messages_own" on pending_push_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
