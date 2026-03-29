import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

// Use service role key to bypass RLS when storing OAuth tokens
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://signal-lab-rebuild.vercel.app/api/gmail/callback'
  )
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL('/dashboard?gmail=denied', req.url)
    )
  }

  if (!code) {
    return NextResponse.json({ error: 'No code returned from Google' }, { status: 400 })
  }

  try {
    const oauth2Client = getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)

    // Persist tokens in Supabase artist_settings
    const { data: existing } = await supabase
      .from('artist_settings')
      .select('id')
      .single()

    if (existing) {
      await supabase
        .from('artist_settings')
        .update({
          gmail_access_token: tokens.access_token,
          gmail_refresh_token: tokens.refresh_token,
          gmail_token_expiry: tokens.expiry_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('artist_settings').insert([{
        gmail_access_token: tokens.access_token,
        gmail_refresh_token: tokens.refresh_token,
        gmail_token_expiry: tokens.expiry_date,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
    }

    return NextResponse.redirect(
      new URL('/dashboard?gmail=connected', req.url)
    )
  } catch (err: unknown) {
    console.error('Gmail OAuth error:', err)
    return NextResponse.redirect(
      new URL('/dashboard?gmail=error', req.url)
    )
  }
}
