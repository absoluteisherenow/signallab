import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'

function base64URLEncode(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function GET(req: NextRequest) {
  const clientId = process.env.TWITTER_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Twitter app not configured' }, { status: 500 })
  }

  // PKCE — Twitter OAuth 2.0 requires it
  const codeVerifier = base64URLEncode(crypto.randomBytes(32))
  const codeChallenge = base64URLEncode(
    crypto.createHash('sha256').update(codeVerifier).digest()
  )

  const redirectUri = `${APP_URL}/api/social/twitter/callback`
  const state = base64URLEncode(crypto.randomBytes(16))

  const url = new URL('https://twitter.com/i/oauth2/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'tweet.read tweet.write users.read offline.access')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  // Store code_verifier in a short-lived cookie for the callback to read
  const response = NextResponse.redirect(url.toString())
  response.cookies.set('twitter_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}
