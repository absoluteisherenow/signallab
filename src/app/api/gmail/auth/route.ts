import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://signal-lab-rebuild.vercel.app/api/gmail/callback'
  )
}

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
  }

  const label = req.nextUrl.searchParams.get('label') || 'Primary'
  const oauth2Client = getOAuthClient()

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: JSON.stringify({ label }),
  })

  return NextResponse.redirect(url)
}
