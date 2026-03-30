import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'

export async function GET(req: NextRequest) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  if (!clientKey) {
    return NextResponse.json({ error: 'TikTok app not configured' }, { status: 500 })
  }

  const redirectUri = `${APP_URL}/api/social/tiktok/callback`
  const state = crypto.randomBytes(16).toString('hex')

  // TikTok scopes for content publishing
  const scope = 'user.info.basic,video.publish,video.upload'

  const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
  url.searchParams.set('client_key', clientKey)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scope)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)

  const response = NextResponse.redirect(url.toString())
  response.cookies.set('tiktok_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
