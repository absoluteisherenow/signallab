# Promo Hub Migration Plan (Option C)

**Status:** Draft — pending approval
**Date:** 2026-04-18
**Goal:** Consolidate `/releases`, `/releases?tab=promo`, and the orphan `/drop-lab` route into a single `/promo` hub. Streamlined power-feature with keyboard shortcuts, cross-data intelligence, and clean tab navigation.

---

## Red flags found (verified assumptions)

1. **`promo_blasts` has NO `release_id` column.** Verified in `supabase/migrations/20260404_promo_tracking.sql:6-18`. Columns: `id, track_url, track_title, track_artist, message, contact_count, sent_count, failed_count, sc_plays_before, sc_plays_after, created_at`. The only link to a release is a free-text `track_url`. **A DB migration IS required** if "Campaigns tab linked to releases" is to be reliable.
2. **A `/drop-lab` route already exists** at `src/app/drop-lab/page.tsx` — it's a stale earlier-generation copy of the contacts/blast UI (no release awareness). Not linked from nav but reachable. Delete or redirect.
3. **No "Promo" tab exists in the mobile bottom bar.** `MobileShell.tsx` has no "Promo" string; action buttons are Scan/Playlist/Upload. Initial brief assumption was wrong.
4. **`/api/promo-blast/route.ts` does not accept `release_id`.** It destructures only `contact_ids, message, promo_url, track_title, track_artist, hosted` (line 47). Needs extension.
5. **`src/app/releases/page.tsx` is one 841-line file** containing both tabs plus the entire blast panel. Clean component boundaries at line 82 (`ReleasesTab`) and 295 (`DJPromoTab`).
6. **Cross-refs to `/releases` live in 9+ call sites:** `Navigation.tsx:32`, `CommandPalette.tsx:24,30`, `MobileShell.tsx:687`, `api/releases/route.ts:47`, `api/signal-bar/route.ts:30`, plus dashboard/today/signal-drop/broadcast/ads.
7. **External surfaces** that link to `/releases/[id]/campaign` or `/releases/[id]/edit`: `system_notifications.href` written by `api/releases/route.ts:47`. Mid-flight breakage would orphan notification links — redirects must be permanent.

---

## Phase breakdown

### Phase 1 — Scaffold `/promo` + extract components (zero user-visible change)
- Create `src/app/promo/page.tsx` (Suspense + `PromoInner`).
- Create `src/components/promo/PromoHeader.tsx`, `ReleasesTab.tsx`, `ContactsTab.tsx`, `CampaignsTab.tsx`, `NewBlastDialog.tsx`.
- Extract `ReleasesTab` (from `releases/page.tsx:84-289`) and `DJPromoTab` (lines 295-841) into the new files verbatim, keeping `releases/page.tsx` as a thin wrapper that imports from `components/promo/*`. **This is the safe refactor commit.** No routing changes yet.
- Add `CampaignsTab.tsx` as new (reads from `promo_blasts` via `/api/promo-stats`).
- Ship behind no flag — code lives but unreferenced.

### Phase 2 — Data model & cross-intel
- Migration: `ALTER TABLE promo_blasts ADD COLUMN release_id UUID REFERENCES releases(id) ON DELETE SET NULL`. Backfill heuristic: match `track_url` against `releases.streaming_url`.
- New endpoint `/api/promo/intel` returning `{activeCampaigns, sendsThisMonth, replies}` + per-contact `{lastSentDaysAgo, playedCount}`.
- Extend `/api/promo-blast/route.ts:47` to accept `release_id`, persist on insert.
- `PromoHeader` consumes `/api/promo/intel`; `ContactsTab` row shows `last_sent_at`/`total_promos_sent` (already in `dj_contacts`); `ReleasesTab` row shows `promoed to N / M replies` (join via new `release_id`).

### Phase 3 — Route swap + redirects (first user-visible change)
- Flip `Navigation.tsx:32` from `/releases` → `/promo`, rename label to "Promo".
- Update `CommandPalette.tsx:24,30` (label + Create entry `/promo?new=blast`).
- Add redirects in `src/middleware.ts`:
  - `/releases` → `/promo?tab=releases`
  - `/releases?tab=promo` → `/promo?tab=contacts`
  - `/drop-lab` → `/promo`
- Keep `/releases/[id]/edit` and `/releases/[id]/campaign` working (do NOT redirect yet).
- Update `MobileShell.tsx:687` (`/releases` → `/promo`).
- Update `api/signal-bar/route.ts:30` (LLM allow-list of navigable pages).

### Phase 4 — Power features
- Keyboard: new `src/hooks/usePromoShortcuts.ts`. `1/2/3` → tab switch; `cmd+N` → `NewBlastDialog`; `/` → focus search; `cmd+K` → `CommandPalette`. Guard against firing inside inputs/textareas.
- `NewBlastDialog.tsx` — 3-step wizard (pick release → pick contacts with tier filters → compose with `/api/promo-write` AI assist). Replaces inline blast panel.
- Bulk actions: "Send to tier 1", "Schedule series" (creates N `scheduled_posts` phased over days).
- Instant filters: `useMemo` over already-loaded arrays (no refetch).

### Phase 5 — Deep route absorption + cleanup
- Move `src/app/releases/[id]/edit/*` → `src/app/promo/release/[id]/edit/*`.
- Move `src/app/releases/[id]/campaign/*` → `src/app/promo/release/[id]/campaign/*`.
- Move `src/app/releases/new/*` → `src/app/promo/release/new/*`.
- Middleware: add redirects for deep routes (keep indefinitely — notification rows persist).
- Update `api/releases/route.ts:47` to write new href for new notifications.
- Delete `src/app/releases/page.tsx`, `src/app/drop-lab/page.tsx`.

---

## Route migration table

| From | To | Phase |
|---|---|---|
| `/releases` | `/promo?tab=releases` | 3 (redirect) |
| `/releases?tab=promo` | `/promo?tab=contacts` | 3 (redirect) |
| `/drop-lab` | `/promo` | 3 (redirect) |
| `/releases/new` | `/promo/release/new` | 5 (move + redirect) |
| `/releases/[id]/edit` | `/promo/release/[id]/edit` | 5 (move + redirect) |
| `/releases/[id]/campaign` | `/promo/release/[id]/campaign` | 5 (move + redirect) |

---

## Component architecture

- `src/app/promo/page.tsx` — Suspense wrapper + reads `?tab=` searchParam. No `layout.tsx` needed.
- `src/components/promo/PromoHeader.tsx` — intelligence strip + persistent "+ New Blast" CTA.
- `src/components/promo/ReleasesTab.tsx` — extracted from `releases/page.tsx:82-289`.
- `src/components/promo/ContactsTab.tsx` — extracted from `releases/page.tsx:538-655`.
- `src/components/promo/CampaignsTab.tsx` — new.
- `src/components/promo/NewBlastDialog.tsx` — upgraded from side-panel blast UI (`releases/page.tsx:657-838`).
- `src/hooks/usePromoShortcuts.ts` — keyboard bindings.

Keep `src/components/promo/DropPlayer.tsx` + `DropUploader.tsx` as-is (unrelated `/signal-drop` feature).

---

## Data model verdict

- **No new `campaigns` table.** `promo_blasts` + `scheduled_posts` already model the domain.
- **Required migration (Phase 2):**
  ```sql
  ALTER TABLE promo_blasts ADD COLUMN release_id UUID REFERENCES releases(id) ON DELETE SET NULL;
  CREATE INDEX idx_promo_blasts_release ON promo_blasts(release_id);
  ```
- Optional backfill: match `promo_blasts.track_url` against `releases.streaming_url` — best-effort.
- `scheduled_posts.release_id` already exists (`20260331_add_release_id_to_scheduled_posts.sql`).

---

## Risks + regression points

- **Notification href drift.** `api/releases/route.ts:47` writes `/releases/{id}/campaign` into `system_notifications.href`. Existing rows dead-link after Phase 5 — middleware redirects solve this; keep permanently.
- **Cron-generated hrefs.** Grep `/releases` under `api/crons` before each phase. Currently none — re-check.
- **Signal Bar LLM prompt** (`api/signal-bar/route.ts:30`) hard-codes `/releases`. Update in Phase 3 — forgetting causes assistant to suggest dead URLs.
- **Middleware public-path check.** `/api/promo` already whitelisted (`middleware.ts:56`). `/promo` itself is NOT public — correct (auth required).
- **LocalStorage key `nm_blast_draft`** shared by `releases/page.tsx` and stale `drop-lab/page.tsx`. Keep; don't rename during migration.
- **Gated-send (`useGatedSend`) client flow** must survive component extraction — confirm after Phase 1 refactor.
- **Contact row `last_sent_at` / `total_promos_sent`** come from `dj_contacts` columns, updated server-side by `/api/promo-blast`. Don't reimplement client-side.

---

## Pre-ship checks (per phase)

- **Phase 1:** build passes; `/releases?tab=promo` still loads + sends blast; campaign page loads.
- **Phase 2:** migration applied; `/api/promo/intel` returns non-null; existing blast send still persists (release_id nullable).
- **Phase 3:** all redirects hit; Today/Dashboard upcoming-release links work; mobile nav "Promo" resolves.
- **Phase 4:** keyboard shortcuts don't fire inside inputs/textareas (`e.target.tagName` guard).
- **Phase 5:** existing system_notification rows redirect cleanly; nothing 404s.

---

## File inventory

### MOVE
| Current | New home | Phase |
|---|---|---|
| `src/app/releases/page.tsx` | deleted; content split into `src/components/promo/*` | 1 extract, 5 delete |
| `src/app/releases/new/page.tsx` | `src/app/promo/release/new/page.tsx` | 5 |
| `src/app/releases/[id]/edit/page.tsx` + `PageClient.tsx` | `src/app/promo/release/[id]/edit/*` | 5 |
| `src/app/releases/[id]/campaign/page.tsx` + `PageClient.tsx` | `src/app/promo/release/[id]/campaign/*` | 5 |
| `src/app/drop-lab/page.tsx` | DELETE (stale) | 3 |

### CHANGE (in place)
- `src/components/layout/Navigation.tsx` (line 32)
- `src/components/ui/CommandPalette.tsx` (lines 24, 30)
- `src/components/mobile/MobileShell.tsx` (line 687)
- `src/middleware.ts` (add redirects block)
- `src/app/api/promo-blast/route.ts` (line 47 — accept + persist `release_id`)
- `src/app/api/releases/route.ts` (line 47 — new notification href)
- `src/app/api/signal-bar/route.ts` (line 30 — LLM prompt)
- `supabase/migrations/` — new: `20260418_promo_blast_release_id.sql`

### STAY
- `src/app/api/contacts/route.ts`
- `src/app/api/promo-write/route.ts`
- `src/app/api/promo-stats/route.ts`
- `src/app/api/promo-reactions/route.ts`
- `src/app/api/promo-click/route.ts`
- `src/app/api/releases/[id]/campaign/route.ts`
- `src/app/api/releases/route.ts` (list body)
- `src/app/go/[code]/*` (public landing)
- `src/app/signal-drop/*` (unrelated)

### NEW
- `src/app/promo/page.tsx`
- `src/components/promo/PromoHeader.tsx`
- `src/components/promo/ReleasesTab.tsx`
- `src/components/promo/ContactsTab.tsx`
- `src/components/promo/CampaignsTab.tsx`
- `src/components/promo/NewBlastDialog.tsx`
- `src/hooks/usePromoShortcuts.ts`
- `src/app/api/promo/intel/route.ts`
- `supabase/migrations/20260418_promo_blast_release_id.sql`

---

## Power-feature bake-in (streamlined hub)

Top strip (all tabs):
```
┌──────────────────────────────────────────────────────────────┐
│ PROMO                                        [+ NEW BLAST]   │
│ ▸ 3 active campaigns · 47 sends this month · 12 replies     │
├──────────────────────────────────────────────────────────────┤
│ [ RELEASES (1) ]  [ CONTACTS (2) ]  [ CAMPAIGNS (3) ]       │
└──────────────────────────────────────────────────────────────┘
```

Keyboard:
- `1 / 2 / 3` — switch tabs
- `cmd+N` — new blast dialog
- `/` — focus search on current tab
- `cmd+K` — global command palette (already exists)
- `esc` — close dialog / clear search

Cross-tab intel:
- Releases row: "promoed to N · M replies · last blast X days ago"
- Contacts row: "last sent X days ago · N plays · M replies"
- Campaigns feed: "Kolibri EP → 20 contacts → 14 sent · 6 replies · 3 plays"

Inline previews (no modal stacks):
- Click a release → side-drawer with campaign detail (not navigation)
- Click a contact → side-drawer with blast history

Bulk actions (Contacts tab):
- Select multiple (shift-click) → "Send blast to selected"
- "Send to tier 1" single-action button
- "Schedule series" — N sends phased over M days
