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

    const channelIds = (channels || ['instagram']).map((c: string) => channelMap[c]).filter(Boolean)

    const mutation = `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            posts { id }
          }
          ... on PostActionError {
            error { message }
          }
        }
      }
    `

    const input: any = {
      channelIds,
      text,
      organizationId: '69bee780f2367be07c0390d7',
    }

    if (media_url) input.assets = [{ url: media_url, type: 'IMAGE' }]

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
    return NextResponse.json(data.data)

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
