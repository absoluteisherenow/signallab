-- Social media OAuth token storage
-- Mirrors the connected_email_accounts pattern

CREATE TABLE IF NOT EXISTS connected_social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,          -- 'instagram' | 'twitter' | 'tiktok' | 'threads'
  handle text not null,            -- @username shown in UI
  platform_user_id text,           -- platform's own user ID
  access_token text,
  refresh_token text,
  token_expiry bigint,
  scope text,                      -- granted scopes, comma-separated
  page_id text,                    -- Instagram: Facebook Page ID needed for Graph API
  page_access_token text,          -- Instagram: Page-level token
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(platform, handle)
);

-- Track every post sent via Signal Lab OS
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  handle text,
  caption text,
  media_urls text[],
  scheduled_at timestamptz,
  posted_at timestamptz,
  status text default 'posted',    -- 'posted' | 'scheduled' | 'failed' | 'draft'
  platform_post_id text,           -- tweet ID, instagram media ID, etc
  gig_id text,
  error_message text,
  created_at timestamptz default now()
);

-- Enable RLS
ALTER TABLE connected_social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
