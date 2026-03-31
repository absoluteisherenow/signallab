-- Gig debrief fields
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS debrief_rating INTEGER;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS debrief_notes TEXT;

-- Track crowd response counter (boosted in set suggestions)
ALTER TABLE dj_tracks ADD COLUMN IF NOT EXISTS crowd_hits INTEGER DEFAULT 0;
