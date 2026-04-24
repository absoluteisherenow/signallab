// Browser-side helpers for subscribing to Web Push. Safe to call
// unconditionally — every function guards on capability and returns null
// (or false) when the browser, tab, or platform can't support it.
//
// Required env: NEXT_PUBLIC_VAPID_PUBLIC_KEY (base64url, from `npx web-push
// generate-vapid-keys`). If unset the subscribe flow refuses rather than
// silently succeeding against a default key.

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const pad = '='.repeat((4 - (base64String.length % 4)) % 4)
  const b64 = (base64String + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function webPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) || null
  } catch {
    return null
  }
}

// Prompt the user, subscribe, and POST the subscription to /api/devices/register
// so our backend can push to them. Returns the subscription on success,
// null on any failure (permission denied, no VAPID key, SW not registered).
export async function subscribeToWebPush(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapid) {
    console.warn('[web-push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — refusing to subscribe')
    return null
  }

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return null

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    await registerSubscription(existing)
    return existing
  }

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: TS libdom types for applicationServerKey want ArrayBuffer
      // specifically, but the runtime accepts any BufferSource.
      applicationServerKey: urlB64ToUint8Array(vapid) as unknown as BufferSource,
    })
    await registerSubscription(sub)
    return sub
  } catch (err) {
    console.warn('[web-push] subscribe failed', err)
    return null
  }
}

export async function unsubscribeFromWebPush(): Promise<boolean> {
  const sub = await currentPushSubscription()
  if (!sub) return true
  try {
    await fetch(`/api/devices/register?token=${encodeURIComponent(sub.endpoint)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  } catch {}
  try {
    return await sub.unsubscribe()
  } catch {
    return false
  }
}

async function registerSubscription(sub: PushSubscription) {
  // We use the endpoint URL as the "token" since it's the unique identifier
  // the push service assigned this subscription. Keys are included so the
  // server can later switch to encrypted payloads without another round trip.
  const json = sub.toJSON()
  await fetch('/api/devices/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: 'web',
      token: json.endpoint || sub.endpoint,
      bundle_id: typeof location !== 'undefined' ? location.origin : null,
      environment: 'production',
      app_version: 'web',
      device_name: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : null,
      // Stash keys in a separate field — the register route will ignore it
      // today but we can persist once the user_devices schema has a column.
      web_push_keys: json.keys || null,
    }),
  }).catch(() => {})
}
