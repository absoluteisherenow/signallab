-- Set Lab Desktop — SQLite Schema
-- Mirrors Supabase dj_tracks / dj_sets with local-only extensions

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  bpm REAL DEFAULT 0,
  key TEXT DEFAULT '',
  camelot TEXT DEFAULT '',
  energy INTEGER DEFAULT 0,
  genre TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  analysed INTEGER DEFAULT 0,
  moment_type TEXT DEFAULT '',
  position_score TEXT DEFAULT '',
  mix_in TEXT DEFAULT '',
  mix_out TEXT DEFAULT '',
  crowd_reaction TEXT DEFAULT '',
  similar_to TEXT DEFAULT '',
  producer_style TEXT DEFAULT '',
  crowd_hits INTEGER DEFAULT 0,
  source TEXT DEFAULT 'manual',
  discovered_via TEXT DEFAULT '',
  spotify_url TEXT DEFAULT '',
  album_art TEXT DEFAULT '',
  rating INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  file_path TEXT DEFAULT '',
  waveform_data BLOB,
  supabase_id TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(title, artist)
);

CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  venue TEXT DEFAULT '',
  slot_type TEXT DEFAULT '',
  tracks TEXT NOT NULL DEFAULT '[]',
  narrative TEXT DEFAULT '',
  screenshot_url TEXT DEFAULT '',
  gig_id TEXT DEFAULT '',
  supabase_id TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  last_scanned TEXT,
  track_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS play_history (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  played_at TEXT NOT NULL,
  source TEXT DEFAULT 'rekordbox',
  session_id TEXT DEFAULT '',
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS discovery_cache (
  id TEXT PRIMARY KEY,
  query_hash TEXT NOT NULL,
  results TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT DEFAULT 'rekordbox',
  track_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  PRIMARY KEY (playlist_id, track_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_camelot ON tracks(camelot);
CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm);
CREATE INDEX IF NOT EXISTS idx_tracks_crowd_hits ON tracks(crowd_hits DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_source ON tracks(source);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_discovery_cache_hash ON discovery_cache(query_hash);
