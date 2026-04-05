use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

use super::db;

// ── Key to Camelot mapping ──────────────────────────────────────────────────

fn key_to_camelot() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        ("Am", "8A"), ("Em", "9A"), ("Bm", "10A"), ("F#m", "11A"), ("Dbm", "12A"),
        ("Abm", "1A"), ("Ebm", "2A"), ("Bbm", "3A"), ("Fm", "4A"), ("Cm", "5A"),
        ("Gm", "6A"), ("Dm", "7A"), ("C", "8B"), ("G", "9B"), ("D", "10B"),
        ("A", "11B"), ("E", "12B"), ("B", "1B"), ("F#", "2B"), ("Db", "3B"),
        ("Ab", "4B"), ("Eb", "5B"), ("Bb", "6B"), ("F", "7B"),
        // Alternate notations
        ("C#m", "12A"), ("G#m", "1A"), ("D#m", "2A"), ("A#m", "3A"),
        ("C#", "3B"), ("G#", "4B"), ("D#", "5B"), ("A#", "6B"),
    ])
}

fn format_duration(total_seconds: u64) -> String {
    let minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    format!("{}:{:02}", minutes, seconds)
}

// ── Rekordbox XML import ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct RekordboxImportResult {
    pub tracks_found: usize,
    pub tracks_imported: usize,
    pub playlists_found: usize,
    pub playlist_names: Vec<String>,
}

#[tauri::command]
pub fn import_rekordbox(path: String) -> Result<RekordboxImportResult, String> {
    let xml_content = fs::read_to_string(&path).map_err(|e| format!("Cannot read file: {}", e))?;
    let camelot_map = key_to_camelot();

    let mut reader = Reader::from_str(&xml_content);
    reader.config_mut().trim_text(true);

    let mut tracks: Vec<db::Track> = Vec::new();
    // Map Rekordbox TrackID → our internal track ID
    let mut rb_id_map: HashMap<String, String> = HashMap::new();
    // Playlist tracking: (name, Vec<rb_track_key>)
    let mut playlists: Vec<(String, Vec<String>)> = Vec::new();
    let mut current_playlist: Option<(String, Vec<String>)> = None;
    let mut buf = Vec::new();
    let mut track_count = 0;
    let mut in_playlists = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let qname = e.name();
                let name = std::str::from_utf8(qname.as_ref()).unwrap_or("");
                // Event already captured above

                if name == "TRACK" && !in_playlists {
                    // Collection track definition
                    let mut track_name = String::new();
                    let mut artist = String::new();
                    let mut bpm: f64 = 0.0;
                    let mut key_raw = String::new();
                    let mut total_time: u64 = 0;
                    let mut _rating: i32 = 0;
                    let mut _play_count: i32 = 0;
                    let mut genre = String::new();
                    let mut file_path = String::new();
                    let mut track_id = String::new();

                    for attr in e.attributes().flatten() {
                        let attr_key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                        let attr_val = attr.unescape_value().unwrap_or_default().to_string();
                        match attr_key {
                            "Name" => track_name = attr_val,
                            "Artist" => artist = attr_val,
                            "AverageBpm" | "BPM" => {
                                if bpm == 0.0 {
                                    bpm = attr_val.parse().unwrap_or(0.0);
                                }
                            }
                            "Tonality" => key_raw = attr_val,
                            "TotalTime" => total_time = attr_val.parse().unwrap_or(0),
                            "Rating" => _rating = attr_val.parse().unwrap_or(0),
                            "PlayCount" => _play_count = attr_val.parse().unwrap_or(0),
                            "Genre" => genre = attr_val,
                            "Location" => file_path = attr_val,
                            "TrackID" => track_id = attr_val,
                            _ => {}
                        }
                    }

                    if !track_name.is_empty() {
                        let camelot = camelot_map
                            .get(key_raw.as_str())
                            .unwrap_or(&"?")
                            .to_string();
                        let duration = format_duration(total_time);
                        let id = if track_id.is_empty() {
                            uuid::Uuid::new_v4().to_string()
                        } else {
                            format!("rb-{}", track_id)
                        };

                        // Decode Rekordbox file:// URL format
                        let decoded_path = if file_path.starts_with("file://localhost") {
                            urlish_decode(&file_path["file://localhost".len()..])
                        } else {
                            file_path.clone()
                        };

                        rb_id_map.insert(track_id.clone(), id.clone());

                        tracks.push(db::Track {
                            id,
                            title: track_name,
                            artist,
                            bpm,
                            key: key_raw,
                            camelot,
                            energy: 0,
                            genre,
                            duration,
                            notes: String::new(),
                            analysed: false,
                            moment_type: String::new(),
                            position_score: String::new(),
                            mix_in: String::new(),
                            mix_out: String::new(),
                            crowd_reaction: String::new(),
                            similar_to: String::new(),
                            producer_style: String::new(),
                            crowd_hits: 0,
                            source: "rekordbox".to_string(),
                            discovered_via: String::new(),
                            spotify_url: String::new(),
                            album_art: String::new(),
                            file_path: decoded_path,
                            supabase_id: String::new(),
                            updated_at: String::new(),
                            created_at: String::new(),
                        });
                        track_count += 1;
                    }
                } else if name == "TRACK" && in_playlists {
                    // Track reference inside a playlist — has Key attribute
                    if let Some(ref mut pl) = current_playlist {
                        for attr in e.attributes().flatten() {
                            let attr_key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                            if attr_key == "Key" {
                                let key_val = attr.unescape_value().unwrap_or_default().to_string();
                                pl.1.push(key_val);
                            }
                        }
                    }
                } else if name == "NODE" {
                    let mut node_name = String::new();
                    let mut node_type = String::new();
                    for attr in e.attributes().flatten() {
                        let attr_key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                        match attr_key {
                            "Name" => node_name = attr.unescape_value().unwrap_or_default().to_string(),
                            "Type" => node_type = attr.unescape_value().unwrap_or_default().to_string(),
                            _ => {}
                        }
                    }

                    if node_name == "ROOT" && node_type == "0" {
                        in_playlists = true;
                    } else if in_playlists && node_type == "1" && !node_name.is_empty() {
                        // Type 1 = playlist (not folder)
                        // Save previous playlist if exists
                        if let Some(pl) = current_playlist.take() {
                            if !pl.1.is_empty() {
                                playlists.push(pl);
                            }
                        }
                        current_playlist = Some((node_name, Vec::new()));
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let qname = e.name();
                let name = std::str::from_utf8(qname.as_ref()).unwrap_or("");
                if name == "NODE" {
                    // End of a playlist node — save it
                    if let Some(pl) = current_playlist.take() {
                        if !pl.1.is_empty() {
                            playlists.push(pl);
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    // Batch insert all tracks into SQLite
    let imported = db::upsert_tracks_batch(tracks.clone()).unwrap_or(0);

    // Save playlists and their track mappings
    let playlist_names: Vec<String> = playlists.iter().map(|p| p.0.clone()).collect();
    let playlists_found = playlists.len();

    for (pname, track_keys) in &playlists {
        let playlist_id = format!("rbpl-{}", uuid::Uuid::new_v4());
        // Resolve track keys to our internal IDs
        let resolved_ids: Vec<String> = track_keys.iter()
            .filter_map(|k| rb_id_map.get(k).cloned())
            .collect();
        if !resolved_ids.is_empty() {
            let _ = db::save_playlist(&playlist_id, pname, &resolved_ids);
        }
    }

    Ok(RekordboxImportResult {
        tracks_found: track_count,
        tracks_imported: imported,
        playlists_found,
        playlist_names,
    })
}

/// Simple percent-decode for Rekordbox file paths
fn urlish_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                result.push(hex as char);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i] as char);
        i += 1;
    }
    result
}
