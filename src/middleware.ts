import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Paths accessible without a login session
const PUBLIC_PATHS = [
  '/login',
  '/waitlist',  // canonical public marketing page (animated hero + waitlist form)
  '/advance',   // external advance request forms (promoters/venues fill these in)
  '/upload',    // public media upload links (pre-show briefs)
  '/privacy',   // public privacy policy (required for Meta App Review)
  '/terms',     // public terms of service (required for TikTok App Review)
  '/go',        // promo landing pages for DJs (reaction-gated download)
  '/brt',       // brutalist marketing landing (preview)
  '/nm-pitch',  // NM visual identity pitch doc (shareable, no login required)
  '/gl',        // public guest-list signup pages (/gl/<slug>)
]

// Legacy marketing URLs → canonical /waitlist
const LEGACY_MARKETING_REDIRECTS = ['/join', '/landing', '/landing/pricing', '/pricing']

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // ── Legacy marketing URL redirects ───────────────────────────────────────
  if (LEGACY_MARKETING_REDIRECTS.some(p => pathname === p)) {
    return NextResponse.redirect(new URL('/waitlist', req.url))
  }

  // ── Root `/` ─────────────────────────────────────────────────────────────
  // Marketing page for unauth visitors. Authed users skip the marketing page
  // and land in the dashboard. We do NOT want a returning artist to see the
  // pitch every time they open the app.
  // `?preview=1` lets authed users review the marketing page without logging out.
  if (pathname === '/') {
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] || ''
    const hasSession =
      req.cookies.get('sb-access-token')?.value ||
      req.cookies.get(`sb-${projectRef}-auth-token`)?.value ||
      req.cookies.get(`sb-${projectRef}-auth-token.0`)?.value
    if (hasSession) {
      return NextResponse.redirect(new URL('/today', req.url))
    }
    // Unauthed → canonical marketing page
    return NextResponse.redirect(new URL('/waitlist', req.url))
  }

  // HMAC-signed invoice approval page — SMS recipient (Anthony) taps on
  // mobile where he isn't logged in. The token IS the authorisation. Never
  // force a login redirect here.
  const isApprovePage = /^\/invoices\/[^/]+\/approve$/.test(pathname)

  // Apple Universal Links validation — iOS fetches without cookies. MUST be
  // public or iOS discards the app association silently and falls back to
  // opening the URL in Safari. Same story for webcredentials.
  const isAppleWellKnown =
    pathname === '/apple-app-site-association' ||
    pathname === '/.well-known/apple-app-site-association'

  const isPublic = isApprovePage
    || isAppleWellKnown
    || PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
    || pathname.startsWith('/api/auth')     // Supabase auth callbacks — public
    || pathname.startsWith('/auth')         // Supabase OAuth redirect — public
    || pathname.startsWith('/api/waitlist') // waitlist signup — public
    || pathname.startsWith('/api/social')   // social OAuth callbacks — public
    || pathname.startsWith('/api/advance')  // advance form submissions — public
    || pathname.startsWith('/api/invoices') // invoice view for promoters — public
    || pathname.startsWith('/api/gmail')    // Gmail cron + OAuth callbacks
    || pathname.startsWith('/api/agents')   // Vercel cron agents (weekly-content, post-gig, etc.)
    || pathname.startsWith('/api/crons')    // Vercel cron jobs (night-before, sync-performance, etc.)
    || pathname.startsWith('/api/promo')       // promo system (blast, click, stats, reactions)
    || pathname.startsWith('/api/tracks')  // Set Lab tracks API (uses service role key)
    || pathname.startsWith('/api/sets')    // Set Lab sets API
    || pathname.startsWith('/api/artist-scan') // artist scan API
    || pathname.startsWith('/api/instagram')   // instagram sync API
    || pathname.startsWith('/api/sms')        // Twilio inbound SMS webhook
    || pathname.startsWith('/api/crew-briefing') // crew briefing send endpoint
    || pathname.startsWith('/api/upload')     // public file upload (photographer content)
    || pathname.startsWith('/api/media/scan') // auto-scan after upload (server-side)
    || pathname.startsWith('/api/gl')         // public guest-list submission endpoints
    || pathname.startsWith('/_next')
    || pathname === '/signal-genius.html'   // M4L jweb — public
    || pathname === '/mockup.html'

  if (isPublic) {
    return NextResponse.next()
  }

  // Check for a Supabase session cookie (auth-helpers sets sb-<ref>-auth-token)
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] || ''
  const token =
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get(`sb-${projectRef}-auth-token`)?.value ||
    req.cookies.get(`sb-${projectRef}-auth-token.0`)?.value

  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$|.*\\.webp$|manifest\\.json$|sw\\.js$).*)'],
}
