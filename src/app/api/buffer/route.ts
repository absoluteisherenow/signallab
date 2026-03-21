import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const token = process.env.BUFFER_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Buffer token not configured' }, { status: 500 })

  try {
    const { text, media_url, channels } = await req.json()

    const channelMap: Record<string, string> = {
      instagram: '69beea2d7be9f8b1717e1de8',
      threads: '69beea687be9f8b1717e1e6a',
      tiktok: '69bef72e7be9f8b1717e55e2',
    }

    const channel = channels?.[0] || 'instagram'
    const channelId = channelMap[channel] || channelMap['instagram']

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

    if (media_url) input.assets = { images: [{ url: media_url }] }

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
    return NextResponse.json({ success: true, result })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
