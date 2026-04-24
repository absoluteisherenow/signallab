// ── Essentia sidecar (Rust side) ─────────────────────────────────────────────
// Spawns `essentia_streaming_extractor_music` per track, parses its JSON
// output into the shape the front-end expects (mirrors EssentiaSummary +
// HotCue in src/lib/audioDna/types.ts), and streams AnalysisProgressEvent
// back via Tauri's event bus so the UI can render a queue/progress list.
//
// Concurrency is capped at 2 in flight — Essentia is single-threaded per
// track but CPU-heavy, so more parallelism starves the UI thread.
//
// The binary path is resolved in this order:
//   1. $SETLAB_ESSENTIA_BIN env override (dev convenience)
//   2. Tauri resource dir (`resources/essentia/...`) — shipped with the app
//   3. `essentia_streaming_extractor_music` on $PATH (dev fallback)
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::Command;
use tokio::sync::Semaphore;

// ── Wire types (mirror src/lib/audioDna/types.ts) ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackToAnalyze {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub file_path: String,
    // Optional — if the caller already knows the duration we skip re-reading.
    pub duration_ms: Option<u64>,
}

// HotCue.cue_type is a string (intro|drop|breakdown|outro|custom) to match the
// TypeScript-side HotCueType literal union without a custom enum roundtrip.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotCue {
    pub position_ms: i64,
    pub label: String,
    #[serde(rename = "type")]
    pub cue_type: String, // one of: intro|drop|breakdown|outro|custom
    pub source: String, // "essentia" from this sidecar
    pub confidence: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EssentiaSummary {
    pub bpm: f32,
    pub bpm_confidence: f32,
    pub key: String,
    pub key_confidence: f32,
    pub camelot: String,
    pub loudness_lufs: f32,
    pub duration_ms: u64,
    pub segment_boundaries_ms: Vec<u64>,
    pub energy_contour: Vec<f32>,
    pub analyzed_at: String,
    pub essentia_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzedTrack {
    pub track_id: String,
    pub summary: EssentiaSummary,
    pub hot_cues: Vec<HotCue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisState {
    Queued,
    Running,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalysisProgressEvent {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub state: AnalysisState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cues_found: Option<usize>,
}

const PROGRESS_EVENT: &str = "essentia://progress";
const MAX_CONCURRENT: usize = 2;

// ── Binary resolution ───────────────────────────────────────────────────────

fn resolve_binary(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("SETLAB_ESSENTIA_BIN") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Ok(pb);
        }
    }

    let exe_name = if cfg!(target_os = "windows") {
        "essentia_streaming_extractor_music.exe"
    } else {
        "essentia_streaming_extractor_music"
    };

    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join("resources").join("essentia").join(exe_name);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    // Fall back to $PATH — only useful in dev.
    Ok(PathBuf::from(exe_name))
}

// ── Public command: analyze a batch of tracks ───────────────────────────────

#[tauri::command]
pub async fn analyze_tracks(
    app: AppHandle,
    tracks: Vec<TrackToAnalyze>,
) -> Result<Vec<AnalyzedTrack>, String> {
    let binary = resolve_binary(&app)?;
    let sem = Arc::new(Semaphore::new(MAX_CONCURRENT));

    // Emit queued events up-front so the UI can paint the whole list.
    for t in &tracks {
        let _ = app.emit(
            PROGRESS_EVENT,
            AnalysisProgressEvent {
                track_id: t.track_id.clone(),
                title: t.title.clone(),
                artist: t.artist.clone(),
                state: AnalysisState::Queued,
                error: None,
                cues_found: None,
            },
        );
    }

    let mut handles = Vec::new();
    for t in tracks {
        let sem = sem.clone();
        let app = app.clone();
        let binary = binary.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.expect("semaphore closed");
            run_one(&app, &binary, t).await
        }));
    }

    let mut results = Vec::new();
    for h in handles {
        match h.await {
            Ok(Ok(a)) => results.push(a),
            Ok(Err(e)) => eprintln!("[essentia] analysis failed: {}", e),
            Err(e) => eprintln!("[essentia] task join failed: {}", e),
        }
    }
    Ok(results)
}

async fn run_one(
    app: &AppHandle,
    binary: &PathBuf,
    t: TrackToAnalyze,
) -> Result<AnalyzedTrack, String> {
    let _ = app.emit(
        PROGRESS_EVENT,
        AnalysisProgressEvent {
            track_id: t.track_id.clone(),
            title: t.title.clone(),
            artist: t.artist.clone(),
            state: AnalysisState::Running,
            error: None,
            cues_found: None,
        },
    );

    // Essentia writes JSON to an output path arg. We use a unique temp file
    // per job so parallel runs don't clobber each other.
    let temp_dir = std::env::temp_dir();
    let out_path = temp_dir.join(format!("essentia-{}.json", t.track_id));

    let output = Command::new(binary)
        .arg(&t.file_path)
        .arg(&out_path)
        .output()
        .await
        .map_err(|e| {
            let msg = format!("spawn failed: {}", e);
            let _ = app.emit(
                PROGRESS_EVENT,
                AnalysisProgressEvent {
                    track_id: t.track_id.clone(),
                    title: t.title.clone(),
                    artist: t.artist.clone(),
                    state: AnalysisState::Error,
                    error: Some(msg.clone()),
                    cues_found: None,
                },
            );
            msg
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let msg = format!("essentia exited non-zero: {}", stderr.lines().next().unwrap_or(""));
        let _ = app.emit(
            PROGRESS_EVENT,
            AnalysisProgressEvent {
                track_id: t.track_id.clone(),
                title: t.title.clone(),
                artist: t.artist.clone(),
                state: AnalysisState::Error,
                error: Some(msg.clone()),
                cues_found: None,
            },
        );
        return Err(msg);
    }

    let raw = tokio::fs::read_to_string(&out_path)
        .await
        .map_err(|e| format!("read essentia output: {}", e))?;
    // Don't fail the job if cleanup fails — it's just a temp file.
    let _ = tokio::fs::remove_file(&out_path).await;

    let v: Value = serde_json::from_str(&raw).map_err(|e| format!("parse json: {}", e))?;

    let summary = map_summary(&v, t.duration_ms)?;
    let hot_cues = infer_hot_cues(&summary);
    let cues_found = hot_cues.len();

    let _ = app.emit(
        PROGRESS_EVENT,
        AnalysisProgressEvent {
            track_id: t.track_id.clone(),
            title: t.title.clone(),
            artist: t.artist.clone(),
            state: AnalysisState::Done,
            error: None,
            cues_found: Some(cues_found),
        },
    );

    Ok(AnalyzedTrack {
        track_id: t.track_id,
        summary,
        hot_cues,
    })
}

// ── JSON → EssentiaSummary ──────────────────────────────────────────────────

fn map_summary(v: &Value, hint_duration_ms: Option<u64>) -> Result<EssentiaSummary, String> {
    let rhythm = v.get("rhythm");
    let tonal = v.get("tonal");
    let low = v.get("lowlevel");
    let sfx = v.get("sfx");
    let metadata = v.get("metadata");

    let bpm = rhythm
        .and_then(|r| r.get("bpm"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0) as f32;
    let bpm_confidence = rhythm
        .and_then(|r| r.get("bpm_confidence"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0) as f32;

    let key_root = tonal
        .and_then(|t| t.get("key_key"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let key_scale = tonal
        .and_then(|t| t.get("key_scale"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let key = format_key(&key_root, &key_scale);
    let camelot = key_to_camelot(&key);
    let key_confidence = tonal
        .and_then(|t| t.get("key_strength"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0) as f32;

    let loudness_lufs = low
        .and_then(|l| l.get("loudness_ebu128"))
        .and_then(|e| e.get("integrated"))
        .and_then(Value::as_f64)
        .unwrap_or(-14.0) as f32;

    let duration_ms = hint_duration_ms.unwrap_or_else(|| {
        metadata
            .and_then(|m| m.get("audio_properties"))
            .and_then(|ap| ap.get("length"))
            .and_then(Value::as_f64)
            .map(|s| (s * 1000.0) as u64)
            .unwrap_or(0)
    });

    let segment_boundaries_ms = sfx
        .and_then(|s| s.get("structural_segmentation"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_f64)
                .map(|s| (s * 1000.0) as u64)
                .collect()
        })
        .unwrap_or_default();

    let energy_contour = low
        .and_then(|l| l.get("spectral_energy"))
        .and_then(|s| s.get("mean"))
        .and_then(Value::as_f64)
        .map(|m| vec![m as f32])
        .unwrap_or_default();

    let essentia_version = metadata
        .and_then(|m| m.get("version"))
        .and_then(|vv| vv.get("essentia"))
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();

    Ok(EssentiaSummary {
        bpm,
        bpm_confidence,
        key,
        key_confidence,
        camelot,
        loudness_lufs,
        duration_ms,
        segment_boundaries_ms,
        energy_contour,
        analyzed_at: chrono_now_iso(),
        essentia_version,
    })
}

fn format_key(root: &str, scale: &str) -> String {
    if root.is_empty() {
        return String::new();
    }
    if scale.eq_ignore_ascii_case("minor") {
        format!("{}m", root)
    } else {
        root.to_string()
    }
}

fn key_to_camelot(key: &str) -> String {
    // Kept deliberately small — mirrors import.rs mapping but returns owned.
    match key {
        "Am" => "8A", "Em" => "9A", "Bm" => "10A", "F#m" | "Gbm" => "11A",
        "C#m" | "Dbm" => "12A", "G#m" | "Abm" => "1A", "D#m" | "Ebm" => "2A",
        "A#m" | "Bbm" => "3A", "Fm" => "4A", "Cm" => "5A", "Gm" => "6A",
        "Dm" => "7A",
        "C" => "8B", "G" => "9B", "D" => "10B", "A" => "11B",
        "E" => "12B", "B" => "1B", "F#" | "Gb" => "2B", "C#" | "Db" => "3B",
        "G#" | "Ab" => "4B", "D#" | "Eb" => "5B", "A#" | "Bb" => "6B",
        "F" => "7B",
        _ => "",
    }
    .to_string()
}

fn chrono_now_iso() -> String {
    // Avoid a chrono dep — format UTC ISO-8601 by hand via SystemTime.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Rough conversion good enough for timestamps; the DB column will
    // re-normalise. If we need sub-second precision later, pull chrono in.
    let days = secs / 86_400;
    let h = (secs % 86_400) / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    let (y, mo, d) = days_to_ymd(days as i64);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

fn days_to_ymd(mut days_since_epoch: i64) -> (i32, u32, u32) {
    // 1970-01-01 baseline. Simple civil algorithm (Howard Hinnant).
    days_since_epoch += 719_468;
    let era = if days_since_epoch >= 0 {
        days_since_epoch
    } else {
        days_since_epoch - 146_096
    } / 146_097;
    let doe = (days_since_epoch - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

// ── Hot cue inference ───────────────────────────────────────────────────────
// Essentia's structural_segmentation gives us boundaries; we label them by
// relative position in the track + energy (if available). Mirrors the
// positional fallback in src/lib/audioDna/cueClassify.ts so the free-tier
// Rekordbox import and the Pro-tier Essentia inference use the same taxonomy.

fn infer_hot_cues(s: &EssentiaSummary) -> Vec<HotCue> {
    if s.duration_ms == 0 || s.segment_boundaries_ms.is_empty() {
        return Vec::new();
    }

    let total = s.duration_ms as f32;
    let mut cues = Vec::new();
    let mut used_types: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (i, &ms) in s.segment_boundaries_ms.iter().enumerate() {
        let ratio = ms as f32 / total;
        let (cue_type, label) = classify_by_position(ratio, i, s.segment_boundaries_ms.len());

        // Don't emit duplicate intro/outro — the first match wins for those.
        if (cue_type == "intro" || cue_type == "outro") && used_types.contains(cue_type) {
            continue;
        }
        used_types.insert(cue_type.to_string());

        cues.push(HotCue {
            position_ms: ms as i64,
            label: label.to_string(),
            cue_type: cue_type.to_string(),
            source: "essentia".to_string(),
            confidence: 0.7,
            color: None,
        });
    }

    cues
}

fn classify_by_position(ratio: f32, index: usize, total_segments: usize) -> (&'static str, &'static str) {
    // Conservative banding — same edges as cueClassify.ts.
    if ratio <= 0.08 {
        return ("intro", "Intro");
    }
    if ratio >= 0.92 {
        return ("outro", "Outro");
    }
    // First segment past the intro is usually the first drop.
    if index == 1 && ratio < 0.4 {
        return ("drop", "Drop");
    }
    // Middle segments below 70% tend to be breakdowns if they fall after a drop.
    if ratio > 0.35 && ratio < 0.7 {
        return ("breakdown", "Breakdown");
    }
    // Later segment before outro — often the second drop / peak.
    if total_segments >= 4 && ratio >= 0.6 && ratio < 0.92 {
        return ("drop", "Drop");
    }
    ("custom", "Segment")
}
