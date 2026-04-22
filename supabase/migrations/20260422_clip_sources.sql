create table if not exists clip_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source_type text not null,                  -- 'dropbox' | 'supabase' | 'url' | 'youtube'
  source_url text not null,
  title text,
  duration_seconds int,
  thumbnail_url text,
  status text not null default 'pending',     -- 'pending' | 'shortlisted' | 'rejected' | 'used'
  scan_id uuid,                               -- nullable fk → media_scans.id (no hard fk to keep schema loose)
  caption_draft text,
  notes text,
  gig_id uuid,                                -- nullable fk → gigs.id
  imported_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists clip_sources_user_status on clip_sources(user_id, status, imported_at desc);
create unique index if not exists clip_sources_user_url on clip_sources(user_id, source_url);

alter table clip_sources enable row level security;
create policy "clip_sources_own" on clip_sources for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
