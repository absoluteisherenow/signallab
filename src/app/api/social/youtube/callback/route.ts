import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

function popupResult(status: 'connected' | 'error', data: Record<string, string> = {}) {
  const payload = JSON.stringify({ platform: 'youtube', status, ...data })
  return new NextResponse(
    `<!DOCTYPE html><html><body><script>
      try { window.opener && window.opener.postMessage(${payload}, '*'); } catch(e) {}
      window.close();
    </script><p>You can close this window.</p></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  if (error || !code) return popupResult('error', { reason: error || 'no_code' })

  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const redirectUri = `${APP_URL}/api/social/youtube/callback`

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)

    const { access_token, refresh_token, expires_in, scope } = tokenData
    const tokenExpiry = Date.now() + expires_in * 1000

    // Fetch the authed channel to use as handle
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${access_token}` } }
    )
    const channelData = await channelRes.json()
    const channel = channelData.items?.[0]
    const channelId = channel?.id || 'unknown'
    const title = channel?.snippet?.title || 'YouTube Channel'
    const customUrl = channel?.snippet?.customUrl // e.g. "@nightmanoeuvres"
    const handle = customUrl?.startsWith('@') ? customUrl : `@${title.replace(/\s+/g, '').toLowerCase()}`

    await supabase.from('connected_social_accounts').upsert({
      platform: 'youtube',
      handle,
      platform_user_id: channelId,
      access_token,
      refresh_token: refresh_token || null,
      token_expiry: tokenExpiry,
      scope,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,handle' })

    const response = popupResult('connected', { handle })
    response.cookies.set('youtube_state', '', { maxAge: 0, path: '/' })
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('YouTube OAuth error:', message)
    return popupResult('error', { reason: message })
  }
}
