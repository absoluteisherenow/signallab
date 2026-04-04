import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Comment trigger ────────────────────────────────────────────────────────
// Called when someone comments on a post. Checks for matching automations,
// starts a DM conversation to collect email in-app.

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
  // Load enabled automations — post-specific OR global
  const { data: automations } = await supabase
    .from('comment_automations')
    .select('*')
    .eq('enabled', true)
    .or(`platform_post_id.eq.${mediaId},platform_post_id.is.null`)

  if (!automations?.length) return

  const account = await getConnectedAccount()
  if (!account) return

  const lowerText = commentText.toLowerCase()

  for (const automation of automations) {
    const keyword = (automation.trigger_keyword || '').toLowerCase().trim()
    if (keyword && !lowerText.includes(keyword)) continue
    if ((automation.processed_comment_ids || []).includes(commentId)) continue

    // Don't re-trigger if already in active conversation
    const { data: existing } = await supabase
      .from('dm_conversations')
      .select('id')
      .eq('instagram_user_id', commenterId)
      .eq('automation_id', automation.id)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (existing) continue

    // Build the opening DM — ask for email directly in conversation
    const openingDM = buildOpeningMessage(automation)
    const sent = await sendDM(account.access_token, account.platform_user_id, commenterId, openingDM)

    if (sent) {
      // Mark comment processed
      await supabase
        .from('comment_automations')
        .update({
          processed_comment_ids: [...(automation.processed_comment_ids || []), commentId],
          sent_count: (automation.sent_count || 0) + 1,
        })
        .eq('id', automation.id)

      // Open conversation state — waiting for email reply
      await supabase.from('dm_conversations').upsert({
        instagram_user_id: commenterId,
        automation_id: automation.id,
        state: automation.follow_required ? 'pending_follow' : 'pending_email',
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'instagram_user_id,automation_id' })

      // Create lead record now — update with email when they reply
      const profile = await fetchIGProfile(commenterId, account.access_token)
      await supabase.from('dm_leads').upsert({
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

// ─── DM reply handler ───────────────────────────────────────────────────────
// Called when someone sends a DM. Checks if they're in an active conversation
// and processes their reply (follow confirm, email, etc.)

export async function handleDMReply({
  senderId,
  messageText,
}: {
  senderId: string
  messageText: string
}) {
  // Find active conversation for this user
  const { data: conversation } = await supabase
    .from('dm_conversations')
    .select('*, comment_automations(*)')
    .eq('instagram_user_id', senderId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conversation) return // No active conversation — ignore

  const automation = conversation.comment_automations
  const account = await getConnectedAccount()
  if (!account) return

  const text = messageText.trim()

  // ── State: pending_follow ──
  if (conversation.state === 'pending_follow') {
    const lowerText = text.toLowerCase()
    const confirming = ['yes', 'done', 'following', 'followed', 'yep', 'yeah', 'ok', 'yup'].some(w => lowerText.includes(w))
    if (confirming) {
      await supabase.from('dm_conversations').update({ state: 'pending_email' }).eq('id', conversation.id)
      await sendDM(account.access_token, account.platform_user_id, senderId,
        `perfect — now just reply with your email address and i'll send it straight over 🖤`)
    } else {
      await sendDM(account.access_token, account.platform_user_id, senderId,
        `follow @nightmanoeuvres first, then reply "done" and you're in 🖤`)
    }
    return
  }

  // ── State: pending_email ──
  if (conversation.state === 'pending_email') {
    const email = extractEmail(text)
    if (!email) {
      await sendDM(account.access_token, account.platform_user_id, senderId,
        `hmm, that doesn't look like an email — just reply with your email address and you're in`)
      return
    }

    // Save email to lead
    await supabase
      .from('dm_leads')
      .update({ email })
      .eq('instagram_user_id', senderId)
      .eq('automation_id', automation.id)

    // Mark conversation complete
    await supabase.from('dm_conversations').update({ state: 'complete' }).eq('id', conversation.id)

    // Send reward
    const rewardMsg = buildRewardMessage(automation)
    await sendDM(account.access_token, account.platform_user_id, senderId, rewardMsg)
    return
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildOpeningMessage(automation: any): string {
  if (automation.follow_required) {
    return `hey 🖤 to get ${rewardLabel(automation.reward_type)}, follow @nightmanoeuvres first then reply "done" here and i'll send it straight over`
  }
  return `hey 🖤 just reply with your email address and i'll send ${rewardLabel(automation.reward_type)} straight to your inbox`
}

function buildRewardMessage(automation: any): string {
  if (automation.reward_url) {
    return `you're in 🖤 here's ${rewardLabel(automation.reward_type)}: ${automation.reward_url}`
  }
  return `you're in 🖤 check your inbox — ${rewardLabel(automation.reward_type)} is on its way`
}

function rewardLabel(type: string): string {
  const labels: Record<string, string> = {
    download: 'the free download',
    stream: 'the stream link',
    buy: 'the link to buy',
    discount: 'your discount code',
    tickets: 'the ticket link',
    presave: 'the presave link',
    other: 'the link',
  }
  return labels[type] || 'the link'
}

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
  return match ? match[0].toLowerCase() : null
}

async function getConnectedAccount(): Promise<{ access_token: string; platform_user_id: string } | null> {
  const { data } = await supabase
    .from('connected_social_accounts')
    .select('access_token, platform_user_id, token_expiry')
    .eq('platform', 'instagram')
    .single()
  if (!data?.access_token) return null
  if (data.token_expiry && Date.now() > Number(data.token_expiry)) return null
  return data
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

async function sendDM(accessToken: string, igUserId: string, recipientId: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
        access_token: accessToken,
      }),
    })
    if (!res.ok) {
      console.error('Instagram DM error:', await res.json())
      return false
    }
    return true
  } catch {
    return false
  }
}
