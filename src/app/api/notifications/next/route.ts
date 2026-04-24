import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Called by the service worker when a dataless Web Push arrives. We pop the
// oldest pending payload for this user and return it. SW then displays it.
//
// Why this pattern: Web Push from a Cloudflare Worker can't easily encrypt
// a payload (aes128gcm isn't native in Workers), so we send payload-less
// pushes and have the SW pull content via this authenticated endpoint. The
// user's auth cookie rides along because `fetch(..., { credentials:
// 'include' })` in the SW.

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient: sb } = gate

  // Grab oldest unread message. Table may not exist yet — return a fallback
  // so the SW can still show SOMETHING (the UA will show a generic banner
  // if we return empty).
  const { data } = await sb
    .from('pending_push_messages')
    .select('id, title, body, href, icon, badge, tag')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
    .then(r => r, () => ({ data: null }) as { data: null })

  if (!data) {
    return NextResponse.json({ title: 'Signal Lab', body: 'New activity', href: '/' })
  }

  // Mark consumed so the next push doesn't re-show the same message.
  await sb.from('pending_push_messages').delete().eq('id', data.id).then(() => null, () => null)

  return NextResponse.json({
    title: data.title,
    body: data.body,
    href: data.href || '/',
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    tag: data.tag || undefined,
  })
}
