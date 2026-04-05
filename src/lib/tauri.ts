// Tauri invoke wrappers — typed commands for the Rust backend
// Falls back gracefully when running in browser (web mode)

let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null

async function getInvoke() {
  if (invoke) return invoke
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    invoke = tauriInvoke
    return invoke
  }
  return null
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).__TAURI_INTERNALS__ || new URLSearchParams(window.location.search).has('desktop')
}

export async function readAudioFile(path: string): Promise<Uint8Array> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  const bytes = await inv('read_audio_file', { path }) as number[]
  return new Uint8Array(bytes)
}

// ── Track type (mirrors Rust Track struct) ──────────────────────────────────

export interface TauriTrack {
  id: string
  title: string
  artist: string
  bpm: number
  key: string
  camelot: string
  energy: number
  genre: string
  duration: string
  notes: string
  analysed: boolean
  moment_type: string
  position_score: string
  mix_in: string
  mix_out: string
  crowd_reaction: string
  similar_to: string
  producer_style: string
  crowd_hits: number
  source: string
  discovered_via: string
  spotify_url: string
  album_art: string
  file_path: string
  supabase_id: string
  updated_at: string
  created_at: string
}

export interface TauriSet {
  id: string
  name: string
  venue: string
  slot_type: string
  tracks: string
  narrative: string
  screenshot_url: string
  gig_id: string
  supabase_id: string
  updated_at: string
  created_at: string
}

export interface TauriFolder {
  id: string
  path: string
  name: string
  last_scanned: string | null
  track_count: number
}

export interface RekordboxImportResult {
  tracks_found: number
  tracks_imported: number
  playlists_found: number
  playlist_names: string[]
}

// ── Commands ────────────────────────────────────────────────────────────────

export async function getTracks(): Promise<TauriTrack[]> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('get_tracks', {}) as Promise<TauriTrack[]>
}

export async function searchTracks(query: string): Promise<TauriTrack[]> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('search_tracks', { query }) as Promise<TauriTrack[]>
}

export async function upsertTrack(track: TauriTrack): Promise<void> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  await inv('upsert_track', { track })
}

export async function upsertTracksBatch(tracks: TauriTrack[]): Promise<number> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('upsert_tracks_batch', { tracks }) as Promise<number>
}

export async function deleteTrack(id: string): Promise<void> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  await inv('delete_track', { id })
}

export async function getSets(): Promise<TauriSet[]> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('get_sets', {}) as Promise<TauriSet[]>
}

export async function saveSet(set: TauriSet): Promise<void> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  await inv('save_set', { set })
}

export async function deleteSet(id: string): Promise<void> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  await inv('delete_set', { id })
}

export async function getFolders(): Promise<TauriFolder[]> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('get_folders', {}) as Promise<TauriFolder[]>
}

export async function addFolder(path: string): Promise<TauriFolder> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('add_folder', { path }) as Promise<TauriFolder>
}

export async function removeFolder(id: string): Promise<void> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  await inv('remove_folder', { id })
}

export interface TauriPlaylist {
  id: string
  name: string
  source: string
  track_count: number
}

export async function getPlaylists(): Promise<TauriPlaylist[]> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('get_playlists', {}) as Promise<TauriPlaylist[]>
}

export async function getPlaylistTracks(playlistId: string): Promise<TauriTrack[]> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('get_playlist_tracks', { playlistId }) as Promise<TauriTrack[]>
}

export async function importRekordbox(path: string): Promise<RekordboxImportResult> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('import_rekordbox', { path }) as Promise<RekordboxImportResult>
}

// ── Tag reading commands ──────────────────────────────────────────────────

export interface AudioTags {
  title: string
  artist: string
  album: string
  genre: string
  bpm: number
  key: string
  camelot: string
  duration_secs: number
  file_path: string
  file_name: string
}

/** Read ID3/FLAC/Vorbis tags from a single audio file */
export async function readAudioTags(path: string): Promise<AudioTags> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('read_audio_tags', { path }) as Promise<AudioTags>
}

/** Scan a folder recursively, reading tags from all audio files */
export async function scanFolderTags(folderPath: string): Promise<AudioTags[]> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('scan_folder_tags', { folderPath }) as Promise<AudioTags[]>
}

/** Re-read tags for tracks with file paths — picks up MIK key updates */
export async function rescanTagsForTracks(filePaths: string[]): Promise<AudioTags[]> {
  const inv = await getInvoke()
  if (!inv) throw new Error('Not in Tauri')
  return inv('rescan_tags_for_tracks', { filePaths }) as Promise<AudioTags[]>
}
