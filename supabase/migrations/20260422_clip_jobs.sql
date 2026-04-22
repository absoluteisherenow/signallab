-- Analysis cache: per-clip audio/shot/speech markers produced by Mac Mini
-- worker. One row per clip. Stored as jsonb so the marker shape can evolve
-- without migrations.
create table if not exists clip_analysis (
  clip_id uuid primary key references clip_sources(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  duration_seconds numeric,
  rms_peaks jsonb default '[]'::jsonb,         -- [{t: seconds, db: float}]
  shot_changes jsonb default '[]'::jsonb,      -- [seconds]
  speech_segments jsonb default '[]'::jsonb,   -- [{t_start, t_end, text}]
  suggested_cuts jsonb default '[]'::jsonb,    -- [{in, out, reason}]
  raw jsonb,
  analysed_at timestamptz default now()
);
create index if not exists clip_analysis_user on clip_analysis(user_id);

-- Job queue: Mac Mini polls 'queued' rows, marks 'running' then 'done'/'failed'.
-- kind='analyse' → runs RMS + shot detect + Whisper, writes clip_analysis row.
-- kind='render'  → runs FFmpeg trim + drawtext, uploads MP4, updates output_url.
create table if not exists render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  clip_id uuid references clip_sources(id) on delete cascade,
  kind text not null,                           -- 'analyse' | 'render'
  status text not null default 'queued',        -- 'queued' | 'running' | 'done' | 'failed'
  spec jsonb,                                   -- render spec for kind='render'
  output_url text,
  error text,
  attempts int default 0,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists render_jobs_queue on render_jobs(status, created_at) where status in ('queued','running');
create index if not exists render_jobs_user on render_jobs(user_id, created_at desc);

alter table clip_analysis enable row level security;
alter table render_jobs enable row level security;

create policy "clip_analysis_own" on clip_analysis for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "render_jobs_own" on render_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
