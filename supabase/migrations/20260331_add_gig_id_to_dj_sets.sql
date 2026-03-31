-- Link sets to specific gigs
ALTER TABLE dj_sets ADD COLUMN IF NOT EXISTS gig_id text;
