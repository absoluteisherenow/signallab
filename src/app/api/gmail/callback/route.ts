import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    (process.env.GOOGLE_REDIRECT_URI || 'https://signallabos.com/api/gmail/callback').trim()
  )
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const stateRaw = req.nextUrl.searchParams.get('state') || '{}'

  if (error) return NextResponse.redirect(new URL('/dashboard?gmail=denied', req.url))
  if (!code) return NextResponse.json({ error: 'No code returned from Google' }, { status: 400 })

  let label = 'Primary'
  try { label = JSON.parse(stateRaw).label || 'Primary' } catch {}

  try {
    const oauth2Client = getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // Fetch the user's email address
    let email = 'unknown'
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
      const { data: userInfo } = await oauth2.userinfo.get()
      email = userInfo.email || 'unknown'
    } catch {}

    // Save to connected_email_accounts (upsert on email)
    await supabase.from('connected_email_accounts').upsert({
      email,
      label,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokens.expiry_date,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' })

    // Also update legacy artist_settings for backwards compat
    const { data: existing } = await supabase.from('artist_settings').select('id').single()
    const tokenUpdate = {
      gmail_access_token: tokens.access_token,
      gmail_refresh_token: tokens.refresh_token,
      gmail_token_expiry: tokens.expiry_date,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      await supabase.from('artist_settings').update(tokenUpdate).eq('id', existing.id)
    } else {
      await supabase.from('artist_settings').insert([{ ...tokenUpdate, created_at: new Date().toISOString() }])
    }

    return NextResponse.redirect(new URL('/business/settings?gmail=connected', req.url))
  } catch {
    return NextResponse.redirect(new URL('/dashboard?gmail=error', req.url))
  }
}
