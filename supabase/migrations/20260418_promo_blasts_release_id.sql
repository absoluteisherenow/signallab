-- Phase 2 of the /promo hub migration (docs/plans/promo-hub-migration.md):
-- link promo_blasts to releases so the Campaigns tab can aggregate blast
-- history per release. Nullable — one-off promos without a release row are
-- still valid (e.g. private SoundCloud links that never get catalogued).
-- ON DELETE SET NULL preserves blast history when a release is deleted.

ALTER TABLE promo_blasts
  ADD COLUMN IF NOT EXISTS release_id uuid REFERENCES releases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_promo_blasts_release_id
  ON promo_blasts(release_id)
  WHERE release_id IS NOT NULL;

-- Backfill: wherever a blast's track_url exactly matches a release's
-- streaming_url, link them. Safe to re-run.
UPDATE promo_blasts pb
SET release_id = r.id
FROM releases r
WHERE pb.release_id IS NULL
  AND pb.track_url IS NOT NULL
  AND pb.track_url = r.streaming_url;
