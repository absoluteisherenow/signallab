-- Native device registry — one row per (user, device token). Populated when
-- the Capacitor app (iOS first, Android later) requests push permission and
-- receives an APNs/FCM token. Sender uses this table to look up targets when
-- firing a notification.
--
-- On iOS, the APNs token can change (new device, app reinstall, iOS version
-- bump). We UPSERT on (user_id, token) so re-registration just bumps
-- last_seen_at. Stale tokens get retired by APNs feedback responses (410
-- Gone → delete row).

create table if not exists user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,                          -- 'ios' | 'android' | 'web'
  token text not null,                             -- APNs device token (hex) or FCM registration ID
  bundle_id text,                                  -- iOS bundle (com.signallab.os) — helps multi-app fan-out later
  environment text not null default 'production',  -- 'production' | 'sandbox' (TestFlight + debug builds use sandbox)
  app_version text,                                -- semver of the native shell — useful for deprecation
  device_name text,                                -- optional, e.g. "Anthony's iPhone"
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

create unique index if not exists user_devices_unique_token on user_devices(user_id, token);
create index if not exists user_devices_user_id on user_devices(user_id);

alter table user_devices enable row level security;

-- Callers can read/upsert/delete only their own device rows. APNs dispatch
-- runs server-side with the service role, which bypasses RLS by design.
create policy "user_devices_own" on user_devices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
