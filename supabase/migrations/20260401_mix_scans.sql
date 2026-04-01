-- Mix Scanner persistence table
CREATE TABLE IF NOT EXISTS mix_scans (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  filename         text         NOT NULL,
  duration_seconds integer      NOT NULL DEFAULT 0,
  bpm_estimate     integer,
  tracklist        text         NOT NULL DEFAULT '',
  detected_tracks  jsonb        NOT NULL DEFAULT '[]'::jsonb,
  context          text,
  result           jsonb,
  status           text         NOT NULL DEFAULT 'detected'
);

-- Index for listing scans newest-first
CREATE INDEX IF NOT EXISTS idx_mix_scans_created_at ON mix_scans (created_at DESC);
