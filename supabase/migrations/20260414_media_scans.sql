-- Media scans — stores upload records + auto-scan results from content scoring pipeline
-- Used by: /api/media/scan (auto-scan after photographer upload), MediaScanner (in-app)

CREATE TABLE IF NOT EXISTS media_scans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gig_id uuid REFERENCES gigs(id) ON DELETE SET NULL,
  file_url text NOT NULL,
  file_name text,
  file_type text,
  source text DEFAULT 'upload',  -- 'upload' (photographer), 'scanner' (in-app MediaScanner), 'library'

  -- Content scoring (4-score system, same weights as MediaScanner)
  composite_score integer,
  reach_score integer,
  authenticity_score integer,
  culture_score integer,
  visual_identity_score integer,
  verdict text,  -- 'POST IT', 'TWEAK', 'RECONSIDER', 'DON''T POST', 'VIDEO_PENDING'

  -- Analysis details
  scan_result jsonb,  -- Full scan result (moments, platform_cuts, platform_ranking, etc.)
  caption text,
  caption_context text,
  post_recommendation text,
  category text,  -- promo, crowd, studio, artwork, bts, travel, other
  tags text[],

  -- Metadata
  uploaded_by text DEFAULT 'photographer',  -- 'photographer', 'artist', 'crew'
  scanned_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_scans_gig ON media_scans(gig_id);
CREATE INDEX IF NOT EXISTS idx_media_scans_verdict ON media_scans(verdict);
CREATE INDEX IF NOT EXISTS idx_media_scans_composite ON media_scans(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_media_scans_created ON media_scans(created_at DESC);
