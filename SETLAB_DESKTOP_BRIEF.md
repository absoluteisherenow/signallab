# Set Lab Desktop — Build Brief

## Vision
A standalone desktop app that replaces Rekordbox for electronic music artists who want intelligent set preparation, not just file management. Built on what already exists in Set Lab web, wrapped in Tauri for native file access and offline use.

## Why Desktop
- Full file system access — scan music folders, play any file natively
- No browser limitations (Safari, Chrome permission prompts, session-lost files)
- Offline-first — works at the venue with no wifi
- Direct CDJ/USB export without browser download steps
- Single app, always available in the dock

## Design Direction
- Keep the current Set Lab aesthetic — dark, gold accents, minimal, no clutter
- Current layout works well: library grid, inline player, expandable intelligence cards
- Desktop-specific additions: sidebar for folder tree, waveform display on playing track, keyboard shortcuts

## Core Features

### 1. Music Library (exists — enhance)
- Scan local folders recursively for audio files
- Auto-match to existing library metadata
- Drag folders to add entire collections
- Real-time search across all tracks
- Sub-sections: All, Playlists, Wantlist, Discoveries

### 2. Inline Audio Playback (partially exists — upgrade)
- Click any track to play instantly from disk
- Waveform visualisation on the playing track row
- Keyboard: space = play/pause, arrow keys = skip through library
- No duplication, no uploads — reads directly from disk

### 3. DJ Software Import
- **Rekordbox** — parse rekordbox.xml: tracks, playlists, cue points, BPM, key, history
- **Traktor** — parse collection.nml: same data model
- **Serato** — parse _Serato_ folder structure and crates
- One-click import: "Import from Rekordbox" → pulls everything
- Ongoing sync: detect changes in DJ software DB

### 4. Set History Auto-Import
- Read play history from Rekordbox/Traktor/Serato
- Auto-create gig entries with tracklists
- Timeline: "On March 15 at fabric you played 28 tracks over 2 hours"
- Link to gig entries in the main platform

### 5. Quick Set Analysis
- After a gig: "Analyse this set" on any history entry
- AI feedback: flow rating, energy curve, harmonic journey, transition quality
- Crowd hit tracking: tag tracks that went off
- Comparison: "This set vs your average" / "This track hits 80% of the time"

### 6. Crowd Hits Intelligence
- Track-level crowd reaction scores across all gigs
- Ranking: your top 10 guaranteed bangers
- Trends: "Track X is declining — audience fatigue?" / "Track Y hits every time"
- Feed into set builder: suggested peak-time tracks based on crowd data
- Discovery: "Find more tracks like your top crowd hits"

### 7. Set Builder (exists — enhance for desktop)
- Drag tracks from library into set
- Harmonic mixing guidance (Camelot wheel — already built)
- Energy curve visualisation
- Export to USB/Rekordbox XML
- AI narrative and flow analysis (already built)

### 8. Cross-Lab Integration
- Sets feed into **Gig Lab** debriefs automatically
- Track data flows into **Broadcast Lab** content suggestions
- Crowd hits inform **Signal Lab** post-gig recap posts
- Set history visible on gig detail pages

## Tech Stack
- **Tauri** (Rust backend, web frontend) — lighter than Electron, native performance
- **Existing Next.js UI** — reuse all Set Lab components
- **SQLite** local database for offline library (syncs to Supabase when online)
- **Web Audio API** for playback + waveform rendering
- **Claude Haiku** for set analysis (opt-in, low cost)

## What Already Exists (reuse, don't rebuild)
- Full library UI with grid, search, filters, sub-tabs
- Paste tracklist import (multi-format smart parser)
- Spotify lookup pipeline (album art, metadata)
- Set builder with harmonic compatibility scoring
- Track intelligence (moment type, mix tips, crowd reaction fields)
- BPM extraction from audio files
- Rekordbox XML export
- AI set narrative and flow analysis

## What Needs Building
1. Tauri shell + native file system bridge
2. Audio playback engine with waveform display
3. Rekordbox/Traktor/Serato XML/NML parsers
4. Set history import + auto-gig-linking
5. Crowd hits aggregation + ranking UI
6. SQLite local DB + Supabase sync layer
7. Keyboard shortcuts throughout
8. USB/CDJ export workflow

## User Flow
1. Install app, open it
2. "Import from Rekordbox" → pulls entire library + history
3. Browse tracks, play inline, build sets
4. After a gig: set auto-imported from Rekordbox history
5. "Analyse set" → AI feedback + tag crowd hits
6. Over time: crowd hit rankings build up, inform future sets
7. All data syncs to web platform for gig pages, content, debriefs
