import { NextRequest, NextResponse } from 'next/server'
import { handleComment } from '@/lib/instagram'

// GET — Instagram webhook verification (hub.challenge)
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

// POST — Instagram webhook events (new comments)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.object !== 'instagram') {
      return NextResponse.json({ ok: true })
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'comments') continue

        const commentData = change.value
        const commentId = commentData?.id
        const commentText: string = (commentData?.text || '').toLowerCase()
        const commenterId = commentData?.from?.id
        const mediaId = commentData?.media?.id

        if (!commentId || !commenterId || !mediaId) continue

        await handleComment({ commentId, commentText, commenterId, mediaId })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: true }) // Always 200 to Instagram
  }
}
