import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireConfirmed } from '@/lib/require-confirmed'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Account = {
  handle: string
  access_token: string
  refresh_token: string | null
  token_expiry: number | null
  platform_user_id: string | null
}

async function refreshAccessToken(account: Account): Promise<string> {
  if (!account.refresh_token) throw new Error('No refresh_token stored — reconnect YouTube')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  const newExpiry = Date.now() + data.expires_in * 1000
  await supabase
    .from('connected_social_accounts')
    .update({ access_token: data.access_token, token_expiry: newExpiry, updated_at: new Date().toISOString() })
    .eq('platform', 'youtube')
    .eq('handle', account.handle)
  return data.access_token
}

async function ensureFreshToken(account: Account): Promise<string> {
  // Refresh if expired or within 60s of expiry
  if (!account.token_expiry || account.token_expiry - Date.now() < 60_000) {
    return refreshAccessToken(account)
  }
  return account.access_token
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const gate = requireConfirmed(body)
  if (gate) return gate
  const { caption, video_url, title, handle, privacy_status } = body

  if (!video_url) return NextResponse.json({ error: 'YouTube requires a video URL' }, { status: 400 })

  const query = supabase
    .from('connected_social_accounts')
    .select('*')
    .eq('platform', 'youtube')
  if (handle) query.eq('handle', handle)

  const { data: account } = await query.limit(1).single()
  if (!account) return NextResponse.json({ error: 'No YouTube account connected' }, { status: 400 })

  try {
    const accessToken = await ensureFreshToken(account as Account)

    // Fetch the video from R2 / external URL
    const videoRes = await fetch(video_url)
    if (!videoRes.ok) throw new Error(`fetch video_url failed: ${videoRes.status}`)
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer())
    const contentType = videoRes.headers.get('content-type') || 'video/mp4'

    const rawCaption = (caption || '').toString()
    const ytTitle = (title || rawCaption.split('\n')[0] || 'Untitled').slice(0, 100)
    // Auto-tag as Short — NM's YT channel is short-form only. The classifier
    // needs a vertical (9:16) <=3min clip; #Shorts in title/description is the
    // belt-and-braces hint so YT slots it into the Shorts shelf. Idempotent —
    // skip if the caption already carries the tag.
    const hasShorts = /#shorts\b/i.test(rawCaption) || /#shorts\b/i.test(ytTitle)
    const description = (hasShorts ? rawCaption : `${rawCaption}\n\n#Shorts`).slice(0, 5000)

    const metadata = {
      snippet: {
        title: ytTitle,
        description,
        categoryId: '10', // Music
      },
      status: {
        privacyStatus: privacy_status || 'public',
        selfDeclaredMadeForKids: false,
      },
    }

    // Multipart related upload (metadata + media in one request)
    const boundary = `signal-lab-${Date.now()}`
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const metadataPart =
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata)
    const mediaPart =
      `${delimiter}Content-Type: ${contentType}\r\n\r\n`

    const bodyBuffer = Buffer.concat([
      Buffer.from(metadataPart, 'utf8'),
      Buffer.from(mediaPart, 'utf8'),
      videoBuffer,
      Buffer.from(closeDelimiter, 'utf8'),
    ])

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(bodyBuffer.length),
        },
        body: bodyBuffer,
      }
    )
    const uploadData = await uploadRes.json()
    if (!uploadRes.ok || uploadData.error) {
      throw new Error(uploadData.error?.message || `youtube upload failed (${uploadRes.status})`)
    }

    const videoId = uploadData.id

    await supabase.from('social_posts').insert({
      platform: 'youtube',
      handle: account.handle,
      caption: rawCaption,
      media_urls: [video_url],
      posted_at: new Date().toISOString(),
      status: 'posted',
      platform_post_id: videoId,
    })

    return NextResponse.json({ success: true, post_id: videoId, url: `https://youtu.be/${videoId}` })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await supabase.from('social_posts').insert({
      platform: 'youtube',
      handle: account.handle,
      caption: caption || '',
      status: 'failed',
      error_message: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
