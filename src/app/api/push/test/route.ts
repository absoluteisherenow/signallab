import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { sendDatalessWebPush, type WebPushSubscription, type VapidKeys } from '@/lib/vapid'

export const dynamic = 'force-dynamic'

// POST /api/push/test — fires a test Web Push to all the caller's registered
// web subscriptions. Not gated behind admin because each user can only
// target their own devices via RLS + requireUser scoping.
//
// Body (optional): { title?, body?, href? } — stashed in pending_push_messages
//   so the SW's fetch to /api/notifications/next picks them up.
//
// Required secrets (wrangler):
//   VAPID_PUBLIC_KEY   — 65-byte uncompressed P-256, base64url
//   VAPID_PRIVATE_KEY  — 32-byte scalar, base64url
//   VAPID_SUBJECT      — mailto:you@example.com or https://signallabos.com

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient: sb } = gate

  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) {
    return NextResponse.json(
      { error: 'VAPID secrets not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)' },
      { status: 501 }
    )
  }
  const keys: VapidKeys = { publicKey: pub, privateKey: priv, subject }

  let body: { title?: string; body?: string; href?: string } = {}
  try { body = await req.json() } catch {}

  // Stash the pending message so the SW can fetch it on wake. If
  // pending_push_messages doesn't exist we still fire — the SW will fall
  // back to a generic payload (see sw.template.js push handler).
  await sb.from('pending_push_messages').insert({
    user_id: user.id,
    title: body.title || 'Signal Lab OS',
    body: body.body || 'Test notification',
    href: body.href || '/',
  }).select().single().then(() => null, () => null)

  const { data: devices, error } = await sb
    .from('user_devices')
    .select('id, token, web_push_keys')
    .eq('user_id', user.id)
    .eq('platform', 'web')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!devices || devices.length === 0) {
    return NextResponse.json({ error: 'no web push subscriptions for this user' }, { status: 404 })
  }

  const results = await Promise.all(
    devices.map(async (d) => {
      const sub: WebPushSubscription = {
        endpoint: d.token,
        keys: d.web_push_keys || undefined,
      }
      try {
        const res = await sendDatalessWebPush(sub, keys)
        // 410 Gone / 404 Not Found — subscription is dead, purge it.
        if (res.status === 410 || res.status === 404) {
          await sb.from('user_devices').delete().eq('id', d.id)
        }
        return { id: d.id, status: res.status }
      } catch (err) {
        return { id: d.id, error: err instanceof Error ? err.message : String(err) }
      }
    })
  )

  return NextResponse.json({ ok: true, results })
}
