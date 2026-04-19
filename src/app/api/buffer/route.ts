import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireConfirmed } from '@/lib/require-confirmed'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const token = process.env.BUFFER_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Buffer token not configured' }, { status: 500 })

  try {
    const body = await req.json()
    const gate = requireConfirmed(body)
    if (gate) return gate
    const { text, media_urls, channels, post_format } = body

    // Buffer channel IDs — only platforms currently connected
    const channelMap: Record<string, string> = {
      instagram: '69beea2d7be9f8b1717e1de8',
      threads: '69beea687be9f8b1717e1e6a',
      tiktok: '69bef72e7be9f8b1717e55e2',
      // X/Twitter: not yet connected in Buffer
    }

    const channel = channels?.[0] || 'instagram'
    const channelId = channelMap[channel] || channelMap['instagram']

    if (!channelId) {
      return NextResponse.json({ error: `Platform "${channel}" not connected in Buffer` }, { status: 400 })
    }

    const mutation = `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          __typename
          ... on UnexpectedError { message }
        }
      }
    `

    const input: any = {
      channelId,
      text,
      schedulingType: 'automatic',
      mode: 'addToQueue',
    }

    if (media_urls?.length) {
      input.assets = { images: media_urls.map((url: string) => ({ url })) }
    }
    const igType = post_format === 'carousel' ? 'post' : (post_format || 'post')
    input.metadata = { instagram: { type: igType, shouldShareToFeed: post_format !== 'story' } }

    const res = await fetch('https://api.buffer.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query: mutation, variables: { input } }),
    })

    const data = await res.json()
    if (data.errors) return NextResponse.json({ error: data.errors }, { status: 400 })
    const result = data.data?.createPost
    if (result?.__typename === 'UnexpectedError') {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    // Save to scheduled_posts so Calendar picks it up
    try {
      await supabase.from('scheduled_posts').insert({
        platform: channel,
        caption: text,
        format: post_format || 'post',
        scheduled_at: new Date().toISOString(),
        status: 'scheduled',
        media_url: media_urls?.[0] || null,
      })
    } catch {
      // Non-critical — don't fail the post if calendar save fails
    }

    return NextResponse.json({ success: true, result })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
