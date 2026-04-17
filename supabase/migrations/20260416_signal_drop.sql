-- ============================================================================
-- 2026-04-16: Signal Drop — private streaming (tracks + play events)
-- ============================================================================
-- Extends the existing promo_blasts / promo_tracked_links / promo_reactions
-- system with R2-hosted audio tracks and per-session play analytics.
-- NO DOWNLOADS table / column — stream-only by product constraint.
-- ============================================================================

-- ─── promo_tracks — many tracks per drop (blast) ────────────────────────────
CREATE TABLE IF NOT EXISTS promo_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL REFERENCES promo_blasts(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  artist TEXT,
  label TEXT,
  duration_sec NUMERIC,
  file_key TEXT NOT NULL,
  file_size BIGINT,
  format TEXT,
  waveform_peaks JSONB,
  cover_art_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_tracks_blast ON promo_tracks(blast_id, position);

-- ─── promo_plays — one row per listen session ───────────────────────────────
CREATE TABLE IF NOT EXISTS promo_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES promo_tracks(id) ON DELETE CASCADE,
  link_id UUID REFERENCES promo_tracked_links(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  stopped_at TIMESTAMPTZ,
  duration_played_sec NUMERIC DEFAULT 0,
  furthest_sec NUMERIC DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  user_agent TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_promo_plays_track ON promo_plays(track_id);
CREATE INDEX IF NOT EXISTS idx_promo_plays_link ON promo_plays(link_id);

-- RLS: public pages need anon read on tracks + full insert/update on plays
ALTER TABLE promo_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY promo_tracks_anon_read ON promo_tracks FOR SELECT USING (true);
CREATE POLICY promo_tracks_anon_insert ON promo_tracks FOR INSERT WITH CHECK (true);
CREATE POLICY promo_plays_anon_all ON promo_plays FOR ALL USING (true) WITH CHECK (true);
