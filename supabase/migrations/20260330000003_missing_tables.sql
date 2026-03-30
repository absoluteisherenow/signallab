-- ── Missing tables required for launch ──────────────────────────────────

CREATE TABLE IF NOT EXISTS advance_requests (
  id uuid primary key default gen_random_uuid(),
  gig_id text not null,
  created_at timestamptz default now(),
  completed boolean default false,
  promoter_email text,
  notes text
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  type text not null default 'system',
  title text not null,
  message text,
  href text,
  read boolean default false,
  gig_id text,
  metadata jsonb
);

-- ── Row Level Security ────────────────────────────────────────────────────
-- Enable RLS on all core tables (policies added in Phase 4 for multi-user)

ALTER TABLE IF EXISTS gigs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS advance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dj_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS connected_social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS social_posts ENABLE ROW LEVEL SECURITY;

-- Temporary open policies for single-user beta (replace with auth.uid() in Phase 4)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['gigs','invoices','notifications','advance_requests','dj_tracks','scheduled_posts','connected_social_accounts','social_posts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', tbl);
    EXECUTE format('CREATE POLICY allow_all ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;
