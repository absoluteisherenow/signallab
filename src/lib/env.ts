// ── env.ts ───────────────────────────────────────────────────────────────────
// Read env vars + secrets in a way that works on both Cloudflare Workers
// (production, via OpenNext) and Node.js (local `next dev`).
//
// Why: `wrangler secret put` secrets ARE exposed to the Worker, but only via
// the bindings on `getCloudflareContext().env`. OpenNext's compat layer does
// NOT automatically forward those to `process.env` at request time — so a
// route that does `process.env.ANTHROPIC_API_KEY` finds nothing in prod and
// falsely reports "API key not configured."
//
// This helper checks the CF bindings first, then falls back to `process.env`
// for local dev (where `.env.local` populates process.env). That covers both
// runtimes without every route needing to know the difference.
// ─────────────────────────────────────────────────────────────────────────────

import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function env(name: string): Promise<string | undefined> {
  // Try Cloudflare bindings first (prod path)
  try {
    const ctx = await getCloudflareContext({ async: true })
    const val = (ctx.env as unknown as Record<string, string | undefined>)[name]
    if (val) return val
  } catch {
    // Not inside a CF Worker context — fall through to process.env
  }
  return process.env[name]
}
