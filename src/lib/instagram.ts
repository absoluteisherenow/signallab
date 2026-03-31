import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
  const { data: automations } = await supabase
    .from('comment_automations')
    .select('*')
    .eq('platform_post_id', mediaId)
    .eq('enabled', true)

  if (!automations?.length) return

  const { data: account } = await supabase
    .from('social_accounts')
    .select('token, platform_user_id')
    .eq('platform', 'instagram')
    .single()

  if (!account?.token) return

  const lowerText = commentText.toLowerCase()

  for (const automation of automations) {
    const keyword = (automation.trigger_keyword || '◼').toLowerCase()
    if (!lowerText.includes(keyword)) continue
    if ((automation.processed_comment_ids || []).includes(commentId)) continue

    const sent = await sendInstagramDM({
      accessToken: account.token,
      igUserId: account.platform_user_id,
      recipientId: commenterId,
      message: automation.dm_message,
    })

    if (sent) {
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
          access_token: accessToken,
        }),
      }
    )
    if (!res.ok) {
      const data = await res.json()
      console.error('Instagram DM error:', data)
      return false
    }
    return true
  } catch {
    return false
  }
}
