create table if not exists crate_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  image_url text not null,
  source text,                    -- 'vinyl' | 'cdj' | 'tracklist' | 'screenshot' | 'other'
  tracks jsonb default '[]'::jsonb,
  raw_response jsonb,
  created_at timestamptz default now()
);
create index if not exists crate_captures_user_id_created on crate_captures(user_id, created_at desc);
alter table crate_captures enable row level security;
create policy "crate_captures_own" on crate_captures for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
