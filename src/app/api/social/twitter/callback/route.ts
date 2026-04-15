import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

function popupResult(status: 'connected' | 'error', data: Record<string, string> = {}) {
  const payload = JSON.stringify({ platform: 'twitter', status, ...data })
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
  const codeVerifier = req.cookies.get('twitter_code_verifier')?.value

  if (error || !code) return popupResult('error', { reason: error || 'no_code' })
  if (!codeVerifier) return popupResult('error', { reason: 'session_expired' })

  const clientId = process.env.TWITTER_CLIENT_ID!
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!
  const redirectUri = `${APP_URL}/api/social/twitter/callback`

  try {
    // Exchange code for tokens
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)

    const { access_token, refresh_token, expires_in, scope } = tokenData

    // Get user profile
    const profileRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const profileData = await profileRes.json()
    const handle = profileData.data?.username ? `@${profileData.data.username}` : 'unknown'
    const userId = profileData.data?.id || ''

    const tokenExpiry = Date.now() + (expires_in * 1000)

    await supabase.from('connected_social_accounts').upsert({
      platform: 'twitter',
      handle,
      platform_user_id: userId,
      access_token,
      refresh_token: refresh_token || null,
      token_expiry: tokenExpiry,
      scope,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,handle' })

    const response = popupResult('connected', { handle })
    // Clear the verifier cookie
    response.cookies.set('twitter_code_verifier', '', { maxAge: 0, path: '/' })
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('Twitter OAuth error:', message)
    return popupResult('error', { reason: message })
  }
}
