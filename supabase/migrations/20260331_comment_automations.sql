-- Auto-DM when a user comments with a trigger keyword
CREATE TABLE IF NOT EXISTS comment_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  release_id TEXT,
  platform_post_id TEXT NOT NULL,
  trigger_keyword TEXT NOT NULL DEFAULT '◼',
  dm_message TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  processed_comment_ids TEXT[] DEFAULT '{}',
  sent_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_comment_automations_post ON comment_automations(platform_post_id);
CREATE INDEX IF NOT EXISTS idx_comment_automations_release ON comment_automations(release_id);
