import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'

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
    // 1. Exchange code for short-lived Facebook User Access Token
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    })
    const tokenRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?${tokenParams.toString()}`
    )
    const tokenData = await tokenRes.json()
    if (tokenData.error) {
      throw new Error(tokenData.error.message || 'Token exchange failed')
    }

    const shortToken = tokenData.access_token

    // 2. Exchange for long-lived token (60 day expiry)
    const longParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    })
    const longRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?${longParams.toString()}`
    )
    const longData = await longRes.json()
    if (longData.error) throw new Error(longData.error.message || 'Long-lived token exchange failed')

    const longToken = longData.access_token
    const expiresIn = longData.expires_in || 5184000

    // 3. Get Instagram Business Account via Facebook Pages
    let igUserId = ''
    let handle = 'unknown'

    // Try direct link first
    const meRes = await fetch(
      `https://graph.facebook.com/me?fields=instagram_business_account{id,username}&access_token=${longToken}`
    )
    const meData = await meRes.json()

    if (meData.instagram_business_account?.id) {
      igUserId = meData.instagram_business_account.id
      handle = meData.instagram_business_account.username
        ? `@${meData.instagram_business_account.username}`
        : 'unknown'
    } else {
      // Fall back to Pages → Instagram account
      const pagesRes = await fetch(
        `https://graph.facebook.com/me/accounts?fields=instagram_business_account{id,username},access_token&access_token=${longToken}`
      )
      const pagesData = await pagesRes.json()
      const page = (pagesData.data || []).find((p: any) => p.instagram_business_account)
      if (page?.instagram_business_account) {
        igUserId = page.instagram_business_account.id
        handle = page.instagram_business_account.username
          ? `@${page.instagram_business_account.username}`
          : 'unknown'
      }
    }

    if (!igUserId) throw new Error('No Instagram Business account found — make sure your Instagram is a Business or Creator account linked to a Facebook Page')

    const tokenExpiry = Date.now() + (expiresIn * 1000)

    // 4. Save to Supabase
    await supabase.from('connected_social_accounts').upsert({
      platform: 'instagram',
      handle,
      platform_user_id: igUserId,
      access_token: longToken,
      token_expiry: tokenExpiry,
      scope: 'instagram_business_basic,instagram_business_content_publish',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,handle' })

    return popupResult('connected', { handle })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('Instagram OAuth error:', message)
    return popupResult('error', { reason: message })
  }
}
