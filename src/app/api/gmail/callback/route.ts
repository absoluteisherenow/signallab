import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { headers: { 'Accept-Encoding': 'identity' } } }
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
  let returnTo: string | null = null
  try {
    const parsed = JSON.parse(stateRaw)
    label = parsed.label || 'Primary'
    returnTo = typeof parsed.returnTo === 'string' ? parsed.returnTo : null
  } catch {}

  try {
    const oauth2Client = getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)

    // ── Token validation ─────────────────────────────────────────────
    // On Cloudflare Workers, the googleapis library can sometimes return
    // gzipped/binary blobs instead of proper token strings. Validate
    // before storing to avoid corrupting the DB.
    function isValidTokenString(val: unknown, name: string): val is string {
      if (typeof val !== 'string') {
        console.error(`[gmail/callback] ${name} is not a string: ${typeof val}`)
        return false
      }
      // Check for binary/gzip corruption (gzip starts with 0x1f 0x8b)
      for (let i = 0; i < Math.min(val.length, 5); i++) {
        const code = val.charCodeAt(i)
        if (code < 32 || code > 126) {
          console.error(`[gmail/callback] ${name} contains non-printable char at pos ${i}: charCode=${code}`)
          return false
        }
      }
      if (val.length < 10) {
        console.error(`[gmail/callback] ${name} too short: ${val.length} chars`)
        return false
      }
      return true
    }

    const accessValid = isValidTokenString(tokens.access_token, 'access_token')
    const refreshValid = isValidTokenString(tokens.refresh_token, 'refresh_token')

    console.log(`[gmail/callback] Token check: access=${accessValid} (len=${String(tokens.access_token).length}, first5=${String(tokens.access_token).slice(0, 5)}), refresh=${refreshValid} (len=${String(tokens.refresh_token).length}, first5=${String(tokens.refresh_token).slice(0, 5)})`)

    if (!accessValid || !refreshValid) {
      console.error('[gmail/callback] CORRUPTED TOKENS — aborting. Tokens may be gzipped. Raw types:', typeof tokens.access_token, typeof tokens.refresh_token)
      return NextResponse.redirect(
        new URL(`/dashboard?gmail=error&reason=${encodeURIComponent('Token corruption detected — please try again or contact support')}`, req.url)
      )
    }

    oauth2Client.setCredentials(tokens)

    // Fetch the user's email address
    let email = 'unknown'
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
      const { data: userInfo } = await oauth2.userinfo.get()
      email = userInfo.email || 'unknown'
    } catch (emailErr) {
      console.error('[gmail/callback] userinfo error:', emailErr)
    }

    // Refuse to store "unknown" email — it causes ghost rows in the DB
    if (email === 'unknown') {
      console.error('[gmail/callback] Could not determine email — storing tokens in artist_settings only')
    }

    // Save to connected_email_accounts (upsert on email) — only if email is known
    if (email !== 'unknown') {
      const { error: upsertError } = await supabase.from('connected_email_accounts').upsert({
        email,
        label,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: tokens.expiry_date,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' })

      if (upsertError) console.error('[gmail/callback] upsert error:', upsertError)
    }

    // Also update legacy artist_settings for backwards compat
    const { data: existing } = await supabase.from('artist_settings').select('id').single()
    const tokenUpdate = {
      gmail_access_token: tokens.access_token,
      gmail_refresh_token: tokens.refresh_token,
      gmail_token_expiry: tokens.expiry_date,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      const { error: updateError } = await supabase.from('artist_settings').update(tokenUpdate).eq('id', existing.id)
      if (updateError) console.error('[gmail/callback] artist_settings update error:', updateError)
    } else {
      await supabase.from('artist_settings').insert([{ ...tokenUpdate, created_at: new Date().toISOString() }])
    }

    // If the OAuth flow originated from onboarding (or elsewhere), return there.
    // Only allow same-origin relative paths to avoid open-redirect.
    const safeReturn = returnTo && returnTo.startsWith('/') ? returnTo : '/business/settings'
    const sep = safeReturn.includes('?') ? '&' : '?'
    return NextResponse.redirect(new URL(`${safeReturn}${sep}gmail=connected`, req.url))
  } catch (err) {
    console.error('[gmail/callback] fatal error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.redirect(new URL(`/dashboard?gmail=error&reason=${encodeURIComponent(msg)}`, req.url))
  }
}
