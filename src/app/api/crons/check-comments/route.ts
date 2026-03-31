import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleComment } from '@/lib/instagram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Vercel cron: runs every 30 min
// Polls recent Instagram posts with active comment automations
// Fallback for when webhooks aren't configured

export async function GET(req: NextRequest) {
  try {
    // Get active automations
    const { data: automations } = await supabase
      .from('comment_automations')
      .select('platform_post_id, trigger_keyword, processed_comment_ids')
      .eq('enabled', true)
      .not('platform_post_id', 'is', null)

    if (!automations?.length) return NextResponse.json({ checked: 0 })

    // Get Instagram token
    const { data: account } = await supabase
      .from('social_accounts')
      .select('token, platform_user_id')
      .eq('platform', 'instagram')
      .single()

    if (!account?.token) return NextResponse.json({ error: 'No Instagram account connected' })

    let checked = 0
    let triggered = 0

    const postIds = [...new Set(automations.map(a => a.platform_post_id))]

    for (const mediaId of postIds) {
      try {
        // Fetch recent comments from Instagram Graph API
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${mediaId}/comments?fields=id,text,from&access_token=${account.token}&limit=50`,
          { signal: AbortSignal.timeout(10000) }
        )
        if (!res.ok) continue

        const data = await res.json()
        const comments: { id: string; text: string; from?: { id: string } }[] = data.data || []

        for (const comment of comments) {
          if (!comment.from?.id) continue

          await handleComment({
            commentId: comment.id,
            commentText: comment.text || '',
            commenterId: comment.from.id,
            mediaId,
          })
          triggered++
        }
        checked++
      } catch {
        continue
      }
    }

    return NextResponse.json({ checked, triggered })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
