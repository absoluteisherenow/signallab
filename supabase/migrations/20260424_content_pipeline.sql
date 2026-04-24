-- Content pipeline. Single calendar-anchored table for every piece of NM
-- (or any artist's) content as it moves from Idea -> Scripted -> Filmed ->
-- Scheduled -> Posted. Replaces ad-hoc caption requests with a staged,
-- reviewable flow.
--
-- Why this exists:
--   - Matty-Cartwright-style content engines use Airtable as pipeline store.
--     We already have Supabase + gigs + releases + narrative_threads -- so
--     the pipeline lives here, keyed to real calendar moments.
--   - North Star: every row must anchor to either a gig or a release (or an
--     explicit brand moment). Context-less posts are rejected upstream by
--     the nm-content-pipeline skill; this table enforces the linkage.
--   - Track split: 'artist' (main account world-building, 80%) vs 'curator'
--     (song-push / third-party surfaces, 20%) vs 'night_vision' (umbrella
--     banner). Analytics later slice on this.
--
-- Design:
--   - Priority anchor is a (anchor_type, anchor_id) pair. Nullable only for
--     'brand_moment' rows (rare). App layer enforces at least one anchor
--     unless anchor_type = 'brand_moment'.
--   - Preview gate: status cannot jump to 'scheduled' without approved_at
--     being set (enforced in app code, surfaced here via CHECK).
--   - Caption/media live in their own columns so humanizer + voiceCheck
--     results can be stored alongside. No mirroring to memory.

CREATE TABLE IF NOT EXISTS content_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- lifecycle
  status TEXT NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea','angled','scripted','filmed','scheduled','posted','killed')),

  -- calendar anchor (the whole point of this table)
  anchor_type TEXT NOT NULL
    CHECK (anchor_type IN ('gig','release','brand_moment')),
  anchor_gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
  anchor_release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  anchor_note TEXT,                              -- free-text for brand_moment

  -- narrative tie-in
  narrative_thread_id UUID REFERENCES narrative_threads(id) ON DELETE SET NULL,

  -- content shape
  track TEXT NOT NULL DEFAULT 'artist'
    CHECK (track IN ('artist','curator','night_vision')),
  platform TEXT NOT NULL
    CHECK (platform IN ('instagram','tiktok','youtube','threads','x','other')),
  format TEXT NOT NULL
    CHECK (format IN ('single_post','carousel','reel','story')),

  -- draft payload
  angle TEXT,                                    -- short human label for the angle
  hook TEXT,                                     -- first line / first slide hook
  caption TEXT,                                  -- full caption body (rendered)
  first_comment TEXT,                            -- tags live here, not in caption
  hashtags TEXT[] DEFAULT '{}',
  user_tags JSONB DEFAULT '[]'::jsonb,           -- [{username, x, y}] for IG
  media_urls TEXT[] DEFAULT '{}',                -- ordered slides / frames

  -- voice / humanizer signals
  voice_check_score NUMERIC,                     -- voiceCheck.ts output
  humanizer_score NUMERIC,                       -- humanizer skill output
  voice_flags TEXT[] DEFAULT '{}',               -- em-dash, @tag, cliche, etc.

  -- preview + approval gate
  preview_url TEXT,                              -- rendered preview snapshot
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- schedule + post
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  external_post_id TEXT,                         -- IG media id etc.
  external_post_url TEXT,

  -- post-publish loop
  reach INT,
  saves INT,
  shares INT,
  engagement_pulled_at TIMESTAMPTZ,

  -- housekeeping
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- at least one anchor populated when anchor_type demands it
  CONSTRAINT content_pipeline_anchor_present CHECK (
    (anchor_type = 'gig' AND anchor_gig_id IS NOT NULL)
    OR (anchor_type = 'release' AND anchor_release_id IS NOT NULL)
    OR (anchor_type = 'brand_moment' AND anchor_note IS NOT NULL)
  ),

  -- scheduled rows must be approved
  CONSTRAINT content_pipeline_scheduled_requires_approval CHECK (
    status NOT IN ('scheduled','posted') OR approved_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS content_pipeline_user_status_idx
  ON content_pipeline (user_id, status, scheduled_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS content_pipeline_anchor_gig_idx
  ON content_pipeline (anchor_gig_id) WHERE anchor_gig_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS content_pipeline_anchor_release_idx
  ON content_pipeline (anchor_release_id) WHERE anchor_release_id IS NOT NULL;

ALTER TABLE content_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_pipeline_read ON content_pipeline
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY content_pipeline_write ON content_pipeline
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- updated_at bump
CREATE OR REPLACE FUNCTION content_pipeline_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_pipeline_updated_at ON content_pipeline;
CREATE TRIGGER content_pipeline_updated_at
  BEFORE UPDATE ON content_pipeline
  FOR EACH ROW EXECUTE FUNCTION content_pipeline_touch_updated_at();
