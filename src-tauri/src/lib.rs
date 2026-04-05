mod commands;

use commands::db;
use commands::import;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("setlab.db");
            db::init_db(&db_path).expect("failed to init database");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // DB commands
            db::get_tracks,
            db::search_tracks,
            db::upsert_track,
            db::upsert_tracks_batch,
            db::delete_track,
            db::get_sets,
            db::save_set,
            db::delete_set,
            db::get_folders,
            db::add_folder,
            db::remove_folder,
            db::read_audio_file,
            db::get_playlists,
            db::get_playlist_tracks,
            // Import commands
            import::import_rekordbox,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Set Lab");
}
