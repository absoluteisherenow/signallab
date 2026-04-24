// Server-side fan-out for Web Push. Mirror of apns-push.ts/sendToUser: it
// pulls every 'web' row from user_devices for the user, queues the payload
// into pending_push_messages (so the SW can fetch it on wake — dataless
// push), then fires a VAPID-signed POST to each subscription endpoint.
//
// No-op when VAPID_* secrets aren't set.
//
// Call this AFTER the user_devices row is known to exist — usually just
// alongside the existing APNs call in createNotification().

import { createClient } from '@supabase/supabase-js'
import { sendDatalessWebPush, type VapidKeys, type WebPushSubscription } from './vapid'

interface WebPushResult {
  sent: number
  failed: number
  retired: number
  skipped: boolean
}

interface WebPushPayload {
  title: string
  body?: string
  href?: string
  icon?: string
  badge?: string
  tag?: string
}

function loadKeys(): VapidKeys | null {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return null
  return { publicKey: pub, privateKey: priv, subject }
}

export async function sendWebPushToUser(
  userId: string,
  payload: WebPushPayload
): Promise<WebPushResult> {
  const keys = loadKeys()
  if (!keys) {
    return { sent: 0, failed: 0, retired: 0, skipped: true }
  }

  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: devices } = await sb
    .from('user_devices')
    .select('id, token, web_push_keys')
    .eq('user_id', userId)
    .eq('platform', 'web')

  if (!devices || devices.length === 0) {
    return { sent: 0, failed: 0, retired: 0, skipped: false }
  }

  // Queue the payload so the SW can fetch it on wake. One row per push —
  // if the user has multiple web devices, they all fetch the same oldest
  // pending message and we're fine (each SW fetches independently, queue
  // drains on first delivery).
  await sb.from('pending_push_messages').insert({
    user_id: userId,
    title: payload.title,
    body: payload.body || null,
    href: payload.href || '/',
    icon: payload.icon || null,
    badge: payload.badge || null,
    tag: payload.tag || null,
  }).select().single().then(() => null, () => null)

  const result: WebPushResult = { sent: 0, failed: 0, retired: 0, skipped: false }

  await Promise.all(
    devices.map(async (d: { id: string; token: string; web_push_keys: unknown }) => {
      const sub: WebPushSubscription = {
        endpoint: d.token,
        keys: (d.web_push_keys as WebPushSubscription['keys']) || undefined,
      }
      try {
        const res = await sendDatalessWebPush(sub, keys)
        if (res.status >= 200 && res.status < 300) {
          result.sent += 1
        } else if (res.status === 404 || res.status === 410) {
          // Subscription gone — purge the row so we stop retrying forever.
          await sb.from('user_devices').delete().eq('id', d.id)
          result.retired += 1
        } else {
          result.failed += 1
        }
      } catch {
        result.failed += 1
      }
    })
  )

  return result
}
