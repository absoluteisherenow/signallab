-- Narrative threads. A "narrative thread" is a medium-horizon story the artist
-- is building across multiple posts/ads/releases — e.g. "the Vespers rig is
-- hand-built, no pre-recorded stems", or "this EP is about London-at-4am".
-- Each post doesn't have to restate the thread in full but MUST be consistent
-- with the ones currently active. Captions/ads that contradict an active
-- thread get soft-flagged (they might be intentional, but Anthony sees it).
--
-- Why this exists:
--   - priority context tells the brain WHERE to anchor (Vespers, 12 June)
--   - narrative threads tell the brain WHAT NOT TO CONTRADICT as content ships
--     over weeks. Vespers is a months-long arc — 30 captions will go out
--     before the gig. Without a shared memory, #17 can undo what #3 promised.
--
-- Design: small number of active threads per user (cap ~6). Each row ships
-- a body the model reads + a compact list of non-negotiable facts + optional
-- contradictions to watch. Thread consistency is advisory/soft_flag in v1 —
-- the brain surfaces concerns, Anthony decides.

CREATE TABLE IF NOT EXISTS narrative_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                             -- 'vespers_hybrid_rig'
  title TEXT NOT NULL,                            -- short human label
  body TEXT NOT NULL,                             -- the thread summary the brain reads
  non_negotiables TEXT[] DEFAULT '{}',            -- facts content must respect
  watch_outs TEXT[] DEFAULT '{}',                 -- common contradictions to catch
  applies_to TEXT[] NOT NULL DEFAULT '{}',        -- TaskTypes this thread applies to
  mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
  priority INT NOT NULL DEFAULT 50,               -- higher = louder in prompt
  status TEXT NOT NULL DEFAULT 'active',          -- active | archived
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS narrative_threads_user_active_idx
  ON narrative_threads (user_id, status, priority DESC)
  WHERE status = 'active';

ALTER TABLE narrative_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS narrative_threads_read ON narrative_threads;
CREATE POLICY narrative_threads_read ON narrative_threads
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS narrative_threads_write ON narrative_threads;
CREATE POLICY narrative_threads_write ON narrative_threads
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
