import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

    // Validate this is an Instagram comment event
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

export async function handleComment({
  commentId,
  commentText,
  commenterId,
  mediaId,
}: {
  commentId: string
  commentText: string
  commenterId: string
  mediaId: string
}) {
  // Find matching automation for this post
  const { data: automations } = await supabase
    .from('comment_automations')
    .select('*')
    .eq('platform_post_id', mediaId)
    .eq('enabled', true)

  if (!automations?.length) return

  // Get the connected Instagram account token
  const { data: account } = await supabase
    .from('social_accounts')
    .select('token, platform_user_id')
    .eq('platform', 'instagram')
    .single()

  if (!account?.token) return

  for (const automation of automations) {
    const keyword = (automation.trigger_keyword || '◼').toLowerCase()

    // Check if comment contains the trigger keyword
    if (!commentText.includes(keyword)) continue

    // Check if this comment was already processed
    if ((automation.processed_comment_ids || []).includes(commentId)) continue

    // Send the DM
    const sent = await sendInstagramDM({
      accessToken: account.token,
      igUserId: account.platform_user_id,
      recipientId: commenterId,
      message: automation.dm_message,
    })

    if (sent) {
      // Mark comment as processed
      await supabase
        .from('comment_automations')
        .update({
          processed_comment_ids: [...(automation.processed_comment_ids || []), commentId],
          sent_count: (automation.sent_count || 0) + 1,
        })
        .eq('id', automation.id)
    }
  }
}

async function sendInstagramDM({
  accessToken,
  igUserId,
  recipientId,
  message,
}: {
  accessToken: string
  igUserId: string
  recipientId: string
  message: string
}): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
        }),
      }
    )
    const data = await res.json()
    if (!res.ok) {
      console.error('Instagram DM error:', data)
      return false
    }
    // Also pass the access token as query param (Graph API requires it)
    return true
  } catch {
    return false
  }
}
