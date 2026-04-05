use lofty::prelude::*;
use lofty::probe::Probe;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

/// Metadata read from audio file ID3/Vorbis/FLAC tags
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AudioTags {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: String,
    pub bpm: f64,
    pub key: String,           // Musical key from tags (e.g. "Fm", "Am", "Bb")
    pub camelot: String,       // Converted to Camelot notation
    pub duration_secs: f64,
    pub file_path: String,
    pub file_name: String,
}

/// Key-to-Camelot mapping (MIK writes standard musical keys to tags)
fn key_to_camelot(key: &str) -> String {
    let k = key.trim().to_lowercase();
    // MIK sometimes writes Camelot directly (e.g. "8A", "11B")
    if k.len() >= 2 && k.len() <= 3 {
        let last = k.chars().last().unwrap_or(' ');
        if (last == 'a' || last == 'b') && k[..k.len()-1].parse::<u32>().is_ok() {
            return k.to_uppercase();
        }
    }
    // Open Key notation (e.g. "1m", "6d") — sometimes used by MIK/Traktor
    if k.ends_with('m') || k.ends_with('d') {
        if let Ok(num) = k[..k.len()-1].parse::<u32>() {
            if num >= 1 && num <= 12 {
                // Open Key minor (m) = Camelot A, major (d) = Camelot B
                // But numbering differs: Open Key 1m = 6A, etc.
                let camelot_num = match num {
                    1 => 1, 2 => 2, 3 => 3, 4 => 4, 5 => 5, 6 => 6,
                    7 => 7, 8 => 8, 9 => 9, 10 => 10, 11 => 11, 12 => 12,
                    _ => return String::new(),
                };
                let letter = if k.ends_with('m') { "A" } else { "B" };
                return format!("{}{}", camelot_num, letter);
            }
        }
    }
    // Standard musical key notation
    match k.as_str() {
        "c major" | "cmaj" | "c" => "8B".to_string(),
        "c minor" | "cmin" | "cm" => "5A".to_string(),
        "c# major" | "c#maj" | "db major" | "dbmaj" | "c#" | "db" => "3B".to_string(),
        "c# minor" | "c#min" | "db minor" | "dbmin" | "c#m" | "dbm" => "12A".to_string(),
        "d major" | "dmaj" => "10B".to_string(),
        "d minor" | "dmin" | "dm" => "7A".to_string(),
        "d# major" | "d#maj" | "eb major" | "ebmaj" | "d#" | "eb" => "5B".to_string(),
        "d# minor" | "d#min" | "eb minor" | "ebmin" | "d#m" | "ebm" => "2A".to_string(),
        "e major" | "emaj" => "12B".to_string(),
        "e minor" | "emin" | "em" => "9A".to_string(),
        "f major" | "fmaj" => "7B".to_string(),
        "f minor" | "fmin" | "fm" => "4A".to_string(),
        "f# major" | "f#maj" | "gb major" | "gbmaj" | "f#" | "gb" => "2B".to_string(),
        "f# minor" | "f#min" | "gb minor" | "gbmin" | "f#m" | "gbm" => "11A".to_string(),
        "g major" | "gmaj" => "9B".to_string(),
        "g minor" | "gmin" | "gm" => "6A".to_string(),
        "g# major" | "g#maj" | "ab major" | "abmaj" | "g#" | "ab" => "4B".to_string(),
        "g# minor" | "g#min" | "ab minor" | "abmin" | "g#m" | "abm" => "1A".to_string(),
        "a major" | "amaj" => "11B".to_string(),
        "a minor" | "amin" | "am" => "8A".to_string(),
        "a# major" | "a#maj" | "bb major" | "bbmaj" | "a#" | "bb" => "6B".to_string(),
        "a# minor" | "a#min" | "bb minor" | "bbmin" | "a#m" | "bbm" => "3A".to_string(),
        "b major" | "bmaj" => "1B".to_string(),
        "b minor" | "bmin" | "bm" => "10A".to_string(),
        _ => String::new(),
    }
}

fn format_duration(secs: f64) -> String {
    let m = (secs / 60.0).floor() as u32;
    let s = (secs % 60.0).round() as u32;
    format!("{}:{:02}", m, s)
}

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "aiff", "aif", "m4a", "ogg", "wma", "alac"];

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Read tags from a single audio file
pub fn read_tags_from_file(path: &Path) -> Option<AudioTags> {
    let tagged_file = Probe::open(path).ok()?.read().ok()?;
    let properties = tagged_file.properties();
    let duration_secs = properties.duration().as_secs_f64();

    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    let mut tags = AudioTags {
        file_path: path.to_string_lossy().to_string(),
        file_name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
        duration_secs,
        ..Default::default()
    };

    if let Some(tag) = tag {
        tags.title = tag.title().unwrap_or_default().to_string();
        tags.artist = tag.artist().unwrap_or_default().to_string();
        tags.album = tag.album().unwrap_or_default().to_string();
        tags.genre = tag.genre().unwrap_or_default().to_string();

        // BPM — check TBPM (ID3) or BPM text frame
        if let Some(bpm_item) = tag.get_string(&ItemKey::Bpm) {
            if let Ok(bpm) = bpm_item.parse::<f64>() {
                tags.bpm = bpm;
            }
        }

        // Key — check TKEY (ID3) or InitialKey
        // MIK writes to TKEY / InitialKey
        if let Some(key_str) = tag.get_string(&ItemKey::InitialKey) {
            tags.key = key_str.to_string();
            tags.camelot = key_to_camelot(key_str);
        }
    }

    // If title is empty, use filename without extension
    if tags.title.is_empty() {
        tags.title = path.file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
    }

    Some(tags)
}

/// Read ID3/FLAC tags from a single file path
#[tauri::command]
pub fn read_audio_tags(path: String) -> Result<AudioTags, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    read_tags_from_file(p).ok_or_else(|| format!("Could not read tags from: {}", path))
}

/// Scan a folder recursively, read tags from all audio files
#[tauri::command]
pub fn scan_folder_tags(folder_path: String) -> Result<Vec<AudioTags>, String> {
    let root = Path::new(&folder_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Not a valid folder: {}", folder_path));
    }

    let mut results = Vec::new();
    for entry in WalkDir::new(root).follow_links(true).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() && is_audio_file(path) {
            if let Some(tags) = read_tags_from_file(path) {
                results.push(tags);
            }
        }
    }

    Ok(results)
}

/// Re-read tags for tracks that have file_path set — picks up MIK updates
/// Returns list of (file_path, key, camelot, bpm) for tracks that had tag changes
#[tauri::command]
pub fn rescan_tags_for_tracks(file_paths: Vec<String>) -> Result<Vec<AudioTags>, String> {
    let mut updated = Vec::new();
    for path_str in &file_paths {
        let mut clean = path_str.clone();
        if clean.starts_with("file://localhost") {
            clean = clean["file://localhost".len()..].to_string();
        } else if clean.starts_with("file://") {
            clean = clean["file://".len()..].to_string();
        }
        // URL decode
        if let Ok(decoded) = urlencoding::decode(&clean) {
            clean = decoded.to_string();
        }

        let p = Path::new(&clean);
        if p.exists() {
            if let Some(tags) = read_tags_from_file(p) {
                if !tags.key.is_empty() || tags.bpm > 0.0 {
                    updated.push(tags);
                }
            }
        }
    }
    Ok(updated)
}
