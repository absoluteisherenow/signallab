-- Engagement tracking for scheduled_posts
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS engagement_score NUMERIC DEFAULT 0;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS platform_post_id TEXT;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS format_type TEXT;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
