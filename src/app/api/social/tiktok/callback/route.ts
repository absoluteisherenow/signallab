import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'

function popupResult(status: 'connected' | 'error', data: Record<string, string> = {}) {
  const payload = JSON.stringify({ platform: 'tiktok', status, ...data })
  return new NextResponse(
    `<!DOCTYPE html><html><body><script>
      try {
        window.opener && window.opener.postMessage(${payload}, '*');
      } catch(e) {}
      window.close();
    </script><p>You can close this window.</p></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) return popupResult('error', { reason: error || 'no_code' })

  const clientKey = process.env.TIKTOK_CLIENT_KEY!
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!
  const redirectUri = `${APP_URL}/api/social/tiktok/callback`

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)

    const { access_token, refresh_token, expires_in, open_id, scope } = tokenData

    // Get user profile
    const profileRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=display_name,username,avatar_url',
      { headers: { Authorization: `Bearer ${access_token}` } }
    )
    const profileData = await profileRes.json()
    const username = profileData.data?.user?.username || profileData.data?.user?.display_name || 'unknown'
    const handle = `@${username}`

    const tokenExpiry = Date.now() + (expires_in * 1000)

    await supabase.from('connected_social_accounts').upsert({
      platform: 'tiktok',
      handle,
      platform_user_id: open_id,
      access_token,
      refresh_token: refresh_token || null,
      token_expiry: tokenExpiry,
      scope,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,handle' })

    const response = popupResult('connected', { handle })
    response.cookies.set('tiktok_state', '', { maxAge: 0, path: '/' })
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('TikTok OAuth error:', message)
    return popupResult('error', { reason: message })
  }
}
