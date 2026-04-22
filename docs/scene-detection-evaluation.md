# Scene-change detection for `chainScan` — evaluation

**Date:** 2026-04-22
**Scope:** Replace/augment the flat-uniform `extractFrames` in [src/lib/chainScan.ts](../src/lib/chainScan.ts) with scene-change detection so the vision model sees the drop, the crowd-turn, the lighting shift — not whatever frame happens to land on a uniform tick.
**Status:** Research + prototype. Not shipped. Feature-flagged off by default.

---

## Recommendation (TL;DR — 280 words)

**Go with Option 1: client-side ffmpeg.wasm, lazy-loaded, feature-flagged, fallback preserved.**

Three reasons, in order of weight:

1. **Privacy.** NM clips are routinely unreleased (Vespers, Ninja tease, studio-floor takes). Sending raw video to a third-party transcoder — even a private Mux/Coconut workspace — crosses a line we don't need to cross. Client-side keeps the file in the browser; the only thing that ever leaves is the tiny JPEG frames we're already uploading to the vision API.
2. **Zero infra commitment.** Option 2 requires standing up a container (Cloudflare Workers have no native ffmpeg) — either R2 + a sidecar container service, or pushing to Mux/Coconut. Both add a recurring cost line and a second deploy target. Option 1 is a dependency install and ~250 lines of code.
3. **The failure mode is free.** If ffmpeg.wasm is slow on a given device, times out, or throws, we fall back to the existing flat-uniform path. No regression. The user hits "Rescan" at worst.

**What we're accepting:** ~7MB gzipped wasm download on first scene-detected scan, 10–60s scene-detect pass on mobile for a 60s clip, 3–10s on desktop. The Sonnet vision call takes 15–30s already, so this ~doubles scan time on mobile — an acceptable tradeoff for actually landing on the drop instead of sampling 0:30 pre-build while the peak sits at 0:38.

**Effort:** ~1.5 days.
- 0.5 day: install deps (`@ffmpeg/ffmpeg`, `@ffmpeg/util`), wire the module, tune the scene-threshold on 5 real NM clips.
- 0.5 day: A/B harness + flag plumbing + log telemetry.
- 0.5 day: failure-mode tests (no SharedArrayBuffer, corrupted video, very short clip, very long clip, static content).

**Rollout:** Ship behind `NEXT_PUBLIC_SCENE_DETECT=1` + localStorage override. Dogfood on Anthony's next five scans. If precision holds, flip default-on. If not, keep it as an opt-in "Precision scan" toggle in the console.

---

## Option 1 — Client-side ffmpeg.wasm (RECOMMENDED)

### Architecture

```
scanSingleFile (chainScan.ts)
  └─ isSceneDetectEnabled()   ← env + localStorage
      ├─ TRUE  → extractScenes(file, maxFrames)     [sceneDetect.ts]
      │          ├─ lazy import @ffmpeg/ffmpeg
      │          ├─ ffmpeg -i <file> -vf "select='gt(scene,0.3)',showinfo" -f null -
      │          ├─ parse pts_time from log stream
      │          ├─ dedupe near-neighbours (<1.5s apart)
      │          ├─ top-up or subsample to target count
      │          └─ canvas-seek + JPEG encode (reuses extractFrames' capture logic)
      └─ FALSE → extractFrames(file, count)          [existing flat-uniform]
```

**Key decision:** use ffmpeg.wasm ONLY to produce a list of interesting timestamps. Keep the actual JPEG encode on the `<video>` + `<canvas>` path we already ship. Two reasons:
- ffmpeg.wasm in-memory FS adds pressure for a 60s @ 720p clip (~70MB raw frames).
- The existing aspect-ratio handling at [chainScan.ts:76-86](../src/lib/chainScan.ts#L76) is portrait-aware. Re-using it means scene-detected frames match uniform-sampled frames byte-for-byte on dimension and quality.

### Threshold tuning

The `scene` filter outputs a 0.0–1.0 score per frame (roughly: mean absolute difference from the previous frame). Starting points from the ffmpeg community:
- `0.2` — low, picks up subtle lighting drifts. Noisy on shaky handheld.
- `0.3` — good default for mixed content.
- `0.4` — strict, picks only clear cuts + major lighting flips.

For NM clips (DJ cam, crowd, venue lighting), start at **0.3**. Tune on the Vespers rehearsal clip + the Soho House capture once those land.

### Bundle & performance

| Metric | Single-threaded core | Multi-threaded core |
|---|---|---|
| Wasm size (gzip) | ~7MB | ~9MB |
| Required headers | none | COOP + COEP |
| 60s clip, desktop (M1) | 3–8s | 1.5–4s |
| 60s clip, mid-tier phone | 20–60s | 10–30s |

**Use single-threaded.** Multi-threaded needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` globally, which breaks embedded YouTube, Spotify, Meta embeds — all of which likely appear in Signal Lab. The ~2× speed is not worth the embed breakage.

### Hosting the wasm core

Two options:
1. **unpkg CDN** (prototype default): `toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.x/dist/umd/ffmpeg-core.wasm', ...)`. Zero repo cost, slight first-load latency, third-party dependency.
2. **Self-host in `/public/ffmpeg/`**: ~25MB added to the Cloudflare deploy. Clean, no third-party, no CORS risk. Recommended once option 1 is validated.

### Estimated cost

**£0/month.** All compute happens on the user's device. The vision API call is unchanged.

---

## Option 2 — Server-side ffmpeg (NOT RECOMMENDED for this use case)

### Architecture sketch

Signal Lab runs on Cloudflare Workers via OpenNext. Workers have no native ffmpeg (no binary execution, tight CPU time limits). Three viable shapes:

**A. Sidecar container on Cloudflare Containers (beta) or Fly.io / Railway.**
```
Browser ──▶ POST /api/scan/scenes ──▶ Worker signs upload URL
                                  ──▶ R2 bucket
Container cron pulls from R2, runs ffmpeg scdet, writes frames to R2,
  POSTs signed frame URLs back to Worker
Worker responds to waiting request (or uses websocket/SSE)
```
Cost: ~£15–40/month idle (always-on container). Per-clip: ~£0.001.

**B. Mux / Coconut / AWS MediaConvert.**
- Mux: upload → `input-info` with scenes — $0.03 per minute of video processed.
- Coconut: custom jobs, ~$0.04 per minute.
- MediaConvert: ~$0.015 per minute.

Back-of-envelope: Anthony scans 20 clips/week × 60s avg × $0.03/min = **$0.60/week = ~£2.50/month**. Cheap.

**C. Cloudflare Stream.** Has thumbnailing but no scene-detection primitive as of this writing.

### Why not recommended here

- **Privacy.** All three options leak unreleased audio+video to a third party. Mux encrypts at rest, but the file still lives on their infrastructure for the retention window. Not a defensible choice for "the Ninja demo".
- **Latency penalty is non-obvious.** On paper a container runs ffmpeg 10× faster than wasm. In practice we pay the upload round-trip. A 50MB clip on UK 4G (10Mbps up) = 40s of upload. That erases the compute speedup.
- **A second deploy target.** Cron worker + Tauri + Next.js is already three surfaces. Adding a container is an ops tax Anthony shouldn't pay for a feature that works in the browser.

### When to revisit

If we later ship a paid tier that promises scan-in-10s-or-it's-free for label users with released-catalog material, Option 2 (specifically Mux) becomes compelling. File a ticket; don't build it now.

---

## Test plan — NM 60s DJ clip with drop at 0:38

### Pass criteria
Scene-detect returns a timestamp within **±2s** of 0:38 in the top-5 ranked moments.

### Test matrix

| # | Clip | Expected | Flat-uniform (baseline) | Scene-detect (target) |
|---|---|---|---|---|
| 1 | 60s DJ set, drop @ 0:38 | Frame near 0:38 | Misses (samples 0:30, 0:40 — neither is the drop) | Hits 0:38±2s |
| 2 | 20s crowd pan | Whole clip is the moment | Fine — any frame works | Fine — top-ups via uniform |
| 3 | 3min warmup, no drop | Flat clip, any frame | Fine | Falls through to uniform (<3 scenes detected) |
| 4 | 90s with 2 drops (0:22, 1:14) | Both peaks | Misses both | Hits both |
| 5 | Static camera locked on CDJ | No scene changes | Fine | Falls through to uniform |
| 6 | Phone-flip sideways at 0:15 | Flip is a fake "scene" | Fine | False positive — expected. Threshold tuning job. |

### How to run
```bash
# Once deps installed:
NEXT_PUBLIC_SCENE_DETECT=1 npm run dev
# Upload each test clip in the broadcast-chain scan flow.
# In DevTools: localStorage.setItem('scanSceneDetect', '1')  # force ON for the session
# Compare film strip + wow_note between the two paths on the same clip.
```

Log lines emitted (see prototype): `[sceneDetect] detected N scenes in Xs, kept M` — paste into the PR description for each test clip.

---

## Prototype — what's in this PR

### Files

- **NEW:** [src/lib/sceneDetect.ts](../src/lib/sceneDetect.ts) — prototype `extractScenes(file, maxFrames)` + `isSceneDetectEnabled()`.
- **EDIT:** [src/lib/chainScan.ts](../src/lib/chainScan.ts) — add plug-point in `scanSingleFile` video branch. Flag OFF → byte-identical behaviour to today.

### Not in this PR (deliberate)

- `npm install @ffmpeg/ffmpeg @ffmpeg/util` — deferred to the ship decision. The prototype module uses `await import(...)` with `@ts-expect-error`, so the current build is unaffected.
- Self-hosting the wasm core in `/public/ffmpeg/`. Prototype uses unpkg.com.
- Progress-event extension for extract sub-stages (`extract:detect` vs `extract:capture`). Not needed for A/B; the existing single `extract` stage still fires start + done with `frames` on done.
- UI toggle in `PhaseScanConsole.tsx`. Per constraints: no UI change. Flag via env + localStorage only.

### Install + enable

```bash
# When ready to ship the prototype to production:
cd signallab
npm install @ffmpeg/ffmpeg @ffmpeg/util

# Enable at build:
echo 'NEXT_PUBLIC_SCENE_DETECT=1' >> .env.local

# Enable per-session (no rebuild):
localStorage.setItem('scanSceneDetect', '1')    // force ON
localStorage.setItem('scanSceneDetect', '0')    // force OFF
localStorage.removeItem('scanSceneDetect')      // fall back to env default
```

---

## Open questions for Anthony

1. **Wasm hosting:** unpkg.com for prototype, self-host before flipping default-on? (Recommendation: yes, self-host before default-on.)
2. **Threshold default:** 0.3 per ffmpeg community default, tune after 5 real NM clips. Any specific clips you want me to tune on first?
3. **Fallback observability:** should every fallback (wasm failed to load, detect returned <3 scenes, timeout) surface in the scan telemetry panel, or just log to console? (Recommendation: log-only for prototype, panel once default-on.)
4. **Timeout ceiling:** current extract is near-instant; with scene-detect a 90s mobile scan gets noticeable. Add a 45s scene-detect timeout that falls back to uniform? (Recommendation: yes, 45s.)

---

## Rejected alternatives

- **Uniform sampling + vision post-filter** ("take 24 uniform frames, let Sonnet pick the best 6"). Still misses the drop — if the drop is at 0:38 and the uniform samples are at 0:30/0:35/0:40/..., Sonnet can only choose from what it's shown.
- **Audio-peak detection as a proxy for drops.** Accurate for sample-accurate drop-finding, but DJ sets have many audio peaks that aren't visual peaks (a kick loop isn't a moment). Also: crowd footage without strong audio would score zero. Rejected.
- **Optical-flow based moment detection.** Good in theory, but no mature JS library. Building one is out of scope.
- **Server-side MediaPipe / TensorFlow.js smart trim.** Too heavy for the browser, and server-side has the same privacy issue as option 2.
