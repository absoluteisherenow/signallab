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
  // Load enabled automations — post-specific OR global (no platform_post_id)
  const { data: automations } = await supabase
    .from('comment_automations')
    .select('*')
    .eq('enabled', true)
    .or(`platform_post_id.eq.${mediaId},platform_post_id.is.null`)

  if (!automations?.length) return

  // Get connected Instagram token
  const { data: account } = await supabase
    .from('connected_social_accounts')
    .select('access_token, platform_user_id')
    .eq('platform', 'instagram')
    .single()

  if (!account?.access_token) return

  const lowerText = commentText.toLowerCase()

  for (const automation of automations) {
    const keyword = (automation.trigger_keyword || '').toLowerCase().trim()
    // Empty keyword = trigger on any comment; otherwise match substring
    if (keyword && !lowerText.includes(keyword)) continue
    // Skip if already processed this comment for this automation
    if ((automation.processed_comment_ids || []).includes(commentId)) continue

    // Send DM
    const sent = await sendInstagramDM({
      accessToken: account.access_token,
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

      // Capture lead — look up their profile first
      const profile = await fetchIGProfile(commenterId, account.access_token)

      await supabase
        .from('dm_leads')
        .upsert({
          automation_id: automation.id,
          campaign_name: automation.campaign_name,
          instagram_user_id: commenterId,
          username: profile?.username || null,
          follower_count: profile?.followers_count || null,
          biography: profile?.biography || null,
          post_id: mediaId,
          comment_text: commentText,
          dm_sent: true,
          triggered_at: new Date().toISOString(),
        }, { onConflict: 'instagram_user_id,automation_id' })
    }
  }
}

async function fetchIGProfile(
  igUserId: string,
  accessToken: string
): Promise<{ username?: string; followers_count?: number; biography?: string } | null> {
  try {
    const res = await fetch(
      `https://graph.instagram.com/v25.0/${igUserId}?fields=username,followers_count,biography&access_token=${accessToken}`
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
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
