import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'

// HTML that closes the popup and notifies the parent window
function popupResult(status: 'connected' | 'error', data: Record<string, string> = {}) {
  const payload = JSON.stringify({ platform: 'instagram', status, ...data })
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

  const appId = process.env.INSTAGRAM_APP_ID!
  const appSecret = process.env.INSTAGRAM_APP_SECRET!
  const redirectUri = `${APP_URL}/api/social/instagram/callback`

  try {
    // 1. Exchange code for short-lived user access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?` +
      `client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&client_secret=${appSecret}&code=${code}`
    )
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error.message)

    const shortToken = tokenData.access_token

    // 2. Exchange for long-lived token (60 day expiry, refreshable)
    const longRes = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${appId}` +
      `&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    )
    const longData = await longRes.json()
    const longToken = longData.access_token
    const expiresIn = longData.expires_in // seconds

    // 3. Get user's connected pages (needed to access Instagram Business account)
    const pagesRes = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?access_token=${longToken}`
    )
    const pagesData = await pagesRes.json()
    const page = pagesData.data?.[0] // first page — future: let user pick
    const pageId = page?.id
    const pageToken = page?.access_token

    // 4. Get Instagram Business Account linked to the page
    let igUserId = ''
    let handle = 'unknown'
    if (pageId && pageToken) {
      const igRes = await fetch(
        `https://graph.facebook.com/v22.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`
      )
      const igData = await igRes.json()
      igUserId = igData.instagram_business_account?.id || ''

      if (igUserId) {
        const profileRes = await fetch(
          `https://graph.facebook.com/v22.0/${igUserId}?fields=username&access_token=${pageToken}`
        )
        const profileData = await profileRes.json()
        handle = profileData.username ? `@${profileData.username}` : 'unknown'
      }
    }

    const tokenExpiry = Date.now() + (expiresIn * 1000)

    // 5. Save to Supabase
    await supabase.from('connected_social_accounts').upsert({
      platform: 'instagram',
      handle,
      platform_user_id: igUserId,
      access_token: longToken,
      token_expiry: tokenExpiry,
      scope: 'instagram_basic,instagram_content_publish',
      page_id: pageId,
      page_access_token: pageToken,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,handle' })

    return popupResult('connected', { handle })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('Instagram OAuth error:', message)
    return popupResult('error', { reason: message })
  }
}
