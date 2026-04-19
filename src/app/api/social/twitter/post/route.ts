import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireConfirmed } from '@/lib/require-confirmed'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function refreshTwitterToken(account: Record<string, string>) {
  const credentials = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)

  const newExpiry = Date.now() + (data.expires_in * 1000)
  await supabase.from('connected_social_accounts')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || account.refresh_token,
      token_expiry: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq('platform', 'twitter')
    .eq('handle', account.handle)

  return data.access_token
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const gate = requireConfirmed(body)
  if (gate) return gate
  const { text, handle } = body
  if (!text) return NextResponse.json({ error: 'Tweet text required' }, { status: 400 })
  if (text.length > 280) return NextResponse.json({ error: 'Tweet exceeds 280 characters' }, { status: 400 })

  const query = supabase
    .from('connected_social_accounts')
    .select('*')
    .eq('platform', 'twitter')
  if (handle) query.eq('handle', handle)

  const { data: account } = await query.limit(1).single()
  if (!account) return NextResponse.json({ error: 'No X/Twitter account connected' }, { status: 400 })

  try {
    // Refresh token if expired
    let token = account.access_token
    if (account.token_expiry && Date.now() > account.token_expiry - 60000) {
      token = await refreshTwitterToken(account)
    }

    const tweetRes = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })

    const tweetData = await tweetRes.json()
    if (tweetData.errors) throw new Error(tweetData.errors[0]?.message || 'Tweet failed')

    await supabase.from('social_posts').insert({
      platform: 'twitter',
      handle: account.handle,
      caption: text,
      posted_at: new Date().toISOString(),
      status: 'posted',
      platform_post_id: tweetData.data?.id,
    })

    return NextResponse.json({ success: true, tweet_id: tweetData.data?.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await supabase.from('social_posts').insert({
      platform: 'twitter',
      handle: account.handle,
      caption: text,
      status: 'failed',
      error_message: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
