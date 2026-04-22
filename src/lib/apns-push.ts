// APNs (Apple Push Notification service) dispatch.
//
// Runs on Cloudflare Workers — uses Web Crypto for ES256 JWT signing, native
// fetch for HTTP/2 to api.push.apple.com. No node-apn dep (wouldn't work on
// Workers runtime).
//
// Config (all in Cloudflare Worker secrets, not .env.local):
//   APNS_AUTH_KEY   — contents of AuthKey_XXXXXXXXXX.p8, base64-encoded
//   APNS_KEY_ID     — 10-char Key ID from the .p8 filename
//   APNS_TEAM_ID    — 10-char Team ID (also in AASA Team ID)
//   APNS_BUNDLE_ID  — com.signallab.os (must match capacitor.config.ts)
//   APNS_ENV        — 'production' or 'sandbox' (TestFlight uses sandbox)
//
// Until those secrets exist, `sendToUser` logs + silently no-ops. Safe to
// call from any notification code path without conditionals.

import { createClient } from '@supabase/supabase-js'

interface APNsPayload {
  title: string
  body?: string
  badge?: number
  sound?: string
  threadId?: string           // groups related notifications in the stack
  data?: Record<string, unknown>  // custom key/value — read in the native app
}

interface SendResult {
  sent: number
  failed: number
  retired: number  // tokens removed due to 410 Gone
  skipped: boolean // true when APNs isn't configured
}

const APNS_HOST_PROD = 'api.push.apple.com'
const APNS_HOST_SANDBOX = 'api.sandbox.push.apple.com'

function configured(): boolean {
  return !!(
    process.env.APNS_AUTH_KEY &&
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID &&
    process.env.APNS_BUNDLE_ID
  )
}

// Build and sign the JWT required by APNs token-based auth. Cached for
// <1h by the caller. Apple rejects tokens older than an hour.
async function signJWT(): Promise<string> {
  const keyId = process.env.APNS_KEY_ID!
  const teamId = process.env.APNS_TEAM_ID!
  const p8Base64 = process.env.APNS_AUTH_KEY!

  const header = { alg: 'ES256', kid: keyId }
  const now = Math.floor(Date.now() / 1000)
  const claims = { iss: teamId, iat: now }

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const signingInput = `${enc(header)}.${enc(claims)}`

  // The .p8 is a PKCS8 PEM — strip header/footer + base64-decode the body.
  const p8Text = atob(p8Base64)
  const pemBody = p8Text
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  ))
  const sigB64 = btoa(String.fromCharCode(...sig))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return `${signingInput}.${sigB64}`
}

export async function sendToUser(
  userId: string,
  payload: APNsPayload,
): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, retired: 0, skipped: !configured() }

  if (!configured()) {
    console.log('[apns] skipped — APNS_* secrets not set', { userId, title: payload.title })
    return result
  }

  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: devices } = await sb.from('user_devices')
    .select('id, token, environment')
    .eq('user_id', userId)
    .eq('platform', 'ios')

  if (!devices || devices.length === 0) return result

  const jwt = await signJWT()
  const apsBody = {
    aps: {
      alert: { title: payload.title, body: payload.body || '' },
      badge: payload.badge,
      sound: payload.sound || 'default',
      'thread-id': payload.threadId,
    },
    ...(payload.data || {}),
  }

  const bundleId = process.env.APNS_BUNDLE_ID!
  const envOverride = process.env.APNS_ENV

  await Promise.all(devices.map(async (d: { id: string; token: string; environment: string }) => {
    const host = (envOverride || d.environment) === 'sandbox' ? APNS_HOST_SANDBOX : APNS_HOST_PROD
    try {
      const res = await fetch(`https://${host}/3/device/${d.token}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${jwt}`,
          'apns-topic': bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
        },
        body: JSON.stringify(apsBody),
      })
      if (res.status === 200) {
        result.sent += 1
      } else if (res.status === 410) {
        // Device token is no longer valid — Apple told us to stop.
        await sb.from('user_devices').delete().eq('id', d.id)
        result.retired += 1
      } else {
        const reason = await res.text().catch(() => '')
        console.warn('[apns] delivery failed', { status: res.status, reason, deviceId: d.id })
        result.failed += 1
      }
    } catch (e) {
      console.warn('[apns] network error', e instanceof Error ? e.message : e)
      result.failed += 1
    }
  }))

  return result
}
