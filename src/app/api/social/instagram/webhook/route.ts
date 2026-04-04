import { NextRequest, NextResponse } from 'next/server'
import { handleComment, handleDMReply } from '@/lib/instagram'

// GET — Instagram webhook verification
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST — Instagram webhook events (comments + DM replies)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.object !== 'instagram') return NextResponse.json({ ok: true })

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {

        // ── Comment on a post ──────────────────────────────────────────────
        if (change.field === 'comments') {
          const c = change.value
          if (!c?.id || !c?.from?.id || !c?.media?.id) continue
          await handleComment({
            commentId: c.id,
            commentText: (c.text || '').toLowerCase(),
            commenterId: c.from.id,
            mediaId: c.media.id,
          })
        }

        // ── DM reply ───────────────────────────────────────────────────────
        if (change.field === 'messages') {
          const m = change.value
          // Ignore messages sent by the page itself
          if (m?.sender?.id && m?.message?.text && !m?.message?.is_echo) {
            await handleDMReply({
              senderId: m.sender.id,
              messageText: m.message.text,
            })
          }
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: true }) // Always 200 to Instagram
  }
}
