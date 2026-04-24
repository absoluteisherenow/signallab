// Minimal Sentry reporter for the Cloudflare Worker entry. Zero deps —
// we hand-craft a Sentry envelope and POST it to the ingest endpoint.
// Why not @sentry/cloudflare? That pulls ~30KB into the bundle, and we
// only need crash reporting, not tracing/profiling. If we outgrow this,
// swap to the official SDK — the call sites won't change.
//
// Wiring:
//   - Set wrangler secret SENTRY_DSN to enable. Unset = silent no-op.
//   - worker-entry.mjs wraps fetch + scheduled with captureError().
//   - Context (route, cron path, status) is attached as tags + extras.
//
// DSN format: https://<KEY>@<HOST>/<PROJECT_ID>
//   e.g. https://abc123@o12345.ingest.sentry.io/6789
// We parse it into { key, host, projectId } once and reuse.

function parseDsn(dsn) {
  try {
    const url = new URL(dsn)
    const projectId = url.pathname.replace(/^\//, '')
    if (!url.username || !url.host || !projectId) return null
    return { key: url.username, host: url.host, projectId }
  } catch {
    return null
  }
}

function buildEvent({ error, level, tags, extra, environment, release }) {
  const err = error instanceof Error ? error : new Error(String(error))
  const frames = (err.stack || '')
    .split('\n')
    .slice(1) // drop the message line
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => ({ filename: line, in_app: true }))
    .reverse() // Sentry expects innermost last

  return {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: level || 'error',
    environment: environment || 'production',
    release,
    tags: tags || {},
    extra: extra || {},
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value: err.message,
          stacktrace: { frames },
        },
      ],
    },
  }
}

// Post a single event envelope. Returns a Promise — call inside ctx.waitUntil
// so the Worker doesn't exit before the request completes.
export async function captureError(dsn, payload) {
  const parsed = parseDsn(dsn)
  if (!parsed) return
  const event = buildEvent(payload)
  const envelope =
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify(event) +
    '\n'

  const url = `https://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_key=${parsed.key}&sentry_version=7`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
    })
  } catch {
    // Swallow — reporting errors about the error reporter is a loop we don't want.
  }
}
