-- Link scheduled posts back to releases for campaign tracking
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS release_id TEXT;
