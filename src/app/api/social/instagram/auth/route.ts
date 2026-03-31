import { NextRequest, NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signal-lab-rebuild.vercel.app'

export async function GET(req: NextRequest) {
  const appId = process.env.INSTAGRAM_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'Instagram app not configured' }, { status: 500 })
  }

  const redirectUri = `${APP_URL}/api/social/instagram/callback`

  // Scopes needed for Signal Lab OS:
  // instagram_basic       — read profile + media
  // instagram_content_publish — post on behalf of user
  // pages_show_list       — list pages (needed to get page token)
  // pages_read_engagement — read page info
  const scope = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_messages',
    'pages_show_list',
    'pages_read_engagement',
    'pages_messaging',
  ].join(',')

  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scope)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', 'instagram_connect')

  return NextResponse.redirect(url.toString())
}
