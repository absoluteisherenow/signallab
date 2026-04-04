-- ============================================================================
-- 2026-04-04: Promo blast tracking, reactions, and link analytics
-- ============================================================================

-- ─── promo_blasts — history of every blast sent ─────────────────────────────
CREATE TABLE IF NOT EXISTS promo_blasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_url TEXT,
  track_title TEXT,
  track_artist TEXT,
  message TEXT NOT NULL,
  contact_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  sc_plays_before INTEGER,
  sc_plays_after INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_blasts_created ON promo_blasts(created_at DESC);

-- ─── promo_tracked_links — unique link per contact per blast ────────────────
CREATE TABLE IF NOT EXISTS promo_tracked_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL REFERENCES promo_blasts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES dj_contacts(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON promo_tracked_links(code);
CREATE INDEX IF NOT EXISTS idx_tracked_links_blast ON promo_tracked_links(blast_id);

-- ─── promo_reactions — DJ feedback per contact per blast ────────────────────
CREATE TABLE IF NOT EXISTS promo_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL REFERENCES promo_blasts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES dj_contacts(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'none',
  notes TEXT,
  screenshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blast_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_reactions_blast ON promo_reactions(blast_id);
