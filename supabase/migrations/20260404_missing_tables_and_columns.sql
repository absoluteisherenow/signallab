-- ============================================================================
-- 2026-04-04: Create missing tables and add missing columns to comment_automations
-- ============================================================================

-- ─── instagram_posts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_post_id TEXT NOT NULL UNIQUE,
  handle TEXT,
  caption TEXT,
  media_type TEXT,
  posted_at TIMESTAMPTZ,
  permalink TEXT,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  reach INTEGER,
  impressions INTEGER,
  video_views INTEGER,
  engagement_rate NUMERIC(5,1),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instagram_posts_posted_at ON instagram_posts(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_handle ON instagram_posts(handle);

-- ─── dm_conversations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_user_id TEXT NOT NULL,
  automation_id UUID NOT NULL REFERENCES comment_automations(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending_email',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instagram_user_id, automation_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_lookup
  ON dm_conversations(instagram_user_id, automation_id, expires_at);

-- ─── dm_leads ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES comment_automations(id) ON DELETE CASCADE,
  campaign_name TEXT,
  instagram_user_id TEXT NOT NULL,
  username TEXT,
  follower_count INTEGER,
  biography TEXT,
  post_id TEXT,
  comment_text TEXT,
  email TEXT,
  dm_sent BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instagram_user_id, automation_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_leads_automation ON dm_leads(automation_id);
CREATE INDEX IF NOT EXISTS idx_dm_leads_email ON dm_leads(email) WHERE email IS NOT NULL;

-- ─── dj_contacts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dj_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  instagram_handle TEXT,
  instagram_user_id TEXT,
  email TEXT,
  whatsapp TEXT,
  genre TEXT,
  tier TEXT DEFAULT 'standard',
  notes TEXT,
  last_sent_at TIMESTAMPTZ,
  total_promos_sent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dj_contacts_tier ON dj_contacts(tier);
CREATE INDEX IF NOT EXISTS idx_dj_contacts_name ON dj_contacts(name);

-- ─── comment_automations — add missing columns ─────────────────────────────
ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS campaign_slug TEXT;
ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS follow_required BOOLEAN DEFAULT FALSE;
ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS reward_type TEXT DEFAULT 'download';
ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS reward_url TEXT;
ALTER TABLE comment_automations ADD COLUMN IF NOT EXISTS claim_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_automations_slug
  ON comment_automations(campaign_slug) WHERE campaign_slug IS NOT NULL;
