import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { headers: { 'Accept-Encoding': 'identity' } } }
)

const REDIRECT_URI = () =>
  (process.env.GOOGLE_REDIRECT_URI || 'https://signallabos.com/api/gmail/callback').trim()

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
    // ── Token exchange via raw fetch (googleapis corrupts on CF Workers) ──
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Encoding': 'identity',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: REDIRECT_URI(),
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json() as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      error?: string
      error_description?: string
    }

    if (tokens.error || !tokens.access_token) {
      console.error('[gmail/callback] token exchange error:', tokens.error, tokens.error_description)
      return NextResponse.redirect(
        new URL(`/dashboard?gmail=error&reason=${encodeURIComponent(tokens.error_description || tokens.error || 'Token exchange failed')}`, req.url)
      )
    }

    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token || ''
    const expiryDate = Date.now() + (tokens.expires_in || 3600) * 1000

    // ── Token validation ──
    function isValidTokenString(val: unknown, name: string): val is string {
      if (typeof val !== 'string') {
        console.error(`[gmail/callback] ${name} is not a string: ${typeof val}`)
        return false
      }
      for (let i = 0; i < Math.min(val.length, 5); i++) {
        const c = val.charCodeAt(i)
        if (c < 32 || c > 126) {
          console.error(`[gmail/callback] ${name} contains non-printable char at pos ${i}: charCode=${c}`)
          return false
        }
      }
      if (val.length < 10) {
        console.error(`[gmail/callback] ${name} too short: ${val.length} chars`)
        return false
      }
      return true
    }

    const accessValid = isValidTokenString(accessToken, 'access_token')
    const refreshValid = isValidTokenString(refreshToken, 'refresh_token')

    console.log(`[gmail/callback] Token check: access=${accessValid} (len=${accessToken.length}), refresh=${refreshValid} (len=${refreshToken.length})`)

    if (!accessValid || !refreshValid) {
      console.error('[gmail/callback] CORRUPTED TOKENS — aborting')
      return NextResponse.redirect(
        new URL(`/dashboard?gmail=error&reason=${encodeURIComponent('Token corruption detected')}`, req.url)
      )
    }

    // ── Get user email via raw fetch ──
    let email = 'unknown'
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept-Encoding': 'identity',
        },
      })
      const info = await infoRes.json() as { email?: string }
      email = info.email || 'unknown'
    } catch (emailErr) {
      console.error('[gmail/callback] userinfo error:', emailErr)
    }

    console.log(`[gmail/callback] Authenticated as: ${email}`)

    // Save to connected_email_accounts (upsert on email) — only if email is known
    if (email !== 'unknown') {
      const { error: upsertError } = await supabase.from('connected_email_accounts').upsert({
        email,
        label,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expiry: expiryDate,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' })

      if (upsertError) console.error('[gmail/callback] upsert error:', upsertError)
      else console.log(`[gmail/callback] Saved tokens for ${email}`)
    } else {
      console.error('[gmail/callback] Could not determine email — storing in artist_settings only')
    }

    // Also update legacy artist_settings for backwards compat
    const { data: existing } = await supabase.from('artist_settings').select('id').single()
    const tokenUpdate = {
      gmail_access_token: accessToken,
      gmail_refresh_token: refreshToken,
      gmail_token_expiry: expiryDate,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      await supabase.from('artist_settings').update(tokenUpdate).eq('id', existing.id)
    } else {
      await supabase.from('artist_settings').insert([{ ...tokenUpdate, created_at: new Date().toISOString() }])
    }

    const safeReturn = returnTo && returnTo.startsWith('/') ? returnTo : '/business/settings'
    const sep = safeReturn.includes('?') ? '&' : '?'
    return NextResponse.redirect(new URL(`${safeReturn}${sep}gmail=connected`, req.url))
  } catch (err) {
    console.error('[gmail/callback] fatal error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.redirect(new URL(`/dashboard?gmail=error&reason=${encodeURIComponent(msg)}`, req.url))
  }
}
