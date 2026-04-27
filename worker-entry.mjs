// Custom Cloudflare Worker entry that wraps the OpenNext-generated worker
// to add a `scheduled()` handler for CF cron triggers.
//
// The OpenNext worker only exports `fetch`. We re-export it here, and add
// `scheduled` which fans out to our internal cron routes via the worker's
// own fetch handler (so the route runs in the same isolate, with full env).

import openNextWorker from "./.open-next/worker.js";
import { captureError } from "./src/lib/sentry-worker.mjs";

// ── Routes that run EVERY 5 minutes (high-frequency) ──────────────────────
const EVERY_TICK_ROUTES = [
  "/api/crons/publish-due-posts",
];

// ── Routes that run EVERY HOUR ────────────────────────────────────────────
// Gmail scans + invoice detection — hourly ensures nothing sits unprocessed
const HOURLY_ROUTES = [
  "/api/gmail/process",
  "/api/gmail/invoice-requests",
];

// ── Routes that run ONCE per day at specific UTC hours ────────────────────
// Format: { path, hour } — the route fires on the first tick after that UTC hour.
// All times are in UTC. BST = UTC+1, so 08:00 UTC = 09:00 BST.
const DAILY_ROUTES = [
  { path: "/api/agents/advance-chaser",   hour: 9  },  // 10:00 BST — chase advancing
  { path: "/api/invoices/reminders",      hour: 10 },  // 11:00 BST — invoice reminders
  { path: "/api/crons/invoice-backfill",  hour: 11 },  // 12:00 BST — catch missing invoices
  { path: "/api/agents/weekly-content",   hour: 7  },  // 08:00 BST Mon — weekly content (self-throttles to Mon)
  { path: "/api/agents/post-gig",         hour: 23 },  // 00:00 BST — post-gig debrief
  { path: "/api/crons/night-before",      hour: 18 },  // 19:00 BST — pre-gig briefing
  { path: "/api/crons/sync-performance",  hour: 9  },  // 10:00 BST — sync IG performance
  { path: "/api/crons/check-comments",    hour: 12 },  // 13:00 BST — check IG comments
  { path: "/api/crons/push-cleanup",      hour: 3  },  // 04:00 BST — TTL purge pending_push_messages
  { path: "/api/crons/vendor-ops",        hour: 7  },  // 08:00 BST — vendor ops scan (Sentry/Stripe/CF/etc.)
  { path: "/api/crons/vendor-ops",        hour: 17 },  // 18:00 BST — vendor ops scan (evening pass)
];

function isTopOfHour() {
  return new Date().getUTCMinutes() < 5;
}

function shouldRunDaily(hourUTC) {
  const now = new Date();
  return now.getUTCHours() === hourUTC && now.getUTCMinutes() < 5;
}

// Sentry tags that apply to every event from this worker. The release is
// populated by the build (CF_PAGES_COMMIT_SHA / GITHUB_SHA) so we can slice
// errors by deploy.
const RELEASE =
  (typeof globalThis !== "undefined" && (globalThis.CF_PAGES_COMMIT_SHA || globalThis.GITHUB_SHA)) ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  "unknown";

export default {
  // Forward all HTTP traffic to the OpenNext worker. Wrap in try/catch so
  // runtime crashes are reported to Sentry (when SENTRY_DSN is set) before
  // the response is returned. We still rethrow so CF serves its default 500.
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      const res = await openNextWorker.fetch(req, env, ctx);
      // OpenNext swallows route-handler throws and turns them into 500s —
      // so we have to inspect the response to catch real server errors.
      // Only report 5xx (4xx is usually auth/validation, not a bug).
      if (res.status >= 500 && env.SENTRY_DSN) {
        ctx.waitUntil(
          captureError(env.SENTRY_DSN, {
            error: new Error(`${req.method} ${url.pathname} responded ${res.status}`),
            level: "error",
            environment: env.NEXT_PUBLIC_APP_URL?.includes("localhost") ? "development" : "production",
            release: RELEASE,
            tags: { handler: "fetch", method: req.method, path: url.pathname, status: String(res.status) },
            extra: { url: req.url },
          })
        );
      }
      return res;
    } catch (err) {
      if (env.SENTRY_DSN) {
        ctx.waitUntil(
          captureError(env.SENTRY_DSN, {
            error: err,
            environment: env.NEXT_PUBLIC_APP_URL?.includes("localhost") ? "development" : "production",
            release: RELEASE,
            tags: { handler: "fetch", method: req.method, path: url.pathname },
            extra: { url: req.url },
          })
        );
      }
      throw err;
    }
  },

  // Cloudflare scheduled handler — fires on the cron triggers in wrangler.jsonc
  async scheduled(event, env, ctx) {
    const base = env.NEXT_PUBLIC_APP_URL || "https://signallabos.com";
    const auth = env.CRON_SECRET ? { Authorization: `Bearer ${env.CRON_SECRET}` } : {};

    // Routes that only export POST handlers
    const POST_ROUTES = new Set([
      "/api/crons/publish-due-posts",
      "/api/crons/invoice-backfill",
    ]);

    async function callRoute(path) {
      const method = POST_ROUTES.has(path) ? "POST" : "GET";
      try {
        const req = new Request(`${base}${path}`, {
          method,
          headers: { "x-vercel-cron": "1", ...auth },
        });
        const res = await openNextWorker.fetch(req, env, ctx);
        const text = await res.text().catch(() => "");
        console.log(`[cron] ${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
        // Non-2xx from a cron route is an error even if fetch didn't throw.
        // Report so we don't silently drift (half of our cron failures are
        // 500s from the handler, not thrown exceptions at this layer).
        if (!res.ok && env.SENTRY_DSN) {
          ctx.waitUntil(
            captureError(env.SENTRY_DSN, {
              error: new Error(`cron ${method} ${path} responded ${res.status}`),
              level: res.status >= 500 ? "error" : "warning",
              release: RELEASE,
              tags: { handler: "scheduled", path, method, status: String(res.status) },
              extra: { body: text.slice(0, 500) },
            })
          );
        }
      } catch (err) {
        console.error(`[cron] ${path} failed:`, err);
        if (env.SENTRY_DSN) {
          ctx.waitUntil(
            captureError(env.SENTRY_DSN, {
              error: err,
              release: RELEASE,
              tags: { handler: "scheduled", path, method },
            })
          );
        }
      }
    }

    const tasks = [];

    // High-frequency routes — every 5 min tick
    for (const path of EVERY_TICK_ROUTES) {
      tasks.push(callRoute(path));
    }

    // Hourly routes — Gmail scan + invoice detection
    if (isTopOfHour()) {
      for (const path of HOURLY_ROUTES) {
        tasks.push(callRoute(path));
      }
    }

    // Daily routes — only on their scheduled hour
    for (const { path, hour } of DAILY_ROUTES) {
      if (shouldRunDaily(hour)) {
        tasks.push(callRoute(path));
      }
    }

    ctx.waitUntil(Promise.all(tasks));
  },
};
