use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

static DB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

const SCHEMA: &str = include_str!("../db/schema.sql");

pub fn init_db(path: &PathBuf) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    *DB_PATH.lock().unwrap() = Some(path.clone());
    Ok(())
}

fn get_conn() -> Result<Connection, String> {
    let path = DB_PATH
        .lock()
        .unwrap()
        .clone()
        .ok_or("DB not initialized")?;
    Connection::open(path).map_err(|e| e.to_string())
}

// ── Track type ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub bpm: f64,
    pub key: String,
    pub camelot: String,
    pub energy: i32,
    pub genre: String,
    pub duration: String,
    pub notes: String,
    pub analysed: bool,
    pub moment_type: String,
    pub position_score: String,
    pub mix_in: String,
    pub mix_out: String,
    pub crowd_reaction: String,
    pub similar_to: String,
    pub producer_style: String,
    pub crowd_hits: i32,
    pub source: String,
    pub discovered_via: String,
    pub spotify_url: String,
    pub album_art: String,
    pub file_path: String,
    pub supabase_id: String,
    pub updated_at: String,
    pub created_at: String,
}

fn row_to_track(row: &rusqlite::Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get(0)?,
        title: row.get(1)?,
        artist: row.get(2)?,
        bpm: row.get(3)?,
        key: row.get(4)?,
        camelot: row.get(5)?,
        energy: row.get(6)?,
        genre: row.get(7)?,
        duration: row.get(8)?,
        notes: row.get(9)?,
        analysed: row.get::<_, i32>(10)? != 0,
        moment_type: row.get(11)?,
        position_score: row.get(12)?,
        mix_in: row.get(13)?,
        mix_out: row.get(14)?,
        crowd_reaction: row.get(15)?,
        similar_to: row.get(16)?,
        producer_style: row.get(17)?,
        crowd_hits: row.get(18)?,
        source: row.get(19)?,
        discovered_via: row.get(20)?,
        spotify_url: row.get(21)?,
        album_art: row.get(22)?,
        file_path: row.get(23)?,
        supabase_id: row.get(24)?,
        updated_at: row.get(25)?,
        created_at: row.get(26)?,
    })
}

const TRACK_COLUMNS: &str = "id, title, artist, bpm, key, camelot, energy, genre, duration, notes, analysed, moment_type, position_score, mix_in, mix_out, crowd_reaction, similar_to, producer_style, crowd_hits, source, discovered_via, spotify_url, album_art, file_path, supabase_id, updated_at, created_at";

// ── Track commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_tracks() -> Result<Vec<Track>, String> {
    let conn = get_conn()?;
    let mut stmt = conn
        .prepare(&format!("SELECT {} FROM tracks ORDER BY created_at DESC", TRACK_COLUMNS))
        .map_err(|e| e.to_string())?;
    let tracks = stmt
        .query_map([], |row| row_to_track(row))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(tracks)
}

#[tauri::command]
pub fn search_tracks(query: String) -> Result<Vec<Track>, String> {
    let conn = get_conn()?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM tracks WHERE title LIKE ?1 OR artist LIKE ?1 ORDER BY created_at DESC",
            TRACK_COLUMNS
        ))
        .map_err(|e| e.to_string())?;
    let tracks = stmt
        .query_map(params![pattern], |row| row_to_track(row))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(tracks)
}

#[tauri::command]
pub fn upsert_track(track: Track) -> Result<(), String> {
    let conn = get_conn()?;
    conn.execute(
        "INSERT INTO tracks (id, title, artist, bpm, key, camelot, energy, genre, duration, notes, analysed, moment_type, position_score, mix_in, mix_out, crowd_reaction, similar_to, producer_style, crowd_hits, source, discovered_via, spotify_url, album_art, file_path, supabase_id, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, datetime('now'))
         ON CONFLICT(title, artist) DO UPDATE SET
           bpm=excluded.bpm, key=excluded.key, camelot=excluded.camelot, energy=excluded.energy,
           genre=excluded.genre, duration=excluded.duration, notes=excluded.notes,
           analysed=excluded.analysed, moment_type=excluded.moment_type, position_score=excluded.position_score,
           mix_in=excluded.mix_in, mix_out=excluded.mix_out, crowd_reaction=excluded.crowd_reaction,
           similar_to=excluded.similar_to, producer_style=excluded.producer_style,
           crowd_hits=excluded.crowd_hits, source=excluded.source, discovered_via=excluded.discovered_via,
           spotify_url=excluded.spotify_url, album_art=excluded.album_art, file_path=excluded.file_path,
           supabase_id=excluded.supabase_id, updated_at=datetime('now')",
        params![
            track.id, track.title, track.artist, track.bpm, track.key, track.camelot,
            track.energy, track.genre, track.duration, track.notes, track.analysed as i32,
            track.moment_type, track.position_score, track.mix_in, track.mix_out,
            track.crowd_reaction, track.similar_to, track.producer_style, track.crowd_hits,
            track.source, track.discovered_via, track.spotify_url, track.album_art,
            track.file_path, track.supabase_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn upsert_tracks_batch(tracks: Vec<Track>) -> Result<usize, String> {
    let conn = get_conn()?;
    let mut count = 0;
    for track in &tracks {
        conn.execute(
            "INSERT INTO tracks (id, title, artist, bpm, key, camelot, energy, genre, duration, notes, analysed, moment_type, position_score, mix_in, mix_out, crowd_reaction, similar_to, producer_style, crowd_hits, source, discovered_via, spotify_url, album_art, file_path, supabase_id, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, datetime('now'))
             ON CONFLICT(title, artist) DO UPDATE SET
               bpm=excluded.bpm, key=excluded.key, camelot=excluded.camelot, energy=excluded.energy,
               genre=excluded.genre, duration=excluded.duration, source=excluded.source,
               album_art=excluded.album_art, spotify_url=excluded.spotify_url,
               updated_at=datetime('now')",
            params![
                track.id, track.title, track.artist, track.bpm, track.key, track.camelot,
                track.energy, track.genre, track.duration, track.notes, track.analysed as i32,
                track.moment_type, track.position_score, track.mix_in, track.mix_out,
                track.crowd_reaction, track.similar_to, track.producer_style, track.crowd_hits,
                track.source, track.discovered_via, track.spotify_url, track.album_art,
                track.file_path, track.supabase_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

#[tauri::command]
pub fn delete_track(id: String) -> Result<(), String> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Set types + commands ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DjSet {
    pub id: String,
    pub name: String,
    pub venue: String,
    pub slot_type: String,
    pub tracks: String,
    pub narrative: String,
    pub screenshot_url: String,
    pub gig_id: String,
    pub supabase_id: String,
    pub updated_at: String,
    pub created_at: String,
}

#[tauri::command]
pub fn get_sets() -> Result<Vec<DjSet>, String> {
    let conn = get_conn()?;
    let mut stmt = conn
        .prepare("SELECT id, name, venue, slot_type, tracks, narrative, screenshot_url, gig_id, supabase_id, updated_at, created_at FROM sets ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let sets = stmt
        .query_map([], |row| {
            Ok(DjSet {
                id: row.get(0)?,
                name: row.get(1)?,
                venue: row.get(2)?,
                slot_type: row.get(3)?,
                tracks: row.get(4)?,
                narrative: row.get(5)?,
                screenshot_url: row.get(6)?,
                gig_id: row.get(7)?,
                supabase_id: row.get(8)?,
                updated_at: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(sets)
}

#[tauri::command]
pub fn save_set(set: DjSet) -> Result<(), String> {
    let conn = get_conn()?;
    conn.execute(
        "INSERT INTO sets (id, name, venue, slot_type, tracks, narrative, screenshot_url, gig_id, supabase_id, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, venue=excluded.venue, slot_type=excluded.slot_type,
           tracks=excluded.tracks, narrative=excluded.narrative, screenshot_url=excluded.screenshot_url,
           gig_id=excluded.gig_id, supabase_id=excluded.supabase_id, updated_at=datetime('now')",
        params![
            set.id, set.name, set.venue, set.slot_type, set.tracks,
            set.narrative, set.screenshot_url, set.gig_id, set.supabase_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_set(id: String) -> Result<(), String> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM sets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Folder commands ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Folder {
    pub id: String,
    pub path: String,
    pub name: String,
    pub last_scanned: Option<String>,
    pub track_count: i32,
}

#[tauri::command]
pub fn get_folders() -> Result<Vec<Folder>, String> {
    let conn = get_conn()?;
    let mut stmt = conn
        .prepare("SELECT id, path, name, last_scanned, track_count FROM folders ORDER BY name")
        .map_err(|e| e.to_string())?;
    let folders = stmt
        .query_map([], |row| {
            Ok(Folder {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                last_scanned: row.get(3)?,
                track_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(folders)
}

#[tauri::command]
pub fn add_folder(path: String) -> Result<Folder, String> {
    let conn = get_conn()?;
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO folders (id, path, name) VALUES (?1, ?2, ?3) ON CONFLICT(path) DO NOTHING",
        params![id, path, name],
    )
    .map_err(|e| e.to_string())?;
    Ok(Folder {
        id,
        path,
        name,
        last_scanned: None,
        track_count: 0,
    })
}

#[tauri::command]
pub fn remove_folder(id: String) -> Result<(), String> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Playlist commands ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub source: String,
    pub track_count: i32,
}

pub fn save_playlist(id: &str, name: &str, track_ids: &[String]) -> Result<(), String> {
    let conn = get_conn()?;
    conn.execute(
        "INSERT INTO playlists (id, name, source, track_count) VALUES (?1, ?2, 'rekordbox', ?3)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, track_count=excluded.track_count",
        params![id, name, track_ids.len() as i32],
    ).map_err(|e| e.to_string())?;

    for (i, track_id) in track_ids.iter().enumerate() {
        conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)
             ON CONFLICT(playlist_id, track_id) DO UPDATE SET position=excluded.position",
            params![id, track_id, i as i32],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_playlists() -> Result<Vec<Playlist>, String> {
    let conn = get_conn()?;
    let mut stmt = conn
        .prepare("SELECT id, name, source, track_count FROM playlists ORDER BY name")
        .map_err(|e| e.to_string())?;
    let playlists = stmt
        .query_map([], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                source: row.get(2)?,
                track_count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(playlists)
}

#[tauri::command]
pub fn get_playlist_tracks(playlist_id: String) -> Result<Vec<Track>, String> {
    let conn = get_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.title, t.artist, t.bpm, t.key, t.camelot, t.energy, t.genre,
                    t.duration, t.notes, t.analysed, t.moment_type, t.position_score,
                    t.mix_in, t.mix_out, t.crowd_reaction, t.similar_to, t.producer_style,
                    t.crowd_hits, t.source, t.discovered_via, t.spotify_url, t.album_art,
                    t.file_path, t.supabase_id, t.updated_at, t.created_at
             FROM tracks t
             JOIN playlist_tracks pt ON pt.track_id = t.id
             WHERE pt.playlist_id = ?1
             ORDER BY pt.position"
        )
        .map_err(|e| e.to_string())?;
    let tracks = stmt
        .query_map(params![playlist_id], |row| {
            Ok(Track {
                id: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                bpm: row.get(3)?,
                key: row.get(4)?,
                camelot: row.get(5)?,
                energy: row.get(6)?,
                genre: row.get(7)?,
                duration: row.get(8)?,
                notes: row.get(9)?,
                analysed: row.get(10)?,
                moment_type: row.get(11)?,
                position_score: row.get(12)?,
                mix_in: row.get(13)?,
                mix_out: row.get(14)?,
                crowd_reaction: row.get(15)?,
                similar_to: row.get(16)?,
                producer_style: row.get(17)?,
                crowd_hits: row.get(18)?,
                source: row.get(19)?,
                discovered_via: row.get(20)?,
                spotify_url: row.get(21)?,
                album_art: row.get(22)?,
                file_path: row.get(23)?,
                supabase_id: row.get(24)?,
                updated_at: row.get(25)?,
                created_at: row.get(26)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(tracks)
}
